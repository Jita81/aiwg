/**
 * Model types for AIWG evaluation suite
 * Extends matric-eval types from @matric/eval-client
 */

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  stream?: boolean;
}

export interface GenerationResult {
  text: string;
  tokensGenerated: number;
  totalTime: number;
  timeToFirstToken?: number;
}

export interface GenerationModel {
  readonly name: string;
  generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;
}

export interface TestCase {
  id: string;
  dimension: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  prompt: string;
  expected: Record<string, unknown>;
  scoring: Record<string, number>;
}

export interface EvalResult {
  testCaseId: string;
  dimension: string;
  score: number;
  maxScore: number;
  details: Record<string, unknown>;
  latencyMs: number;
  modelResponse: string;
}

export interface DimensionScore {
  dimension: string;
  score: number;
  tier: 'opus' | 'sonnet' | 'haiku' | 'not-recommended';
  testCases: number;
  passed: number;
}

export interface EvalReport {
  model: string;
  backend: string;
  date: string;
  aiwgVersion: string;
  dimensions: DimensionScore[];
  overall: number;
  overallTier: 'opus' | 'sonnet' | 'haiku' | 'not-recommended';
  totalLatencyMs: number;
  /** Standard benchmark scores from matric-eval, present when --include-matric-benchmarks is set */
  matricBenchmarks?: import('@matric/eval-client').ModelResult;
}
