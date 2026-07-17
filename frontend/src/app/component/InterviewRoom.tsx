'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

import { useConvFlowRoom } from '../hooks/useConvFlowRoom';

// Modular Components
import PreFlightCheck from './interview/PreFlightCheck';
import CalibrationFlow from './CalibrationFlow';
import ResultsModal from './interview/ResultsModal';
import { InterviewHeader, InterviewMainDisplay, InterviewControls } from './interview/InterviewUI';
import { useTelemetry } from '../hooks/useTelemetry';

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
import { useLocalVideoRecorder } from '../hooks/useLocalVideoRecorder';

export default function InterviewRoom() {
  const router = useRouter();

  // -- Refs for persistent state without re-renders --
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const endingInterviewRef = useRef(false);
  const questionContextRef = useRef({ questionIndex: 0, questionText: 'Introduce yourself.', phase: 'intro' });
  const chunkQuestionMapRef = useRef<Record<string, { question_index: number; question_text: string; phase: string }>>({});
  const candidateAnswerMapRef = useRef<Record<number, string>>({});
  const candidateDurationMapRef = useRef<Record<number, number>>({});
  
  const telemetryAccRef = useRef({ gazeDarting: 0, smile: 0, frown: 0, volumeVariance: 0, count: 0 });
  const questionTelemetryMapRef = useRef<Record<number, any>>({});

  // -- Component State --
  const [recordingTime, setRecordingTime] = useState(0);
  const [showPreFlight, setShowPreFlight] = useState(true);
  const [showCalibration, setShowCalibration] = useState(true);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const showResultsRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // -- Dev Mode (Mock Video) --
  const [devMode, setDevMode] = useState(false);
  const [savedSessions, setSavedSessions] = useState<string[]>([]);
  const [selectedMockSession, setSelectedMockSession] = useState<string>('');
  const mockVideoRef = useRef<HTMLVideoElement>(null);

  // -- AI Conversation State --
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionStatus, setQuestionStatus] = useState<QuestionStatus>('waiting');
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
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

  // -- Refs for circular dependency --
  const disconnectRoomRef = useRef<() => void>(() => {});

  // -- WebRTC Vision State --
  const [chunkResults, setChunkResults] = useState<any[]>([]);
  
  // -- Core Logic Hooks --
  // We no longer use useVisionSession and useChunkedRecorder
  const visionConnected = true;
  const chunkErrors: string[] = [];
  const dismissChunkError = () => {};
  const visionError = null;

  const isChunkRecording = interviewStarted && !isPaused;
  const chunkCount = chunkResults.length;
  const pendingUploads = 0;
  const pendingChunks = 0;

  // Polyfills for old chunked recorder functions
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // -- Start Local Video Recording --
  useLocalVideoRecorder(cameraStream, interviewStarted && !isPaused, interviewSessionId);
  
  // -- Frontend Telemetry (Replaces Backend Video Analytics) --
  const { telemetry, timelineEventsRef } = useTelemetry(cameraStream, interviewStarted && !isPaused);

  useEffect(() => {
    if (interviewStarted && !isPaused) {
      telemetryAccRef.current.gazeDarting += telemetry.gazeDarting;
      telemetryAccRef.current.smile += telemetry.smile;
      telemetryAccRef.current.frown += telemetry.frown;
      telemetryAccRef.current.volumeVariance += telemetry.volumeVariance;
      telemetryAccRef.current.count += 1;
    }
  }, [telemetry, interviewStarted, isPaused]);
  
  const requestPermissions = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setCameraStream(stream);
      return stream;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    import('../../utils/videoStorage').then(m => m.getAllLocalVideoSessions().then(setSavedSessions));
  }, []);

  const releaseStream = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  const loadMockStream = useCallback(async (sessionId: string) => {
    try {
      const { getVideoLocal } = await import('../../utils/videoStorage');
      const blob = await getVideoLocal(sessionId);
      if (!blob) throw new Error("Video not found");
      
      const videoEl = mockVideoRef.current;
      if (!videoEl) return;
      
      videoEl.src = URL.createObjectURL(blob);
      videoEl.loop = false;
      videoEl.muted = false;
      await new Promise((resolve) => {
        videoEl.onloadedmetadata = resolve;
      });
      
      const captureStream = (videoEl as any).captureStream || (videoEl as any).mozCaptureStream;
      if (captureStream) {
        const stream = captureStream.call(videoEl);
        releaseStream();
        setCameraStream(stream);
        setPermissionStatus('granted');
        if (videoRef.current) videoRef.current.srcObject = stream;
        videoEl.pause();
      }
    } catch(e) {
      console.error(e);
    }
  }, [releaseStream]);

  const startRecorder = () => {};
  const stopRecorder = () => {};
  const flushChunk = () => {};

  const handleGazeMetrics = useCallback((msg: any) => {
    const qCtx = questionContextRef.current;
    chunkQuestionMapRef.current[msg.chunk_id] = {
      question_index: qCtx.questionIndex,
      question_text: qCtx.questionText,
      phase: qCtx.phase,
    };
    setChunkResults(prev => [...prev, { chunkId: msg.chunk_id, chunkIndex: msg.chunk_index, gaze_data: msg.gaze_data }]);
  }, []);

  const handleInterviewEnd = useCallback(async (fScores?: Record<string, unknown>) => {
    console.log("🏁 Finalizing interview session...");
    if (fScores) setFinalScores(fScores as Record<string, InterviewPhaseScores>);
    
    // Stop recording and disconnect
    if (isChunkRecording) stopRecorder();
    disconnectRoomRef.current();
    releaseStream();
    clearLiveKitToken();

    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch(e) {}
    }
    
    setShowResults(true);
    showResultsRef.current = true;
  }, [isChunkRecording, releaseStream, stopRecorder]);

  // -- Callbacks for Child Components --
  const handleNewQuestion = useCallback((questionText: string, meta?: QuestionMeta & { speaker_name?: string }) => {
    // The backend sends 'question_text' in the payload, but onNewQuestion 
    // is called with (msg.question_text || msg.text).
    const normalized = questionText?.trim();
    if (!normalized) return;

    if (meta?.phase) setCurrentPhase(meta.phase);
    if (meta?.stream_id) setActiveQuestionStreamId(meta.stream_id);
    if (meta?.speaker_name) setActiveSpeaker(meta.speaker_name);

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

  const handleTurnEnd = useCallback((transcript?: string, audioDurationSec?: number) => {
    flushChunk();
    if (transcript) candidateAnswerMapRef.current[questionContextRef.current.questionIndex] = transcript;
    if (audioDurationSec) {
      const qIndex = questionContextRef.current.questionIndex;
      candidateDurationMapRef.current[qIndex] = (candidateDurationMapRef.current[qIndex] || 0) + audioDurationSec;
      
      const count = telemetryAccRef.current.count || 1;
      questionTelemetryMapRef.current[qIndex] = {
        gazeDarting: telemetryAccRef.current.gazeDarting / count,
        smile: telemetryAccRef.current.smile / count,
        frown: telemetryAccRef.current.frown / count,
        volumeVariance: telemetryAccRef.current.volumeVariance / count,
      };
      telemetryAccRef.current = { gazeDarting: 0, smile: 0, frown: 0, volumeVariance: 0, count: 0 };
    }
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
          candidate_audio_duration: candidateDurationMapRef.current[qCtx.question_index] || 0,
          phase: qCtx.phase,
          chunks: [],
          question_averages: { 
            wpm: null, 
            focus: null,
            telemetry: questionTelemetryMapRef.current[qCtx.question_index] || null
          },
        });
      }

      // Map ChunkResult (Frontend) to ChunkMetricModel (Backend)
      const mappedChunk = {
        chunk_id: chunk.chunkId,
        chunk_index: chunk.chunkIndex,
        question_index: qCtx.question_index,
        question_text: qCtx.question_text,
        praat_features: null,
        gaze_distribution: buildChunkGazeDistribution(chunk),
        smart_turn_probability: null,
        smart_turn_is_complete: null,
      };

      grouped.get(qCtx.question_index)?.chunks.push(mappedChunk);
    });

    // 1.5 Ensure all questions with transcripts are included even if they have no video chunks
    Object.entries(candidateAnswerMapRef.current).forEach(([qIndexStr, answer]) => {
      const qIndex = parseInt(qIndexStr, 10);
      if (!grouped.has(qIndex)) {
        grouped.set(qIndex, {
          question_index: qIndex,
          // Fallback if we didn't get chunk context, we use the answer but might miss the exact question text
          question_text: aiQuestions[qIndex] || 'Unknown Question', 
          candidate_answer: answer,
          candidate_audio_duration: candidateDurationMapRef.current[qIndex] || 0,
          phase: 'unknown',
          chunks: [],
          question_averages: { 
            wpm: null, 
            focus: null,
            telemetry: questionTelemetryMapRef.current[qIndex] || null
          },
        });
      } else {
        // Just make sure the answer is set in case it wasn't yet
        const existing = grouped.get(qIndex);
        if (existing && !existing.candidate_answer) {
          existing.candidate_answer = answer;
        }
        if (existing && !existing.candidate_audio_duration) {
          existing.candidate_audio_duration = candidateDurationMapRef.current[qIndex] || 0;
        }
      }
    });

    // 2. Calculate the ACTUAL averages for each question group
    const metrics = Array.from(grouped.values());
    metrics.forEach((m) => {

      let sumFrameScore = 0;
      let countFrameScore = 0;

      const rawChunksForQuestion = chunkResults.filter(
        cr => (chunkQuestionMapRef.current[cr.chunkId]?.question_index || 0) === m.question_index
      );

      rawChunksForQuestion.forEach(cr => {
        cr.gaze_data.forEach(g => {
          if (g.frame_score !== undefined) {
            sumFrameScore += g.frame_score;
            countFrameScore++;
          }
        });
      });

      const focusVal = countFrameScore > 0 ? sumFrameScore / countFrameScore : null;

      const totalFrames = rawChunksForQuestion.reduce((acc, cr) => acc + cr.gaze_data.length, 0);

      let wpmVal: number | null = null;
      if (m.candidate_answer && totalFrames > 0) {
        const wordCount = m.candidate_answer.trim().split(/\s+/).filter(w => w.length > 0).length;
        const durationMinutes = (totalFrames / 10) / 60; // 10 fps processed by agent.py
        wpmVal = durationMinutes > 0.05 ? Math.round(wordCount / durationMinutes) : null;
      }

      m.question_averages = {
        wpm: wpmVal,
        focus: focusVal,
        telemetry: {
          gazeDarting: telemetryAccRef.current.count > 0 ? telemetryAccRef.current.gazeDarting / telemetryAccRef.current.count : 0,
          smile: telemetryAccRef.current.count > 0 ? telemetryAccRef.current.smile / telemetryAccRef.current.count : 0,
          frown: telemetryAccRef.current.count > 0 ? telemetryAccRef.current.frown / telemetryAccRef.current.count : 0,
          volumeVariance: telemetryAccRef.current.count > 0 ? telemetryAccRef.current.volumeVariance / telemetryAccRef.current.count : 0,
        }
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
          timeline_events: timelineEventsRef.current,
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

    if (interviewStarted) {
      console.log("🛑 Requesting early interview end...");
      await sendData({ event: 'end_interview' });
      
      // Fallback: if backend doesn't respond in 15s, force cleanup
      setTimeout(() => {
        if (!showResultsRef.current) {
          console.log("⏰ Early end timeout: forcing cleanup");
          void handleInterviewEnd();
        }
      }, 15000);
      return;
    }

    // Standard exit for non-started interviews
    disconnectRoom();
    releaseStream();
    clearLiveKitToken();
    if (document.fullscreenElement) await document.exitFullscreen();
    if (isChunkRecording) stopRecorder();
    router.push('/');
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
    
    return () => { 
      document.removeEventListener('fullscreenchange', fsHandler); 
    };
  }, []); // Run exactly once on mount!

  // Dedicated unmount cleanup for the camera stream
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [cameraStream]);

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
    onGazeMetrics: handleGazeMetrics,
    stream: cameraStream,
    isAiSpeaking: questionStatus === 'streaming' || questionStatus === 'processing' || isPaused,
    sessionId: interviewSessionId,
  });

  useEffect(() => {
    disconnectRoomRef.current = disconnectRoom;
  }, [disconnectRoom]);

  const togglePause = useCallback(async () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);

    if (nextPaused) {
      console.log("⏸ Interview Paused");
      mockVideoRef.current?.pause();
      if (isChunkRecording) stopRecorder();
      await sendData({ event: 'pause' });
    } else {
      console.log("▶️ Interview Resumed");
      mockVideoRef.current?.play();
      if (cameraStream) startRecorder(cameraStream);
      // Repeat question if it hasn't been answered yet
      await sendData({ event: 'repeat_question' });
    }
  }, [isPaused, isChunkRecording, stopRecorder, startRecorder, cameraStream, sendData]);

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      {!interviewStarted && (
        <div className="absolute top-4 right-4 z-[999] bg-black/80 p-4 rounded-lg border border-white/10 shadow-lg">
          <label className="flex items-center space-x-2 text-sm cursor-pointer font-bold text-blue-400">
            <input type="checkbox" checked={devMode} onChange={e => setDevMode(e.target.checked)} className="accent-blue-500" />
            <span>Dev Mode (Mock Video)</span>
          </label>
          {devMode && (
            <select 
              className="mt-3 bg-gray-900 text-xs p-2 rounded w-full border border-gray-700 text-gray-300"
              value={selectedMockSession}
              onChange={e => {
                setSelectedMockSession(e.target.value);
                if (e.target.value) loadMockStream(e.target.value);
              }}
            >
              <option value="">Select previous session...</option>
              {savedSessions.map(s => <option key={s} value={s}>{s.substring(0, 8)}...</option>)}
            </select>
          )}
        </div>
      )}
      <video ref={mockVideoRef} className="hidden" crossOrigin="anonymous" playsInline />

      {showPreFlight && (
        <PreFlightCheck onComplete={() => setShowPreFlight(false)} />
      )}

      {!showPreFlight && showCalibration && (
        <CalibrationFlow
          onComplete={() => {
            setShowCalibration(false);
            setInterviewStarted(true);
            setInterviewSessionId(crypto.randomUUID());
            setInterviewStartedAt(new Date().toISOString());
            containerRef.current?.requestFullscreen();
            if (cameraStream) startRecorder(cameraStream);
            if (devMode && mockVideoRef.current) mockVideoRef.current.play();
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
          activeSpeaker={activeSpeaker}
          onPrev={() => setQuestionIndex(i => Math.max(0, i - 1))}
          onNext={() => setQuestionIndex(i => Math.min(aiQuestions.length - 1, i + 1))}
        />
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
