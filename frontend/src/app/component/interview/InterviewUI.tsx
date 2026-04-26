'use client';

import React from 'react';
import { type QuestionStatus } from '../../../types/interview';

// --- Header Component ---
interface HeaderProps {
  isChunkRecording: boolean;
  chunkCount: number;
  recordingTime: number;
  pendingChunks: number;
  isFullscreen: boolean;
  interviewStarted: boolean;
  visionConnected: boolean;
  visionError: string | null;
  permissionStatus: string;
  isPaused: boolean;
  onExitFullscreen: () => void;
  onEnterFullscreen: () => void;
  onLeave: () => void;
  formatTime: (s: number) => string;
}

export function InterviewHeader({
  isChunkRecording,
  chunkCount,
  recordingTime,
  pendingChunks,
  isFullscreen,
  interviewStarted,
  visionConnected,
  visionError,
  permissionStatus,
  isPaused,
  onExitFullscreen,
  onEnterFullscreen,
  onLeave,
  formatTime,
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 z-20 bg-[#0a0a0f]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center font-bold text-sm">AI</div>
        <span className="text-xl font-bold tracking-tight">InterviewAR</span>
        {isPaused ? (
          <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-full">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            <span className="text-sm text-yellow-400 font-mono font-bold uppercase tracking-widest">Paused</span>
          </div>
        ) : isChunkRecording ? (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-red-400 font-mono">● Chunk {chunkCount} | {formatTime(recordingTime)}</span>
          </div>
        ) : null}
        {pendingChunks > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-full">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            <span className="text-sm text-yellow-400 font-mono">Analyzing {pendingChunks} chunks…</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {isFullscreen ? (
          <button onClick={onExitFullscreen} className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm font-medium rounded-lg border border-blue-500/30 flex items-center gap-2">
            Exit Fullscreen
          </button>
        ) : interviewStarted && (
          <button onClick={onEnterFullscreen} className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm font-medium rounded-lg border border-blue-500/30 flex items-center gap-2">
            Fullscreen
          </button>
        )}
        {visionError ? <StatusBadge label="Vision Offline" color="red" /> : visionConnected && <StatusBadge label="Vision Server" color="green" />}
        {permissionStatus === 'denied' && <StatusBadge label="Camera/Mic Denied" color="red" />}
        <button onClick={() => confirm('End the interview?') && onLeave()} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
          End Interview
        </button>
      </div>
    </div>
  );
}

// --- Main Display Component ---
interface MainDisplayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  permissionStatus: string;
  permissionError: string | null;
  interviewStarted: boolean;
  currentPhase: string;
  questionStatus: QuestionStatus;
  streamingQuestion: string | null;
  aiQuestions: string[];
  questionIndex: number;
  isChunkRecording: boolean;
  isPaused: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function InterviewMainDisplay({
  videoRef,
  permissionStatus,
  permissionError,
  interviewStarted,
  currentPhase,
  questionStatus,
  streamingQuestion,
  aiQuestions,
  questionIndex,
  isChunkRecording,
  isPaused,
  onPrev,
  onNext,
}: MainDisplayProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] opacity-50" />
      </div>

      <div className="relative w-full max-w-5xl aspect-video">
        <div className="relative w-full h-full bg-black rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl">
          <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${permissionStatus === 'granted' ? 'block' : 'hidden'}`} />
          
          {permissionStatus !== 'granted' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <p className="text-white text-center px-4">{permissionStatus === 'pending' ? 'Requesting Camera & Mic Access...' : (permissionError ?? 'Permission Denied')}</p>
            </div>
          )}

          {isPaused && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-10">
              <div className="text-center">
                <div className="w-20 h-20 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <svg className="w-10 h-10 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </div>
                <h2 className="text-3xl font-bold text-white mb-2 uppercase tracking-tighter">Session Paused</h2>
                <p className="text-gray-400">Press Play to continue the interview</p>
              </div>
            </div>
          )}

          {isChunkRecording && !isPaused && <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-600/80 backdrop-blur-sm rounded-full animate-pulse text-[10px] font-bold">REC</div>}

          <div className="absolute top-4 right-4 px-3 py-2 bg-gradient-to-br from-purple-500/80 to-pink-500/80 backdrop-blur-sm rounded-lg border border-white/30 text-xs font-medium">
            {interviewStarted ? `AI Monitoring • Phase: ${currentPhase.toUpperCase().replace('_', ' ')}` : 'Calibrating'}
          </div>

          {interviewStarted && (
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-purple-400 font-mono uppercase tracking-wider">
                    {questionStatus === 'streaming' ? 'AI is speaking...' : `Question ${questionIndex + 1} of ${aiQuestions.length || 1}`}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={onPrev} disabled={questionIndex === 0} className="px-2 py-1 text-xs text-gray-500 hover:text-white disabled:opacity-20 transition-all">← Prev</button>
                    <button onClick={onNext} disabled={questionIndex >= aiQuestions.length - 1} className="px-2 py-1 text-xs text-gray-500 hover:text-white disabled:opacity-20 transition-all">Next →</button>
                  </div>
                </div>
                <p className="text-lg text-white font-medium drop-shadow-md">
                   {streamingQuestion || aiQuestions[questionIndex] || (questionStatus === 'processing' ? '...' : 'Introduce yourself.')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Control Bar Component ---
interface ControlsProps {
  isChunkRecording: boolean;
  cameraStream: MediaStream | null;
  isPaused: boolean;
  onTogglePause: () => void;
  onStop: () => void;
  onStart: (s: MediaStream) => void;
  onLeave: () => void;
}

export function InterviewControls({
  isChunkRecording,
  cameraStream,
  isPaused,
  onTogglePause,
  onStop,
  onStart,
  onLeave,
}: ControlsProps) {
  return (
    <div className="px-6 py-6 border-t border-white/10 flex items-center justify-center gap-6 bg-[#0a0a0f]">
      {/* RECORD BUTTON */}
      {!isPaused && (
        <button
          onClick={() => isChunkRecording ? onStop() : (cameraStream && onStart(cameraStream))}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl ${isChunkRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-white/10 hover:bg-white/20'}`}
        >
          <div className={`w-5 h-5 ${isChunkRecording ? 'rounded-sm' : 'rounded-full'} bg-white transition-all`} />
        </button>
      )}

      {/* PAUSE/RESUME BUTTON */}
      <button
        onClick={onTogglePause}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl ${isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-white/10 hover:bg-white/20'}`}
      >
        {isPaused ? (
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        )}
      </button>

      <button onClick={() => confirm('End the interview and see results?') && onLeave()} className="ml-4 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-full transition-all flex items-center gap-2 shadow-lg">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        Leave Interview
      </button>
    </div>
  );
}

function StatusBadge({ label, color }: { label: string, color: 'red' | 'green' }) {
  const styles = color === 'red' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-green-500/20 border-green-500/30 text-green-400';
  return (
    <div className={`px-3 py-1.5 border rounded-lg text-xs flex items-center gap-2 ${styles}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${color === 'red' ? 'bg-red-400' : 'bg-green-400'}`} />
      {label}
    </div>
  );
}
