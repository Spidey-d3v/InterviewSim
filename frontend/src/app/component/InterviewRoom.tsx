'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import { createClient } from '@/utils/supabase';
import { useVisionSession, type ChunkResult, type GazeLogEntry } from '../hooks/useVisionSession';
import { useChunkedRecorder } from '../hooks/useChunkedRecorder';
import { useConvFlowRoom } from '../hooks/useConvFlowRoom';
import { LiveKitDebugPanel } from './LiveKitDebugPanel';
import CalibrationFlow from './CalibrationFlow';

type GazeDistribution = {
  forward: number;
  left: number;
  right: number;
  down: number;
  away: number;
};

type PersistedChunkMetric = {
  chunk_id: string;
  chunk_index: number;
  question_index: number;
  question_text: string;
  confidence_score: number | null;
  facial_expression_score: number | null;
  voice_score: number | null;
  gaze_distribution: GazeDistribution;
};

type PersistedQuestionMetric = {
  question_index: number;
  question_text: string;
  chunks: PersistedChunkMetric[];
  question_averages: {
    confidence_score: number | null;
    facial_expression_score: number | null;
    voice_score: number | null;
  };
};

export default function InterviewRoom() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [recordingTime, setRecordingTime] = useState(0);
  const [showCalibration, setShowCalibration] = useState(true);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'pending' | 'granted' | 'denied'>('pending');

  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionStatus, setQuestionStatus] = useState<'waiting' | 'processing' | 'streaming' | 'ready'>('waiting');
  const [streamingQuestion, setStreamingQuestion] = useState<string | null>(null);
  const [activeQuestionStreamId, setActiveQuestionStreamId] = useState<string | null>(null);
  const [interviewSessionId, setInterviewSessionId] = useState<string | null>(null);
  const [interviewStartedAt, setInterviewStartedAt] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [persistingSession, setPersistingSession] = useState(false);
  const [sessionPersisted, setSessionPersisted] = useState(false);
  const [sessionPersistError, setSessionPersistError] = useState<string | null>(null);

  const questionContextRef = useRef<{ questionIndex: number; questionText: string }>({
    questionIndex: 0,
    questionText: 'Introduce yourself.',
  });
  const chunkQuestionMapRef = useRef<Record<string, { question_index: number; question_text: string }>>({});
  const endingInterviewRef = useRef(false);

  const handleNewQuestion = useCallback(
    (
      questionText: string,
      meta?: { phase?: string; turnIndex?: number; ts?: number; streamId?: string; isFinal?: boolean }
    ) => {
      const normalized = questionText.trim();
      if (!normalized) return;

      if (meta?.streamId) {
        setActiveQuestionStreamId(meta.streamId);
      }

      if (meta?.isFinal) {
        setAiQuestions((prev) => {
          if (prev[prev.length - 1] === normalized) return prev;
          const next = [...prev, normalized];
          setQuestionIndex(next.length - 1);
          return next;
        });
        setStreamingQuestion(null);
        setActiveQuestionStreamId(null);
        setQuestionStatus('ready');
        return;
      }

      setStreamingQuestion(normalized);
      setQuestionStatus('streaming');
    },
    []
  );

  // Vision.py session hook
  const {
    isConnected: visionConnected,
    sessionData,
    latestConfidence,
    chunkResults,
    latestVoiceScore,
    latestFacialScore,
    pendingChunks,
    chunkErrors,
    dismissChunkError,
    processChunk,
    error: visionError,
  } = useVisionSession();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setCurrentUserId(data.user?.id ?? null);
      })
      .catch(() => setCurrentUserId(null));
  }, []);

  useEffect(() => {
    const text = (streamingQuestion ?? aiQuestions[questionIndex] ?? 'Introduce yourself.').trim();
    questionContextRef.current = {
      questionIndex: aiQuestions.length > 0 ? questionIndex : 0,
      questionText: text || 'Introduce yourself.',
    };
  }, [aiQuestions, questionIndex, streamingQuestion]);

  // Chunked recorder — 15-s chunks auto-uploaded to vision_server
  const {
    stream: cameraStream,
    isRecording: isChunkRecording,
    chunkCount,
    pendingUploads,
    permissionGranted,
    permissionError,
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
      };
      console.log(`📦 Chunk ${chunkIndex} ready: ${videoPath}`);
      processChunk(videoPath, chunkId, chunkIndex);
    },
    onError: (msg) => console.error('[Recorder]', msg),
  });

  const handleTurnEnd = useCallback(() => {
    flushChunk();
    if (interviewStarted) {
      setStreamingQuestion(null);
      setActiveQuestionStreamId(null);
      setQuestionStatus('processing');
    }
  }, [flushChunk, interviewStarted]);

  // Request camera + microphone on mount and feed stream into video element
  useEffect(() => {
    requestPermissions().then((s) => {
      if (s) {
        setPermissionStatus('granted');
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } else {
        setPermissionStatus('denied');
      }
    });

    return () => {
      releaseStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recording timer tied to chunked recorder
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isChunkRecording) {
      timer = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isChunkRecording]);

  // Show results when chunks have been analyzed and recording stops
  useEffect(() => {
    if (chunkResults.length > 0 && !isChunkRecording && interviewStarted) {
      console.log('📊 Got chunk results:', chunkResults.length);
    }
  }, [chunkResults, isChunkRecording, interviewStarted, sessionData]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const enterFullscreen = async () => {
    if (containerRef.current && !document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        console.log('✅ Entered fullscreen mode');
      } catch (err) {
        console.error('❌ Error entering fullscreen:', err);
      }
    }
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
        console.log('✅ Exited fullscreen mode');
      } catch (err) {
        console.error('❌ Error exiting fullscreen:', err);
      }
    }
  };

  const handleCalibrationComplete = () => {
    endingInterviewRef.current = false;
    setShowCalibration(false);
    setInterviewStarted(true);
    setAiQuestions([]);
    setQuestionIndex(0);
    setStreamingQuestion(null);
    setActiveQuestionStreamId(null);
    setQuestionStatus('waiting');
    setSessionPersisted(false);
    setSessionPersistError(null);
    chunkQuestionMapRef.current = {};
    setInterviewSessionId(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `session-${Date.now()}`
    );
    setInterviewStartedAt(new Date().toISOString());

    // Enter fullscreen mode
    enterFullscreen();

    // Start 15-s chunk recording now that permissions are already granted
    if (permissionGranted && cameraStream) {
      console.log('🎥 Starting chunked recording (15-s chunks) ...');
      startRecorder(cameraStream);
    } else {
      console.warn('Camera stream not ready — requesting permissions again');
      requestPermissions().then((s) => {
        if (s) {
          startRecorder(s);
          if (videoRef.current) videoRef.current.srcObject = s;
        }
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const mean = (values: Array<number | null | undefined>): number | null => {
    const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (!nums.length) return null;
    return nums.reduce((sum, n) => sum + n, 0) / nums.length;
  };

  const buildGazeDistribution = (gazeData: GazeLogEntry[]): GazeDistribution => {
    const counts: GazeDistribution = { forward: 0, left: 0, right: 0, down: 0, away: 0 };
    if (!gazeData.length) return counts;

    for (const entry of gazeData) {
      const status = (entry.status || '').toLowerCase();
      if (status.includes('away')) counts.away += 1;
      else if (status.includes('left')) counts.left += 1;
      else if (status.includes('right')) counts.right += 1;
      else if (status.includes('down')) counts.down += 1;
      else counts.forward += 1;
    }

    const total = gazeData.length;
    return {
      forward: counts.forward / total,
      left: counts.left / total,
      right: counts.right / total,
      down: counts.down / total,
      away: counts.away / total,
    };
  };

  const getChunkGazeCounts = (chunk: ChunkResult): { focused: number; total: number } => {
    const summary = chunk.gaze_summary;
    if (summary && summary.total_frames > 0) {
      return {
        focused: summary.looking_forward + summary.looking_left + summary.looking_right,
        total: summary.total_frames,
      };
    }

    const total = chunk.gaze_data.length;
    const focused = chunk.gaze_data.filter((e) => !e.status.includes('Away')).length;
    return { focused, total };
  };

  const buildChunkGazeDistribution = (chunk: ChunkResult): GazeDistribution => {
    const summary = chunk.gaze_summary;
    if (summary && summary.total_frames > 0) {
      return {
        forward: summary.looking_forward / summary.total_frames,
        left: summary.looking_left / summary.total_frames,
        right: summary.looking_right / summary.total_frames,
        down: 0,
        away: summary.looking_away / summary.total_frames,
      };
    }

    return buildGazeDistribution(chunk.gaze_data);
  };

  const buildQuestionMetrics = useCallback((): PersistedQuestionMetric[] => {
    const grouped = new Map<number, PersistedQuestionMetric>();
    const sortedChunks = [...chunkResults].sort((a, b) => a.chunkIndex - b.chunkIndex);

    sortedChunks.forEach((chunk: ChunkResult) => {
      const mappedQuestion = chunkQuestionMapRef.current[chunk.chunkId] ?? {
        question_index: 0,
        question_text: 'Introduce yourself.',
      };

      if (!grouped.has(mappedQuestion.question_index)) {
        grouped.set(mappedQuestion.question_index, {
          question_index: mappedQuestion.question_index,
          question_text: mappedQuestion.question_text,
          chunks: [],
          question_averages: {
            confidence_score: null,
            facial_expression_score: null,
            voice_score: null,
          },
        });
      }

      grouped.get(mappedQuestion.question_index)?.chunks.push({
        chunk_id: chunk.chunkId,
        chunk_index: chunk.chunkIndex,
        question_index: mappedQuestion.question_index,
        question_text: mappedQuestion.question_text,
        confidence_score:
          chunk.predictions.length > 0
            ? chunk.predictions[chunk.predictions.length - 1].confidence
            : null,
        facial_expression_score: chunk.facial_analysis?.score ?? null,
        voice_score: chunk.voice_analysis?.score ?? null,
        gaze_distribution: buildChunkGazeDistribution(chunk),
      });
    });

    const questions = [...grouped.values()].sort((a, b) => a.question_index - b.question_index);
    questions.forEach((q) => {
      q.question_averages = {
        confidence_score: mean(q.chunks.map((c) => c.confidence_score)),
        facial_expression_score: mean(q.chunks.map((c) => c.facial_expression_score)),
        voice_score: mean(q.chunks.map((c) => c.voice_score)),
      };
    });

    return questions;
  }, [chunkResults]);

  const persistInterviewSession = useCallback(async (): Promise<boolean> => {
    if (persistingSession) return false;
    if (sessionPersisted) return true;

    if (!interviewSessionId) {
      setSessionPersistError('Missing session id.');
      return false;
    }

    if (!currentUserId) {
      setSessionPersistError('No authenticated user found for saving session.');
      return false;
    }

    setPersistingSession(true);
    setSessionPersistError(null);

    try {
      const questionMetrics = buildQuestionMetrics();
      const response = await fetch('http://localhost:8001/api/interview-sessions/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: interviewSessionId,
          user_id: currentUserId,
          started_at: interviewStartedAt,
          completed_at: new Date().toISOString(),
          question_metrics_json: questionMetrics,
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(errorPayload?.detail || `Session save failed with status ${response.status}`);
      }

      setSessionPersisted(true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown persistence error';
      setSessionPersistError(message);
      return false;
    } finally {
      setPersistingSession(false);
    }
  }, [
    buildQuestionMetrics,
    currentUserId,
    interviewSessionId,
    interviewStartedAt,
    persistingSession,
    sessionPersisted,
  ]);

  const exportInterviewReport = useCallback(async () => {
    const questionMetrics = buildQuestionMetrics();
    const allGaze = chunkResults.flatMap((c) => c.gaze_data);
    const totalGaze = allGaze.length;
    const focusedGaze = allGaze.filter((e) => !e.status.includes('Away')).length;
    const focusPct = totalGaze > 0 ? (focusedGaze / totalGaze) * 100 : 0;

    const voiceVals = chunkResults
      .map((c) => c.voice_analysis?.score)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const facialVals = chunkResults
      .map((c) => c.facial_analysis?.score)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const confVals = chunkResults
      .flatMap((c) => c.predictions.map((p) => p.confidence))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const avgVoice = voiceVals.length > 0 ? (voiceVals.reduce((s, v) => s + v, 0) / voiceVals.length) * 100 : null;
    const avgFacial = facialVals.length > 0 ? (facialVals.reduce((s, v) => s + v, 0) / facialVals.length) * 100 : null;
    const avgConfidence = confVals.length > 0 ? (confVals.reduce((s, v) => s + v, 0) / confVals.length) * 100 : null;

    const overallRaw = [focusPct, avgConfidence, avgVoice, avgFacial].filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    );
    const overall = overallRaw.length > 0 ? overallRaw.reduce((s, v) => s + v, 0) / overallRaw.length : 0;

    const started = interviewStartedAt ? new Date(interviewStartedAt) : null;
    const ended = new Date();
    const durationSeconds = started ? Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000)) : recordingTime;

    const scoreCell = (v: number | null): string => (v == null || !Number.isFinite(v) ? 'N/A' : `${(v * 100).toFixed(1)}%`);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    const margin = 40;
    const lineHeight = 16;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (requiredHeight = lineHeight) => {
      if (y + requiredHeight <= pageHeight - margin) return;
      pdf.addPage();
      y = margin;
    };

    const addWrappedText = (
      text: string,
      options?: { bold?: boolean; size?: number; bottomGap?: number }
    ) => {
      pdf.setFont('helvetica', options?.bold ? 'bold' : 'normal');
      pdf.setFontSize(options?.size ?? 11);
      const lines = pdf.splitTextToSize(text, contentWidth) as string[];
      lines.forEach((line) => {
        ensureSpace();
        pdf.text(line, margin, y);
        y += lineHeight;
      });
      if (options?.bottomGap) y += options.bottomGap;
    };

    addWrappedText('InterviewAR Report', { bold: true, size: 18, bottomGap: 6 });
    addWrappedText(`Session: ${interviewSessionId ?? 'N/A'}`);
    addWrappedText(`User: ${currentUserId ?? 'N/A'}`);
    addWrappedText(`Started: ${started ? started.toISOString() : 'N/A'}`);
    addWrappedText(`Completed: ${ended.toISOString()}`);
    addWrappedText(`Duration: ${durationSeconds}s`, { bottomGap: 8 });

    addWrappedText('Summary Scores', { bold: true, size: 14, bottomGap: 4 });
    addWrappedText(`Focus Score: ${focusPct.toFixed(1)}%`);
    addWrappedText(`Average Confidence: ${avgConfidence == null ? 'N/A' : `${avgConfidence.toFixed(1)}%`}`);
    addWrappedText(`Voice Skills: ${avgVoice == null ? 'N/A' : `${avgVoice.toFixed(1)}%`}`);
    addWrappedText(`Facial Expression: ${avgFacial == null ? 'N/A' : `${avgFacial.toFixed(1)}%`}`);
    addWrappedText(`Overall Score: ${overall.toFixed(1)}%`);
    addWrappedText(`Total Chunks: ${chunkResults.length}`);
    addWrappedText(`Total Questions: ${questionMetrics.length}`, { bottomGap: 8 });

    addWrappedText('Question-wise Breakdown', { bold: true, size: 14, bottomGap: 4 });

    if (questionMetrics.length === 0) {
      addWrappedText('No question metrics available.', { bottomGap: 8 });
    } else {
      questionMetrics.forEach((q, idx) => {
        ensureSpace(lineHeight * 6);
        addWrappedText(`${idx + 1}. ${q.question_text}`, { bold: true });
        addWrappedText(`Confidence: ${scoreCell(q.question_averages.confidence_score)}`);
        addWrappedText(`Voice: ${scoreCell(q.question_averages.voice_score)}`);
        addWrappedText(`Facial: ${scoreCell(q.question_averages.facial_expression_score)}`);
        addWrappedText(`Chunks: ${q.chunks.length}`, { bottomGap: 6 });
      });
    }

    addWrappedText('Generated from actual session data only (no synthetic placeholders).', {
      size: 10,
    });

    pdf.save(`interview-report-${interviewSessionId ?? Date.now()}.pdf`);
  }, [
    buildQuestionMetrics,
    chunkResults,
    currentUserId,
    interviewSessionId,
    interviewStartedAt,
    recordingTime,
  ]);

  const handleLeave = async () => {
    if (endingInterviewRef.current) return;
    endingInterviewRef.current = true;

    // Exit fullscreen first
    await exitFullscreen();

    // Stop chunked recording (flushes final chunk)
    if (isChunkRecording) {
      console.log('⏹️ Stopping chunked recording ...');
      stopRecorder();
    }

    // Always show results modal if interview was started
    if (interviewStarted) {
      setShowResults(true);
    } else {
      setTimeout(() => {
        releaseStream();
        router.push('/homepage');
      }, 500);
    }
  };

  const handleInterviewEnd = useCallback(() => {
    console.log('🏁 Received interview_end from backend; ending interview.');
    void handleLeave();
  }, [handleLeave]);

  useConvFlowRoom({
    onTurnEnd: handleTurnEnd,
    onInterviewEnd: handleInterviewEnd,
    onNewQuestion: handleNewQuestion,
    stream: cameraStream,
    userId: currentUserId,
    enabled: interviewStarted,
  });

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Calibration Flow */}
      {showCalibration && (
        <CalibrationFlow
          onComplete={handleCalibrationComplete}
          onCalibrate={() => console.log('Calibration handled by vision.py')}
          calibrated={true}
          screenCalibrated={true}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center font-bold text-sm">
            AI
          </div>
          <span className="text-xl font-bold tracking-tight">InterviewAR</span>
          {isChunkRecording && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-red-400 font-mono">● Chunk {chunkCount} | {formatTime(recordingTime)}</span>
            </div>
          )}
          {pendingChunks > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-full">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              <span className="text-sm text-yellow-400 font-mono">Analyzing {pendingChunks} chunk{pendingChunks !== 1 ? 's' : ''}…</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Fullscreen Toggle */}
          {isFullscreen ? (
            <button
              onClick={exitFullscreen}
              className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm font-medium rounded-lg transition-all border border-blue-500/30 flex items-center gap-2"
              title="Exit Fullscreen"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Exit Fullscreen
            </button>
          ) : interviewStarted && (
            <button
              onClick={enterFullscreen}
              className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm font-medium rounded-lg transition-all border border-blue-500/30 flex items-center gap-2"
              title="Enter Fullscreen"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Fullscreen
            </button>
          )}
          {/* Vision Server Status */}
          {visionError && (
            <div className="px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg text-xs text-red-400">
              Vision Server Offline
            </div>
          )}
          {visionConnected && !visionError && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-green-400">Vision Server</span>
            </div>
          )}
          {/* Permission Status */}
          {permissionStatus === 'denied' && (
            <div className="px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg text-xs text-red-400">
              Camera/Mic Denied
            </div>
          )}


          
          <button 
            onClick={() => {
              if (confirm('End the interview and see your results?')) {
                handleLeave();
              }
            }}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            End Interview
          </button>
        </div>
      </div>

      {/* Chunk Error Toasts */}
      {chunkErrors.length > 0 && (
        <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {chunkErrors.map((err, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 bg-red-900/80 border border-red-500/40 rounded-xl backdrop-blur-sm text-sm text-red-200 shadow-lg">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="flex-1 font-mono text-xs">{err}</span>
              <button onClick={() => dismissChunkError(i)} className="text-red-400 hover:text-white">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Background Effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] opacity-50" />
        </div>

        {/* Video Container */}
        <div className="relative w-full max-w-5xl aspect-video">
          {/* Live camera feed (browser-side) */}
          <div className="relative w-full h-full bg-black rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl">

            {/* Live video preview */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover ${
                permissionStatus === 'granted' ? 'block' : 'hidden'
              }`}
            />

            {/* Permission / waiting state */}
            {permissionStatus !== 'granted' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center max-w-md p-8">
                  <div className="w-24 h-24 mx-auto mb-6 bg-white/5 rounded-full flex items-center justify-center border-4 border-white/10">
                    <svg className="w-12 h-12 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  {permissionStatus === 'pending' ? (
                    <>
                      <h3 className="text-xl font-bold text-white mb-2">Requesting Camera & Mic</h3>
                      <p className="text-gray-400 text-sm">Please allow access in your browser prompt.</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold text-red-400 mb-2">Permission Denied</h3>
                      <p className="text-gray-400 text-sm">{permissionError ?? 'Enable camera and microphone access, then refresh.'}</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Recording badge */}
            {isChunkRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-600/80 backdrop-blur-sm rounded-full">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-xs font-semibold text-white">REC</span>
              </div>
            )}

            {/* Tracking Status Badge */}
            <div className="absolute top-4 right-4 px-3 py-2 bg-gradient-to-br from-purple-500/80 to-pink-500/80 backdrop-blur-sm rounded-lg border border-white/30">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                </svg>
                <span className="text-sm font-medium">
                  {interviewStarted ? 'AI Monitoring' : 'Calibrating'}
                </span>
              </div>
            </div>

            {/* Interview Question Area (bottom overlay) */}
            {interviewStarted && (
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-purple-400">
                      {questionStatus === 'streaming' && streamingQuestion
                        ? `Question ${activeQuestionStreamId ? '(streaming)' : ''}`
                        : aiQuestions.length > 0
                        ? `Question ${questionIndex + 1} of ${aiQuestions.length}`
                        : 'Introduce yourself.'}
                    </p>
                    {questionStatus === 'processing' && (
                      <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-2 py-0.5">
                        Interviewer is thinking...
                      </div>
                    )}
                    {questionStatus === 'streaming' && (
                      <div className="text-xs text-purple-200 bg-purple-500/10 border border-purple-500/30 rounded-full px-2 py-0.5">
                        Interviewer is speaking...
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setQuestionIndex((p) => Math.max(0, p - 1))}
                        disabled={questionIndex === 0 || questionStatus === 'streaming'}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        ← Prev
                      </button>
                      <button
                        onClick={() => setQuestionIndex((p) => Math.min(aiQuestions.length - 1, p + 1))}
                        disabled={
                          aiQuestions.length === 0 ||
                          questionIndex >= aiQuestions.length - 1 ||
                          questionStatus === 'streaming'
                        }
                        className="px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-0.5 bg-white/10 rounded-full mb-3 overflow-hidden">
                    {aiQuestions.length > 0 && questionStatus !== 'streaming' ? (
                      <div
                        className="h-full bg-purple-500 transition-all duration-500"
                        style={{ width: `${((questionIndex + 1) / aiQuestions.length) * 100}%` }}
                      />
                    ) : (
                      <div className="h-full w-1/3 bg-purple-500/70 animate-pulse" />
                    )}
                  </div>
                  <p className="text-lg text-white">
                    {streamingQuestion
                      ? streamingQuestion
                      : aiQuestions.length > 0
                      ? aiQuestions[questionIndex]
                      : questionStatus === 'processing'
                      ? 'Processing your response...'
                      : 'Introduce yourself.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Side Panel - AI Feedback */}
        {interviewStarted && (
          <div className="absolute right-6 top-6 bottom-24 w-80 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm rounded-2xl border border-white/10 p-6 overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Live Analytics
            </h3>

            <div className="space-y-4">
              {/* Eye Contact Metric */}
              <div className="p-4 rounded-lg bg-green-500/10 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-300">Eye Contact</span>
                  <span className="text-sm font-bold text-purple-400">
                    {chunkResults.length > 0
                      ? (() => {
                          const totals = chunkResults.reduce(
                            (acc, c) => {
                              const counts = getChunkGazeCounts(c);
                              return {
                                focused: acc.focused + counts.focused,
                                total: acc.total + counts.total,
                              };
                            },
                            { focused: 0, total: 0 }
                          );
                          const focused = totals.focused;
                          const total = totals.total;
                          return total > 0 ? `${((focused / total) * 100).toFixed(0)}%` : 'Tracking…';
                        })()
                      : 'Tracking…'}
                  </span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 bg-purple-500"
                    style={{
                      width: chunkResults.length > 0
                        ? (() => {
                            const totals = chunkResults.reduce(
                              (acc, c) => {
                                const counts = getChunkGazeCounts(c);
                                return {
                                  focused: acc.focused + counts.focused,
                                  total: acc.total + counts.total,
                                };
                              },
                              { focused: 0, total: 0 }
                            );
                            const focused = totals.focused;
                            const total = totals.total;
                            return total > 0 ? `${((focused / total) * 100).toFixed(0)}%` : '0%';
                          })()
                        : '0%',
                    }}
                  />
                </div>
              </div>

              {/* Confidence Score */}
              <div className="p-4 rounded-lg bg-blue-500/10 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-300">AI Confidence Score</span>
                  <span className="text-sm font-bold text-blue-400">
                    {latestConfidence !== null
                      ? `${(latestConfidence * 100).toFixed(1)}%`
                      : chunkResults.length > 0
                      ? (() => {
                          const allPreds = chunkResults.flatMap((c) => c.predictions);
                          const avg = allPreds.length > 0
                            ? allPreds.reduce((s, p) => s + p.confidence, 0) / allPreds.length
                            : null;
                          return avg !== null ? `${(avg * 100).toFixed(1)}%` : 'Analyzing…';
                        })()
                      : 'Analyzing…'}
                  </span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                    style={{
                      width: latestConfidence !== null
                        ? `${Math.max(0, Math.min(100, latestConfidence * 100))}%`
                        : '0%'
                    }}
                  />
                </div>
                {chunkResults.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    Based on {chunkResults.length} chunk{chunkResults.length !== 1 ? 's' : ''} analyzed
                  </div>
                )}
              </div>

              {/* Voice Analysis Score */}
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-300">Voice Skills</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {latestVoiceScore !== null
                      ? `${(latestVoiceScore * 100).toFixed(1)}%`
                      : pendingChunks > 0
                      ? 'Analyzing…'
                      : 'Waiting…'}
                  </span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                    style={{ width: latestVoiceScore !== null ? `${Math.min(100, latestVoiceScore * 100).toFixed(0)}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Facial Expression */}
              <div className="p-4 rounded-lg bg-green-500/10 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-300">Facial Expression</span>
                  <span className="text-sm font-bold text-green-400">
                    {latestFacialScore !== null
                      ? `${(latestFacialScore * 100).toFixed(1)}%`
                      : pendingChunks > 0
                      ? 'Analyzing…'
                      : 'Waiting…'}
                  </span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
                    style={{ width: latestFacialScore !== null ? `${Math.min(100, latestFacialScore * 100).toFixed(0)}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Tips */}
              <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-400 mb-1">
                      {chunkResults.length > 0 ? 'AI Analysis Active' : 'Tip'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {chunkResults.length > 0
                        ? `${chunkResults.length} chunk${chunkResults.length !== 1 ? 's' : ''} analyzed.${pendingUploads > 0 ? ` ${pendingUploads} uploading…` : ''}${pendingChunks > 0 ? ` ${pendingChunks} processing…` : ''}`
                        : isChunkRecording
                        ? 'Recording in progress. First AI scores appear after 15 seconds.'
                        : 'Complete calibration to begin recording and AI analysis.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="px-6 py-6 border-t border-white/10 flex items-center justify-center gap-4">
        
        {/* Recording / Processing Indicator */}
        {isChunkRecording && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-full">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-red-400">Recording — Chunk {chunkCount}</span>
          </div>
        )}

        {/* Record Control */}
        <button
          onClick={() => {
            if (isChunkRecording) {
              stopRecorder();
            } else if (cameraStream) {
              startRecorder(cameraStream);
            }
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            isChunkRecording
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          <div className={`w-6 h-6 ${isChunkRecording ? 'rounded-sm' : 'rounded-full'} bg-white transition-all`} />
        </button>

        {/* Share Screen */}
        {/* Settings */}

        {/* Leave Button */}
        <button 
          onClick={() => { if (confirm('End the interview and see your results?')) handleLeave(); }}
          className="ml-4 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-full transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Leave
        </button>
      </div>

      {/* Results Modal */}
      {showResults && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-white/20 max-w-3xl w-full max-h-[80vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-white/10">
              <h2 className="text-2xl font-bold text-white mb-2">📊 Interview Results</h2>
              <p className="text-gray-400 text-sm">
                {chunkResults.length} chunk{chunkResults.length !== 1 ? 's' : ''} analyzed
                {pendingUploads > 0 && (
                  <span className="ml-2 text-blue-400 animate-pulse">
                    · {pendingUploads} uploading…
                  </span>
                )}
                {pendingChunks > 0 && (
                  <span className="ml-2 text-yellow-400 animate-pulse">
                    · {pendingChunks} still processing…
                  </span>
                )}
              </p>
              {sessionPersisted && (
                <p className="text-xs text-green-400 mt-2">Session analytics saved successfully.</p>
              )}
              {sessionPersistError && (
                <p className="text-xs text-red-400 mt-2">Save error: {sessionPersistError}</p>
              )}
            </div>

            <div className="p-6">
              {/* Aggregated Stats */}
              {(() => {
                const totals = chunkResults.reduce(
                  (acc, c) => {
                    const counts = getChunkGazeCounts(c);
                    return {
                      focused: acc.focused + counts.focused,
                      total: acc.total + counts.total,
                    };
                  },
                  { focused: 0, total: 0 }
                );
                const total = totals.total;
                const focused = totals.focused;
                const focusPct = total > 0 ? ((focused / total) * 100).toFixed(1) : '0';
                const avgVoice =
                  chunkResults.filter((c) => c.voice_analysis?.score != null).length > 0
                    ? (
                        chunkResults
                          .filter((c) => c.voice_analysis?.score != null)
                          .reduce((s, c) => s + c.voice_analysis!.score!, 0) /
                        chunkResults.filter((c) => c.voice_analysis?.score != null).length
                      ).toFixed(3)
                    : null;
                const allPreds = chunkResults.flatMap((c) => c.predictions);
                const avgConf =
                  allPreds.length > 0
                    ? (allPreds.reduce((s, p) => s + p.confidence, 0) / allPreds.length).toFixed(3)
                    : null;
                const avgFacial =
                  chunkResults.filter((c) => c.facial_analysis?.score != null).length > 0
                    ? (
                        chunkResults
                          .filter((c) => c.facial_analysis?.score != null)
                          .reduce((s, c) => s + c.facial_analysis!.score!, 0) /
                        chunkResults.filter((c) => c.facial_analysis?.score != null).length
                      ).toFixed(3)
                    : null;

                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 p-4 rounded-lg border border-blue-500/30">
                      <div className="text-3xl font-bold text-blue-400">{focusPct}%</div>
                      <div className="text-xs text-gray-400 mt-1">Focus Score</div>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 p-4 rounded-lg border border-emerald-500/30">
                      <div className="text-3xl font-bold text-emerald-400">
                        {avgVoice ? `${(parseFloat(avgVoice) * 100).toFixed(0)}%` : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Voice Skills</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 p-4 rounded-lg border border-purple-500/30">
                      <div className="text-3xl font-bold text-purple-400">
                        {avgConf ? `${(parseFloat(avgConf) * 100).toFixed(0)}%` : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Avg Confidence</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 p-4 rounded-lg border border-green-500/30">
                      <div className="text-3xl font-bold text-green-400">
                        {avgFacial ? `${(parseFloat(avgFacial) * 100).toFixed(0)}%` : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Facial Expression</div>
                    </div>
                  </div>
                );
              })()}

              {/* Per-chunk breakdown */}
              <div className="bg-white/5 p-4 rounded-lg border border-white/10 max-h-64 overflow-y-auto">
                <h3 className="text-sm font-semibold text-white mb-3">Per-Chunk Breakdown</h3>
                <div className="space-y-2">
                  {chunkResults.map((chunk, idx) => (
                    <div key={chunk.chunkId} className="text-xs p-3 rounded bg-white/5 border border-white/10">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-gray-400">Chunk {idx + 1}</span>
                        <div className="flex gap-3">
                          {chunk.voice_analysis?.score != null && (
                            <span className="text-emerald-400">
                              Voice: {(chunk.voice_analysis.score * 100).toFixed(0)}%
                            </span>
                          )}
                          {chunk.predictions.length > 0 && (
                            <span className="text-purple-400">
                              Conf: {(chunk.predictions[chunk.predictions.length - 1].confidence * 100).toFixed(0)}%
                            </span>
                          )}
                          {chunk.facial_analysis?.score != null && (
                            <span className="text-green-400">
                              Facial: {(chunk.facial_analysis.score * 100).toFixed(0)}%
                            </span>
                          )}
                          {(() => {
                            const counts = getChunkGazeCounts(chunk);
                            return (
                              <span className="text-gray-400">
                                Gaze: {counts.focused}/{counts.total}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                  {chunkResults.length === 0 && (
                    <p className="text-gray-500 text-xs text-center py-4">
                      {pendingChunks > 0 ? 'Waiting for first chunk to complete…' : 'No chunks analyzed yet.'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                disabled={persistingSession}
                onClick={async () => {
                  const saved = await persistInterviewSession();
                  if (!saved) {
                    const shouldLeave = confirm('Could not save this session to database. Leave anyway?');
                    if (!shouldLeave) return;
                  }

                  if (pendingChunks > 0) {
                    if (!confirm(`${pendingChunks} chunk${pendingChunks !== 1 ? 's are' : ' is'} still processing. Results will be lost. Leave anyway?`)) return;
                  }
                  releaseStream();
                  router.push('/front/homepage');
                }}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {persistingSession ? 'Saving Session…' : 'Close & Go Home'}
              </button>
              <button
                disabled={pendingChunks > 0 || pendingUploads > 0}
                onClick={exportInterviewReport}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg transition-all font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:from-purple-500/50 disabled:to-pink-500/50"
                title={pendingChunks > 0 || pendingUploads > 0 ? `Waiting for ${pendingUploads} upload${pendingUploads !== 1 ? 's' : ''} + ${pendingChunks} chunk${pendingChunks !== 1 ? 's' : ''} to finish…` : 'Download interview report'}
              >
                {pendingUploads > 0
                  ? `Uploading ${pendingUploads} chunk${pendingUploads !== 1 ? 's' : ''}…`
                  : pendingChunks > 0
                  ? `Waiting for ${pendingChunks} chunk${pendingChunks !== 1 ? 's' : ''}…`
                  : 'Download Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LiveKit Debug Panel */}
      <LiveKitDebugPanel />
    </div>
  );
}
