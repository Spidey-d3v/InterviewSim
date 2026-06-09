/**
 * Utility Functions for Interview Metrics & Calculations
 */

import { type ChunkResult, type GazeLogEntry } from '../app/hooks/useVisionSession';
import { type GazeDistribution } from '../types/interview';

/**
 * Calculates the mean of an array of numbers, filtering out null/NaN
 */
export const mean = (values: Array<number | null | undefined>): number | null => {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
};

/**
 * Formats seconds into MM:SS
 */
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Formats a decimal score (0-1) into a percentage string
 */
export const scoreCell = (v: number | null): string =>
  (v == null || !Number.isFinite(v) ? 'N/A' : `${(v * 100).toFixed(1)}%`);

/**
 * Builds a gaze distribution object from raw log entries
 */
export const buildGazeDistribution = (gazeData: GazeLogEntry[]): GazeDistribution => {
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

/**
 * Extracts focus counts from a processed chunk result
 */
export const getChunkGazeCounts = (chunk: ChunkResult): { focused: number; total: number } => {

  const total = chunk.gaze_data.length;
  const focused = chunk.gaze_data.filter((e) => {
    const s = (e.status || '').toLowerCase();
    return s.includes('forward');
  }).length;
  return { focused, total };
};

/**
 * Builds distribution for a specific chunk
 */
export const buildChunkGazeDistribution = (chunk: ChunkResult): GazeDistribution => {

  return buildGazeDistribution(chunk.gaze_data);
};
