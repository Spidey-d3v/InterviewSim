'use client';

import React from 'react';
import { type TelemetryData } from '../hooks/useTelemetry';

interface AnalyticsPanelProps {
  isVisible: boolean;
  telemetry: TelemetryData;
  isChunkRecording: boolean;
}

export default function AnalyticsPanel({
  isVisible,
  telemetry,
  isChunkRecording,
}: AnalyticsPanelProps) {
  if (!isVisible) return null;

  // focusPct: 100% when gazeDarting is 0, 0% when gazeDarting is 1
  const focusPct = Math.max(0, Math.min(100, (1 - telemetry.gazeDarting) * 100));

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
          value={`${focusPct.toFixed(0)}%`}
          percent={focusPct}
          color={focusPct > 80 ? "bg-green-500" : focusPct > 50 ? "bg-yellow-500" : "bg-red-500"}
        />


        {/* Tips */}
        <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-400 mb-1">
                {isChunkRecording ? 'AI Tracking Active' : 'Tip'}
              </p>
              <p className="text-sm text-gray-400">
                {isChunkRecording
                  ? (telemetry.gazeDarting > 0.6 ? 'Warning: Frequent looking away detected.' : 'Maintaining good eye contact.')
                  : 'Waiting for interview to start...'}
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
