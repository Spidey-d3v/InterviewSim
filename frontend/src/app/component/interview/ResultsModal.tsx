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

  const exportInterviewReport = useCallback(async () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // --- Dossier Palette ---
    const COLORS = {
      INDIGO: [99, 102, 241],
      PINK: [236, 72, 153],
      GOLD: [234, 179, 8],
      BG_GREY: [249, 250, 251],
      TEXT_DARK: [17, 24, 39],
      TEXT_LIGHT: [107, 114, 128],
      BORDER: [229, 231, 235]
    };

    const drawHeader = () => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(24);
      pdf.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
      pdf.text('Performance Evaluation Dossier', margin, y + 20);
      
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(COLORS.TEXT_LIGHT[0], COLORS.TEXT_LIGHT[1], COLORS.TEXT_LIGHT[2]);
      pdf.text(`SESSION PROTOCOL: ${(interviewSessionId || 'N/A').toUpperCase()} • GENERATED ON ${dateStr}`, margin, y + 35);
      
      y += 45;
      pdf.setDrawColor(COLORS.INDIGO[0], COLORS.INDIGO[1], COLORS.INDIGO[2]);
      pdf.setLineWidth(2);
      pdf.line(margin, y, margin + 120, y);
      y += 35;
    };

    const ensureSpace = (required: number) => {
      if (y + required > pageHeight - margin) {
        pdf.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    // 1. Calculations
    const allGaze = chunkResults.flatMap((c) => c.gaze_data);
    const totalGaze = allGaze.length;
    const focusedGaze = allGaze.filter((e) => {
      const s = (e.status || '').toLowerCase();
      return !s.includes('away') && (s.includes('forward') || s.includes('left') || s.includes('right') || s.includes('down'));
    }).length;
    const focusPct = totalGaze > 0 ? (focusedGaze / totalGaze) * 100 : 0;

    const voiceVals = chunkResults.map(c => c.voice_analysis?.score).filter((v): v is number => typeof v === 'number');
    const confVals = chunkResults.flatMap(c => c.predictions.map(p => p.confidence)).filter((v): v is number => typeof v === 'number');

    const avgVoice = voiceVals.length > 0 ? (voiceVals.reduce((a, b) => a + b, 0) / voiceVals.length) * 100 : 0;
    const avgConf = confVals.length > 0 ? (confVals.reduce((a, b) => a + b, 0) / confVals.length) * 100 : 0;

    // 2. Render Header
    drawHeader();

    // 3. Summary Cards
    const cardWidth = (contentWidth - 10) / 2;
    const cardHeight = 60;
    
    [
      { label: 'CONFIDENCE', val: `${Math.round(avgConf)}%` },
      { label: 'COMMUNICATION', val: `${Math.round(avgVoice)}%` },
    ].forEach((card, i) => {
      const x = margin + i * (cardWidth + 10);
      pdf.setFillColor(COLORS.BG_GREY[0], COLORS.BG_GREY[1], COLORS.BG_GREY[2]);
      pdf.rect(x, y, cardWidth, cardHeight, 'F');
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(COLORS.INDIGO[0], COLORS.INDIGO[1], COLORS.INDIGO[2]);
      pdf.text(card.val, x + cardWidth/2, y + 30, { align: 'center' });
      
      pdf.setFontSize(7);
      pdf.setTextColor(COLORS.TEXT_LIGHT[0], COLORS.TEXT_LIGHT[1], COLORS.TEXT_LIGHT[2]);
      pdf.text(card.label, x + cardWidth/2, y + 45, { align: 'center' });
    });
    y += cardHeight + 40;

    // 4. Phase Analysis
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
    pdf.text('PHASE-WISE PERFORMANCE ANALYSIS', margin, y);
    y += 20;

    const phaseGroups = new Map<string, PersistedQuestionMetric[]>();
    questionMetrics.forEach(q => {
      const p = q.phase || 'unknown';
      if (!phaseGroups.has(p)) phaseGroups.set(p, []);
      phaseGroups.get(p)!.push(q);
    });

    for (const [phase, phaseQs] of phaseGroups.entries()) {
      ensureSpace(150);
      const pScores = finalScores && finalScores[phase] ? finalScores[phase] : null;

      // Phase Container
      const startY = y;
      pdf.setDrawColor(COLORS.BORDER[0], COLORS.BORDER[1], COLORS.BORDER[2]);
      pdf.setLineWidth(1);
      
      // Phase Header
      y += 20;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
      pdf.text(phase.toUpperCase().replace(/_/g, ' '), margin + 15, y);
      
      if (pScores) {
        pdf.setTextColor(COLORS.PINK[0], COLORS.PINK[1], COLORS.PINK[2]);
        pdf.text(`EFFICIENCY: ${pScores.overall || 0}/10`, margin + contentWidth - 15, y, { align: 'right' });
      }
      y += 10;
      pdf.line(margin + 15, y, margin + contentWidth - 15, y);
      y += 20;

      // Metrics Badges
      if (pScores?.metrics) {
        let badgeX = margin + 15;
        Object.entries(pScores.metrics).forEach(([k, v]) => {
          const txt = `${k.replace(/_/g, ' ')}: ${v}/10`.toUpperCase();
          const tw = pdf.getTextWidth(txt) + 10;
          if (badgeX + tw > margin + contentWidth - 15) { badgeX = margin + 15; y += 20; }
          
          pdf.setFillColor(243, 244, 246);
          pdf.rect(badgeX, y - 10, tw, 14, 'F');
          pdf.setFontSize(7);
          pdf.setTextColor(75, 85, 99);
          pdf.text(txt, badgeX + 5, y);
          badgeX += tw + 8;
        });
        y += 20;
      }

      // Advice Box
      if (pScores?.advice && pScores.advice.length > 0) {
        const adviceLines = pScores.advice.flatMap(a => pdf.splitTextToSize(`• ${a}`, contentWidth - 50));
        const boxHeight = adviceLines.length * 12 + 25;
        ensureSpace(boxHeight);
        
        pdf.setFillColor(254, 252, 232);
        pdf.rect(margin + 15, y, contentWidth - 30, boxHeight, 'F');
        pdf.setDrawColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
        pdf.setLineWidth(3);
        pdf.line(margin + 15, y, margin + 15, y + boxHeight);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(133, 77, 14);
        pdf.text('STRATEGIC ADVICE', margin + 25, y + 15);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(113, 63, 18);
        adviceLines.forEach((line: string, i: number) => {
          pdf.text(line, margin + 25, y + 30 + (i * 12));
        });
        y += boxHeight + 15;
      }

      // --- ADDED: Filler Words Summary ---
      if (pScores?.filler_words && Object.keys(pScores.filler_words).length > 0) {
        ensureSpace(60);
        pdf.setFillColor(254, 242, 242);
        pdf.rect(margin + 15, y, contentWidth - 30, 45, 'F');
        pdf.setDrawColor(239, 68, 68);
        pdf.setLineWidth(3);
        pdf.line(margin + 15, y, margin + 15, y + 45);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(153, 27, 27);
        pdf.text('VERBAL HABITS (FILLER WORDS)', margin + 25, y + 15);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(185, 28, 28);
        const fillers = Object.entries(pScores.filler_words)
          .map(([w, c]) => `${w.toUpperCase()}: ${c}`)
          .join('  |  ');
        pdf.text(fillers, margin + 25, y + 30);
        y += 60;
      }

      // --- ADDED: Question Detail & Transcript ---
      phaseQs.forEach((q) => {
        ensureSpace(80);
        pdf.setDrawColor(COLORS.BORDER[0], COLORS.BORDER[1], COLORS.BORDER[2]);
        pdf.setLineWidth(0.5);
        pdf.line(margin + 15, y, margin + contentWidth - 15, y); // Subtle separator
        y += 15;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        
        const qLines = pdf.splitTextToSize(`Q: ${q.question_text}`, contentWidth - 40);
        qLines.forEach((line: string) => {
          pdf.text(line, margin + 15, y);
          y += 12;
        });

        if (q.candidate_answer) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(8.5);
          pdf.setTextColor(COLORS.TEXT_LIGHT[0], COLORS.TEXT_LIGHT[1], COLORS.TEXT_LIGHT[2]);
          const aLines = pdf.splitTextToSize(`Candidate Response: "${q.candidate_answer}"`, contentWidth - 60);
          aLines.forEach((line: string) => {
            ensureSpace(12);
            pdf.text(line, margin + 25, y);
            y += 11;
          });
          y += 5;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(COLORS.INDIGO[0], COLORS.INDIGO[1], COLORS.INDIGO[2]);
        pdf.text(`Confidence: ${scoreCell(q.question_averages.confidence_score)}  |  Voice: ${scoreCell(q.question_averages.voice_score)}`, margin + 25, y);
        y += 20;
      });

      y += 10;
    }

    // Footer
    const footerY = pageHeight - 30;
    pdf.setDrawColor(243, 244, 246);
    pdf.line(margin, footerY - 10, margin + contentWidth, footerY - 10);
    pdf.setFontSize(7);
    pdf.setTextColor(156, 163, 175);
    pdf.text('© 2026 InterviewAI Behavioral Analytics Platform', margin, footerY);
    pdf.text(`Confidential Report • Ref: ${(interviewSessionId || '').slice(0, 8)}`, margin + contentWidth, footerY, { align: 'right' });

    pdf.save(`interview-report-${(interviewSessionId || '').slice(0, 8) || Date.now()}.pdf`);
  }, [chunkResults, questionMetrics, finalScores, interviewSessionId, interviewStartedAt, currentUserId, recordingTime]);


  if (!show) return null;

  // Calculate live UI stats
  const liveFocusPct = mean(chunkResults.map(c => {
    const counts = getChunkGazeCounts(c);
    return counts.total > 0 ? (counts.focused / counts.total) * 100 : 0;
  })) ?? 0;

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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <StatCard label="Focus Score" value={`${liveFocusPct.toFixed(1)}%`} color="blue" />
            <StatCard label="Voice Skills" value={scoreCell(mean(chunkResults.map(c => c.voice_analysis?.score)))} color="emerald" />
            <StatCard label="Avg Confidence" value={scoreCell(mean(chunkResults.flatMap(c => c.predictions.map(p => p.confidence))))} color="purple" />
          </div>

          <div className="bg-white/5 p-4 rounded-lg border border-white/10 max-h-64 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">Per-Chunk Breakdown</h3>
            <div className="space-y-2">
              {chunkResults.map((chunk, idx) => {
                const counts = getChunkGazeCounts(chunk);
                return (
                  <div key={`${chunk.chunkId}-${idx}`} className="text-xs p-3 rounded bg-white/5 border border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-gray-400">Chunk {idx + 1}</span>
                      <div className="flex gap-3">
                        <MetricSpan label="Voice" val={chunk.voice_analysis?.score} color="emerald" />
                        <MetricSpan label="Conf" val={chunk.predictions.length > 0 ? chunk.predictions.at(-1)?.confidence : null} color="purple" />
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
