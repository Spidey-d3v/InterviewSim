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
  confidence_score: number | null;
  facial_expression_score: number | null;
  voice_score: number | null;
  gaze_distribution: GazeDistribution;
};

export type PersistedQuestionMetric = {
  question_index: number;
  question_text: string;
  candidate_answer?: string;
  phase?: string;
  chunks: PersistedChunkMetric[];
  question_averages: {
    confidence_score: number | null;
    facial_expression_score: number | null;
    voice_score: number | null;
  };
};

export interface InterviewPhaseScores {
  metrics?: Record<string, number>;
  advice?: string[];
  overall?: number;
}

export type QuestionStatus = 'waiting' | 'processing' | 'streaming' | 'ready';
