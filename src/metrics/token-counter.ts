/**
 * Token Counter — character-based token estimation
 *
 * Provides lightweight token estimation using the 4 chars per token
 * heuristic, non-blank line counting, and tokens/line ratio calculation.
 * Benchmark target: 124 tokens/line (MetaGPT, REF-013).
 *
 * @module metrics/token-counter
 * @issue #173
 * @schema @agentic/code/frameworks/sdlc-complete/schemas/flows/token-efficiency.yaml
 */

// ============================================================================
// Types
// ============================================================================

export interface TokenCount {
  /** Estimated token count (4 chars per token heuristic) */
  tokens: number;
  /** Total characters in the content */
  characters: number;
  /** Number of non-blank lines */
  nonBlankLines: number;
  /** Total lines including blank */
  totalLines: number;
  /** Tokens per non-blank line ratio */
  tokensPerLine: number;
}

export interface ThresholdStatus {
  /** Green/Yellow/Red status */
  level: 'green' | 'yellow' | 'red';
  /** Human-readable status message */
  message: string;
  /** Recommended action */
  action: 'none' | 'flag_for_review' | 'generate_recommendations';
}

export interface TokenEfficiencyResult extends TokenCount {
  /** Threshold status vs benchmark */
  threshold: ThresholdStatus;
  /** Percentage vs benchmark (negative = better) */
  vsBenchmark: number;
  /** Percentage vs baseline (negative = better) */
  vsBaseline: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Average characters per token (GPT/Claude heuristic) */
export const CHARS_PER_TOKEN = 4;

/** MetaGPT benchmark: 124 tokens per line (REF-013) */
export const BENCHMARK_TOKENS_PER_LINE = 124;

/** Typical LLM baseline: ~200 tokens per line */
export const BASELINE_TOKENS_PER_LINE = 200;

/** Green threshold: at or below benchmark */
export const GREEN_MAX_TOKENS_PER_LINE = 124;

/** Yellow threshold: between benchmark and 150 */
export const YELLOW_MAX_TOKENS_PER_LINE = 150;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Estimate token count from text content using character-based heuristic.
 *
 * @param content - Text content to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

/**
 * Count non-blank lines in content.
 *
 * @param content - Text content
 * @returns Number of non-blank lines
 */
export function countNonBlankLines(content: string): number {
  if (!content) return 0;
  const lines = content.split('\n');
  return lines.filter((line) => line.trim().length > 0).length;
}

/**
 * Count total lines in content.
 *
 * @param content - Text content
 * @returns Total line count
 */
export function countTotalLines(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
}

/**
 * Perform full token count analysis on content.
 *
 * @param content - Text content to analyze
 * @returns Token count with line metrics
 */
export function countTokens(content: string): TokenCount {
  const tokens = estimateTokens(content);
  const nonBlankLines = countNonBlankLines(content);
  const totalLines = countTotalLines(content);
  const tokensPerLine = nonBlankLines > 0 ? tokens / nonBlankLines : 0;

  return {
    tokens,
    characters: content ? content.length : 0,
    nonBlankLines,
    totalLines,
    tokensPerLine: Math.round(tokensPerLine * 100) / 100,
  };
}

// ============================================================================
// Threshold Evaluation
// ============================================================================

/**
 * Determine threshold status for a tokens/line ratio.
 *
 * @param tokensPerLine - Tokens per non-blank line ratio
 * @returns Threshold status with level, message, and action
 */
export function evaluateThreshold(tokensPerLine: number): ThresholdStatus {
  if (tokensPerLine <= GREEN_MAX_TOKENS_PER_LINE) {
    return {
      level: 'green',
      message: 'Meeting benchmark',
      action: 'none',
    };
  }

  if (tokensPerLine <= YELLOW_MAX_TOKENS_PER_LINE) {
    return {
      level: 'yellow',
      message: 'Review for optimization',
      action: 'flag_for_review',
    };
  }

  return {
    level: 'red',
    message: 'Requires optimization',
    action: 'generate_recommendations',
  };
}

/**
 * Analyze token efficiency with full benchmark comparison.
 *
 * @param content - Text content to analyze
 * @returns Full efficiency result with threshold and benchmark comparison
 */
export function analyzeTokenEfficiency(content: string): TokenEfficiencyResult {
  const count = countTokens(content);
  const threshold = evaluateThreshold(count.tokensPerLine);

  const vsBenchmark =
    count.tokensPerLine > 0
      ? Math.round(((count.tokensPerLine - BENCHMARK_TOKENS_PER_LINE) / BENCHMARK_TOKENS_PER_LINE) * 10000) / 100
      : 0;

  const vsBaseline =
    count.tokensPerLine > 0
      ? Math.round(((count.tokensPerLine - BASELINE_TOKENS_PER_LINE) / BASELINE_TOKENS_PER_LINE) * 10000) / 100
      : 0;

  return {
    ...count,
    threshold,
    vsBenchmark,
    vsBaseline,
  };
}
