/**
 * Shared Type Definitions for the Interview Experience
 */

export type GazeDistribution = {
  forward: number;
  left: number;
  right: number;
  down: number;
  away: number;
};

export type PersistedChunkMetric = {
  chunk_id: string;
  chunk_index: number;
  question_index: number;
  question_text: string;
  praat_features?: Record<string, number> | null;
  gaze_distribution: GazeDistribution;
  smart_turn_probability: number | null;
  smart_turn_is_complete: boolean | null;
};

export type PersistedQuestionMetric = {
  question_index: number;
  question_text: string;
  candidate_answer: string;
  phase?: string;
  chunks: PersistedChunkMetric[];
  question_averages: {
    wpm: number | null;
    focus: number | null;
  };
};

export interface InterviewPhaseScores {
  metrics?: Record<string, number>;
  advice?: string[];
  overall?: number;
  filler_words?: Record<string, number>;
}

export type QuestionStatus = 'waiting' | 'processing' | 'streaming' | 'ready';
