'use client';

import React from 'react';
import { type ChunkResult } from '../../hooks/useVisionSession';
import { getChunkGazeCounts } from '../../../utils/interview-metrics';

interface AnalyticsPanelProps {
  isVisible: boolean;
  chunkResults: ChunkResult[];
  latestConfidence: number | null;
  latestVoiceScore: number | null;
  pendingChunks: number;
  pendingUploads: number;
  isChunkRecording: boolean;
}

export default function AnalyticsPanel({
  isVisible,
  chunkResults,
  latestConfidence,
  latestVoiceScore,
  pendingChunks,
  pendingUploads,
  isChunkRecording,
}: AnalyticsPanelProps) {
  if (!isVisible) return null;

  const gazeTotals = chunkResults.reduce(
    (acc, c) => {
      const counts = getChunkGazeCounts(c);
      return { focused: acc.focused + counts.focused, total: acc.total + counts.total };
    },
    { focused: 0, total: 0 }
  );

  const focusPct = gazeTotals.total > 0 ? (gazeTotals.focused / gazeTotals.total) * 100 : null;

  return (
    <div className="absolute right-6 top-6 bottom-24 w-80 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm rounded-2xl border border-white/10 p-6 overflow-y-auto z-10">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Live Analytics
      </h3>

      <div className="space-y-4">
        {/* Eye Contact */}
        <MetricSection
          label="Eye Contact"
          value={focusPct !== null ? `${focusPct.toFixed(0)}%` : 'Tracking…'}
          percent={focusPct ?? 0}
          color="bg-purple-500"
        />

        {/* Confidence */}
        <MetricSection
          label="AI Confidence Score"
          value={latestConfidence !== null ? `${(latestConfidence * 100).toFixed(1)}%` : 'Analyzing…'}
          percent={latestConfidence !== null ? latestConfidence * 100 : 0}
          color="bg-gradient-to-r from-blue-500 to-cyan-400"
          subtext={chunkResults.length > 0 ? `Based on ${chunkResults.length} chunks` : undefined}
        />

        {/* Voice */}
        <MetricSection
          label="Voice Skills"
          value={latestVoiceScore !== null ? `${(latestVoiceScore * 100).toFixed(1)}%` : 'Waiting…'}
          percent={latestVoiceScore !== null ? latestVoiceScore * 100 : 0}
          color="bg-gradient-to-r from-emerald-500 to-teal-400"
        />

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
                  ? `${chunkResults.length} chunks analyzed.${pendingUploads > 0 ? ` ${pendingUploads} uploading…` : ''}${pendingChunks > 0 ? ` ${pendingChunks} processing…` : ''}`
                  : isChunkRecording
                  ? 'Recording in progress. Scores appear after first turn.'
                  : 'Complete calibration to begin.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricSectionProps {
  label: string;
  value: string;
  percent: number;
  color: string;
  subtext?: string;
}

function MetricSection({ label, value, percent, color, subtext }: MetricSectionProps) {
  return (
    <div className="p-4 rounded-lg bg-white/5 border border-white/10">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-300">{label}</span>
        <span className={`text-sm font-bold ${color.includes('blue') ? 'text-blue-400' : 'text-purple-400'}`}>{value}</span>
      </div>
      <div className="h-2 bg-black/30 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      {subtext && <div className="mt-2 text-[10px] text-gray-500">{subtext}</div>}
    </div>
  );
}
