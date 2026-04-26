'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { jsPDF } from 'jspdf';
import { type ChunkResult } from '../../hooks/useVisionSession';
import {
  type PersistedQuestionMetric,
  type InterviewPhaseScores
} from '../../../types/interview';
import {
  mean,
  scoreCell,
  getChunkGazeCounts
} from '../../../utils/interview-metrics';

interface ResultsModalProps {
  show: boolean;
  chunkResults: ChunkResult[];
  questionMetrics: PersistedQuestionMetric[];
  finalScores: Record<string, InterviewPhaseScores> | null;
  interviewSessionId: string | null;
  interviewStartedAt: string | null;
  currentUserId: string | null;
  recordingTime: number;
  pendingUploads: number;
  pendingChunks: number;
  persistingSession: boolean;
  sessionPersisted: boolean;
  sessionPersistError: string | null;
  onPersist: () => Promise<boolean>;
  onClose: () => void;
}

export default function ResultsModal({
  show,
  chunkResults,
  questionMetrics,
  finalScores,
  interviewSessionId,
  interviewStartedAt,
  currentUserId,
  recordingTime,
  pendingUploads,
  pendingChunks,
  persistingSession,
  sessionPersisted,
  sessionPersistError,
  onPersist,
  onClose,
}: ResultsModalProps) {
  const router = useRouter();

  // Calculate overall gaze stats for both UI and PDF
  const totalGazeStats = chunkResults.reduce((acc, c) => {
    const counts = getChunkGazeCounts(c);
    return { focused: acc.focused + counts.focused, total: acc.total + counts.total };
  }, { focused: 0, total: 0 });

  const focusPct = totalGazeStats.total > 0 ? (totalGazeStats.focused / totalGazeStats.total) * 100 : 0;

  const exportInterviewReport = useCallback(async () => {
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

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
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

    const addWrappedText = (text: string, options?: { bold?: boolean; size?: number; bottomGap?: number }) => {
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

    const phaseGroups = new Map<string, PersistedQuestionMetric[]>();
    questionMetrics.forEach(q => {
      const p = q.phase || 'unknown';
      if (!phaseGroups.has(p)) phaseGroups.set(p, []);
      phaseGroups.get(p)!.push(q);
    });

    addWrappedText('Phase-wise Breakdown', { bold: true, size: 14, bottomGap: 4 });

    if (questionMetrics.length === 0) {
      addWrappedText('No question metrics available.', { bottomGap: 8 });
    } else {
      for (const [phase, phaseQs] of phaseGroups.entries()) {
        ensureSpace(lineHeight * 3);
        const phaseName = phase.toUpperCase().replace('_', ' ');
        const pScores = finalScores && finalScores[phase] ? finalScores[phase] : null;

        addWrappedText(`--- PHASE: ${phaseName} ---`, { bold: true, size: 12, bottomGap: 4 });
        if (pScores) {
          if (pScores.metrics) {
            const metricsText = Object.entries(pScores.metrics)
              .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1).replace('_', ' ')}: ${v || 0}`)
              .join(' | ');
            addWrappedText(metricsText, { size: 10, bottomGap: 4 });
          }

          if (pScores.advice && pScores.advice.length > 0) {
            addWrappedText(`AI Advice:`, { bold: true, size: 10 });
            pScores.advice.forEach((adv: string) => addWrappedText(`• ${adv}`, { size: 9 }));
            addWrappedText(` `, { bottomGap: 4 });
          }
        }

        phaseQs.forEach((q) => {
          ensureSpace(lineHeight * 6);
          addWrappedText(`Q. ${q.question_text}`, { bold: true });
          if (q.candidate_answer) {
            addWrappedText(`Candidate: "${q.candidate_answer.length > 300 ? q.candidate_answer.substring(0, 300) + '...' : q.candidate_answer}"`, { size: 10, bottomGap: 2 });
          }
          addWrappedText(`Confidence: ${scoreCell(q.question_averages.confidence_score)}`);
          addWrappedText(`Voice: ${scoreCell(q.question_averages.voice_score)}`);
          addWrappedText(`Facial: ${scoreCell(q.question_averages.facial_expression_score)}`);
          addWrappedText(`Chunks: ${q.chunks.length}`, { bottomGap: 6 });
        });
      }
    }

    addWrappedText('Generated from actual session data only (no synthetic placeholders).', { size: 10 });
    pdf.save(`interview-report-${interviewSessionId ?? Date.now()}.pdf`);
  }, [chunkResults, questionMetrics, finalScores, interviewSessionId, interviewStartedAt, currentUserId, recordingTime, focusPct]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-white/20 max-w-3xl w-full max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white mb-2">📊 Interview Results</h2>
          <p className="text-gray-400 text-sm">
            {chunkResults.length} chunk{chunkResults.length !== 1 ? 's' : ''} analyzed
            {pendingUploads > 0 && <span className="ml-2 text-blue-400 animate-pulse">· {pendingUploads} uploading…</span>}
            {pendingChunks > 0 && <span className="ml-2 text-yellow-400 animate-pulse">· {pendingChunks} still processing…</span>}
          </p>
          {sessionPersisted && <p className="text-xs text-green-400 mt-2">Session analytics saved successfully.</p>}
          {sessionPersistError && <p className="text-xs text-red-400 mt-2">Save error: {sessionPersistError}</p>}
        </div>

        <div className="p-6">
          {/* Summary Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Focus Score" value={`${focusPct.toFixed(1)}%`} color="blue" />
            <StatCard label="Voice Skills" value={scoreCell(mean(chunkResults.map(c => c.voice_analysis?.score)))} color="emerald" />
            <StatCard label="Avg Confidence" value={scoreCell(mean(chunkResults.flatMap(c => c.predictions.map(p => p.confidence))))} color="purple" />
            <StatCard label="Facial Expression" value={scoreCell(mean(chunkResults.map(c => c.facial_analysis?.score)))} color="green" />
          </div>

          {/* Per-chunk breakdown */}
          <div className="bg-white/5 p-4 rounded-lg border border-white/10 max-h-64 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">Per-Chunk Breakdown</h3>
            <div className="space-y-2">
              {chunkResults.map((chunk, idx) => {
                const counts = getChunkGazeCounts(chunk);
                return (
                  <div key={chunk.chunkId} className="text-xs p-3 rounded bg-white/5 border border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-gray-400">Chunk {idx + 1}</span>
                      <div className="flex gap-3">
                        <MetricSpan label="Voice" val={chunk.voice_analysis?.score} color="emerald" />
                        <MetricSpan label="Conf" val={chunk.predictions.length > 0 ? chunk.predictions.at(-1)?.confidence : null} color="purple" />
                        <MetricSpan label="Facial" val={chunk.facial_analysis?.score} color="green" />
                        <span className="text-gray-400">Gaze: {counts.focused}/{counts.total}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {chunkResults.length === 0 && <p className="text-gray-500 text-xs text-center py-4">No chunks analyzed yet.</p>}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/10 flex gap-3">
          <button
            disabled={persistingSession}
            onClick={async () => {
              const saved = await onPersist();
              if (saved || confirm('Could not save to database. Leave anyway?')) {
                onClose();
                router.push('/');
              }
            }}
            className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            {persistingSession ? 'Saving…' : 'Close & Go Home'}
          </button>
          <button
            disabled={pendingChunks > 0 || pendingUploads > 0}
            onClick={exportInterviewReport}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg transition-all font-medium disabled:opacity-40"
          >
            Download Report
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400',
    emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30 text-green-400',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} p-4 rounded-lg border`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function MetricSpan({ label, val, color }: { label: string; val?: number | null; color: string }) {
  const colors: Record<string, string> = { emerald: 'text-emerald-400', purple: 'text-purple-400', green: 'text-green-400' };
  return val != null ? <span className={colors[color]}>{label}: {(val * 100).toFixed(0)}%</span> : null;
}
