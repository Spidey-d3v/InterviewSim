'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

// Hooks
import { useVisionSession } from '../hooks/useVisionSession';
import { useChunkedRecorder } from '../hooks/useChunkedRecorder';
import { useConvFlowRoom } from '../hooks/useConvFlowRoom';

// Modular Components
import CalibrationFlow from './CalibrationFlow';
import ResultsModal from './interview/ResultsModal';
import AnalyticsPanel from './interview/AnalyticsPanel';
import { InterviewHeader, InterviewMainDisplay, InterviewControls } from './interview/InterviewUI';

// Types & Utils
import {
  type PersistedQuestionMetric,
  type InterviewPhaseScores,
  type QuestionStatus
} from '../../types/interview';
import { formatTime, mean, buildChunkGazeDistribution } from '../../utils/interview-metrics';

interface QuestionMeta {
  phase?: string;
  stream_id?: string;
  is_final?: boolean;
}

/**
 * InterviewRoom Component
 * 
 * The main orchestration layer for the AI interview experience.
 * It manages the camera stream, voice connection, and behavioral analysis.
 */
import { getLiveKitToken, clearLiveKitToken } from '../../utils/livekitToken';

export default function InterviewRoom() {
  const router = useRouter();

  // -- Refs for persistent state without re-renders --
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const endingInterviewRef = useRef(false);
  const questionContextRef = useRef({ questionIndex: 0, questionText: 'Introduce yourself.', phase: 'intro' });
  const chunkQuestionMapRef = useRef<Record<string, { question_index: number; question_text: string; phase: string }>>({});
  const candidateAnswerMapRef = useRef<Record<number, string>>({});

  // -- Component State --
  const [recordingTime, setRecordingTime] = useState(0);
  const [showCalibration, setShowCalibration] = useState(true);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // -- AI Conversation State --
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionStatus, setQuestionStatus] = useState<QuestionStatus>('waiting');
  const [streamingQuestion, setStreamingQuestion] = useState<string | null>(null);
  const [, setActiveQuestionStreamId] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string>('intro');

  // -- Session/Persistence State --
  const [interviewSessionId, setInterviewSessionId] = useState<string | null>(null);
  const [interviewStartedAt, setInterviewStartedAt] = useState<string | null>(null);
  const [persistingSession, setPersistingSession] = useState(false);
  const [sessionPersisted, setSessionPersisted] = useState(false);
  const [sessionPersistError, setSessionPersistError] = useState<string | null>(null);
  const [finalScores, setFinalScores] = useState<Record<string, InterviewPhaseScores> | null>(null);

  // -- Core Logic Hooks --
  const {
    isConnected: visionConnected,
    latestConfidence,
    chunkResults,
    latestVoiceScore,
    pendingChunks,
    chunkErrors,
    dismissChunkError,
    processChunk,
    error: visionError,
  } = useVisionSession();

  const {
    stream: cameraStream,
    isRecording: isChunkRecording,
    chunkCount,
    pendingUploads,
    requestPermissions,
    start: startRecorder,
    stop: stopRecorder,
    flushChunk,
    releaseStream,
  } = useChunkedRecorder({
    onChunkReady: (videoPath, chunkId, chunkIndex) => {
      const qCtx = questionContextRef.current;
      chunkQuestionMapRef.current[chunkId] = {
        question_index: qCtx.questionIndex,
        question_text: qCtx.questionText,
        phase: qCtx.phase,
      };
      processChunk(videoPath, chunkId, chunkIndex);
    },
    onError: (msg) => console.error('[Recorder]', msg),
  });

  // -- Callbacks for Child Components --
  const handleNewQuestion = useCallback((questionText: string, meta?: QuestionMeta) => {
    // The backend sends 'question_text' in the payload, but onNewQuestion 
    // is called with (msg.question_text || msg.text).
    const normalized = questionText?.trim();
    if (!normalized) return;

    if (meta?.phase) setCurrentPhase(meta.phase);
    if (meta?.stream_id) setActiveQuestionStreamId(meta.stream_id);

    if (meta?.is_final) {
      setAiQuestions((prev) => {
        if (prev.length > 0 && prev[prev.length - 1] === normalized) return prev;
        const next = [...prev, normalized];
        setQuestionIndex(next.length - 1);
        return next;
      });
      setStreamingQuestion(null);
      setActiveQuestionStreamId(null);
      setQuestionStatus('ready');
    } else {
      setStreamingQuestion(normalized);
      setQuestionStatus('streaming');
    }
  }, []);

  const handleTurnEnd = useCallback((transcript?: string) => {
    flushChunk();
    if (transcript) candidateAnswerMapRef.current[questionContextRef.current.questionIndex] = transcript;
    if (interviewStarted) {
      setStreamingQuestion(null);
      setActiveQuestionStreamId(null);
      setQuestionStatus('processing');
    }
  }, [flushChunk, interviewStarted]);

  const buildQuestionMetrics = useCallback((): PersistedQuestionMetric[] => {
    const grouped = new Map<number, PersistedQuestionMetric>();

    // 1. Group chunks by their corresponding question
    [...chunkResults].sort((a, b) => a.chunkIndex - b.chunkIndex).forEach((chunk) => {
      const qCtx = chunkQuestionMapRef.current[chunk.chunkId] || { question_index: 0, question_text: 'Intro', phase: 'intro' };

      if (!grouped.has(qCtx.question_index)) {
        grouped.set(qCtx.question_index, {
          question_index: qCtx.question_index,
          question_text: qCtx.question_text,
          candidate_answer: candidateAnswerMapRef.current[qCtx.question_index],
          phase: qCtx.phase,
          chunks: [],
          question_averages: { confidence_score: null, voice_score: null },
        });
      }

      // Map ChunkResult (Frontend) to ChunkMetricModel (Backend)
      const mappedChunk = {
        chunk_id: chunk.chunkId,
        chunk_index: chunk.chunkIndex,
        question_index: qCtx.question_index,
        question_text: qCtx.question_text,
        confidence_score: (chunk.predictions.length > 0 ? chunk.predictions.at(-1)?.confidence : null) ?? null,
        voice_score: chunk.voice_analysis?.score ?? null,
        gaze_distribution: buildChunkGazeDistribution(chunk),
        smart_turn_probability: null,
        smart_turn_is_complete: null,
      };

      grouped.get(qCtx.question_index)?.chunks.push(mappedChunk);
    });

    // 2. Calculate the ACTUAL averages for each question group
    const metrics = Array.from(grouped.values());
    metrics.forEach((m) => {
      const confs = m.chunks.map(c => c.confidence_score);
      const voices = m.chunks.map(c => c.voice_score);

      m.question_averages = {
        confidence_score: mean(confs),
        voice_score: mean(voices),
      };
    });

    return metrics;
  }, [chunkResults]);

  const handlePersistSession = useCallback(async (): Promise<boolean> => {
    if (persistingSession || sessionPersisted || !interviewSessionId || !currentUserId) {
      console.warn('⚠️ handlePersistSession guard failed:', {
        persistingSession, sessionPersisted,
        hasSessionId: !!interviewSessionId,
        hasUserId: !!currentUserId,
      });
      return false;
    }
    setPersistingSession(true);
    setSessionPersistError(null);

    try {
      const metrics = buildQuestionMetrics();
      const CONVFLOW = process.env.NEXT_PUBLIC_CONVFLOW_URL || 'http://localhost:8001';
      console.log(`📡 Persisting session to ${CONVFLOW}/api/interview-sessions/finalize`);
      const res = await fetch(`${CONVFLOW}/api/interview-sessions/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: interviewSessionId,
          user_id: currentUserId,
          started_at: interviewStartedAt,
          completed_at: new Date().toISOString(),
          question_metrics_json: metrics,
          llm_evaluation_json: finalScores,
        }),
      });
      if (!res.ok) throw new Error('Database save failed');
      console.log('✅ Session persisted successfully');
      setSessionPersisted(true);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error while saving session';
      console.error('❌ Session persist error:', message);
      setSessionPersistError(message);
      return false;
    } finally {
      setPersistingSession(false);
    }
  }, [buildQuestionMetrics, currentUserId, finalScores, interviewSessionId, interviewStartedAt, persistingSession, sessionPersisted]);

  const handleLeave = async () => {
    if (endingInterviewRef.current) return;
    endingInterviewRef.current = true;

    // Phase 1 Fix: Stop everything immediately
    disconnectRoom();
    releaseStream();
    clearLiveKitToken(); // Clears cached token so next interview creates a new room

    if (document.fullscreenElement) await document.exitFullscreen();
    if (isChunkRecording) stopRecorder();
    if (interviewStarted) {
      setShowResults(true);
    } else {
      router.push('/');
    }
  };

  const handleInterviewEnd = (fScores?: Record<string, unknown>) => {
    if (fScores) setFinalScores(fScores as Record<string, InterviewPhaseScores>);
    void handleLeave();
  };

  // -- Lifecycle Effects --
  useEffect(() => {
    // When the component mounts (or re-mounts on a fresh page load), we should
    // conditionally clear the token if we want to ensure fresh rooms on refresh.
    // Setting endingInterviewRef to false just in case.
    endingInterviewRef.current = false;

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    requestPermissions().then((s) => {
      if (s) { setPermissionStatus('granted'); if (videoRef.current) videoRef.current.srcObject = s; }
      else setPermissionStatus('denied');
    });
    const fsHandler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fsHandler);
    return () => { releaseStream(); document.removeEventListener('fullscreenchange', fsHandler); };
  }, [releaseStream, requestPermissions]);

  useEffect(() => {
    const text = (streamingQuestion ?? aiQuestions[questionIndex] ?? 'Introduce yourself.').trim();
    questionContextRef.current = { questionIndex: aiQuestions.length > 0 ? questionIndex : 0, questionText: text, phase: currentPhase };
  }, [aiQuestions, questionIndex, streamingQuestion, currentPhase]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isChunkRecording) timer = setInterval(() => setRecordingTime((p: number) => p + 1), 1000);
    return () => clearInterval(timer);
  }, [isChunkRecording]);

  const { disconnect: disconnectRoom, sendData } = useConvFlowRoom({
    onTurnEnd: handleTurnEnd,
    onInterviewEnd: handleInterviewEnd,
    onNewQuestion: handleNewQuestion,
    stream: cameraStream,
    isAiSpeaking: questionStatus === 'streaming' || questionStatus === 'processing' || isPaused,
  });

  const togglePause = useCallback(async () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);

    if (nextPaused) {
      console.log("⏸ Interview Paused");
      if (isChunkRecording) stopRecorder();
      await sendData({ event: 'pause' });
    } else {
      console.log("▶️ Interview Resumed");
      if (cameraStream) startRecorder(cameraStream);
      // Repeat question if it hasn't been answered yet
      await sendData({ event: 'repeat_question' });
    }
  }, [isPaused, isChunkRecording, stopRecorder, startRecorder, cameraStream, sendData]);

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      {showCalibration && (
        <CalibrationFlow
          onComplete={() => {
            setShowCalibration(false);
            setInterviewStarted(true);
            setInterviewSessionId(crypto.randomUUID());
            setInterviewStartedAt(new Date().toISOString());
            containerRef.current?.requestFullscreen();
            if (cameraStream) startRecorder(cameraStream);
          }}
          onCalibrate={() => { }} calibrated={true} screenCalibrated={true}
        />
      )}

      <InterviewHeader
        isChunkRecording={isChunkRecording} chunkCount={chunkCount} recordingTime={recordingTime}
        pendingChunks={pendingChunks} isFullscreen={isFullscreen} interviewStarted={interviewStarted}
        visionConnected={visionConnected} visionError={visionError}
        permissionStatus={permissionStatus}
        isPaused={isPaused}
        onExitFullscreen={() => document.exitFullscreen()}
        onEnterFullscreen={() => containerRef.current?.requestFullscreen()}
        onLeave={handleLeave} formatTime={formatTime}
      />

      <div className="flex-1 flex relative overflow-hidden">
        <InterviewMainDisplay
          videoRef={videoRef} permissionStatus={permissionStatus} permissionError={null}
          interviewStarted={interviewStarted} currentPhase={currentPhase} questionStatus={questionStatus}
          streamingQuestion={streamingQuestion} aiQuestions={aiQuestions} questionIndex={questionIndex}
          isChunkRecording={isChunkRecording} isPaused={isPaused}
          onPrev={() => setQuestionIndex(i => Math.max(0, i - 1))}
          onNext={() => setQuestionIndex(i => Math.min(aiQuestions.length - 1, i + 1))}
        />

        <AnalyticsPanel
          isVisible={interviewStarted && !isPaused} chunkResults={chunkResults} latestConfidence={latestConfidence}

          latestVoiceScore={latestVoiceScore}
          pendingChunks={pendingChunks} pendingUploads={pendingUploads} isChunkRecording={isChunkRecording}
        />

        {chunkErrors.length > 0 && (
          <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 max-w-sm">
            {chunkErrors.map((err, i) => (
              <div key={i} className="px-4 py-3 bg-red-900/80 border border-red-500/40 rounded-xl backdrop-blur-sm text-xs text-red-200 flex justify-between items-center">
                <span>{err}</span>
                <button onClick={() => dismissChunkError(i)} className="ml-4 text-red-400 hover:text-white">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <InterviewControls
        isChunkRecording={isChunkRecording} cameraStream={cameraStream}
        isPaused={isPaused} onTogglePause={togglePause}
        onStop={stopRecorder} onStart={(s) => startRecorder(s)} onLeave={handleLeave}
      />

      <ResultsModal
        show={showResults} chunkResults={chunkResults} questionMetrics={buildQuestionMetrics()}
        finalScores={finalScores} interviewSessionId={interviewSessionId} interviewStartedAt={interviewStartedAt}
        currentUserId={currentUserId} recordingTime={recordingTime} pendingUploads={pendingUploads}
        pendingChunks={pendingChunks} persistingSession={persistingSession} sessionPersisted={sessionPersisted}
        sessionPersistError={sessionPersistError} onPersist={handlePersistSession} onClose={() => setShowResults(false)}
      />
    </div>
  );
}
