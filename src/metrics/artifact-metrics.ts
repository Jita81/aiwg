/**
 * Artifact Metrics — record and query per-artifact token metrics
 *
 * Hooks into artifact save events, records path/type/agent/timestamp/tokens,
 * and persists to `.aiwg/metrics/tokens/`.
 *
 * @module metrics/artifact-metrics
 * @issue #173
 * @schema @agentic/code/frameworks/sdlc-complete/schemas/flows/token-efficiency.yaml
 */

import { promises as fs } from 'fs';
import path from 'path';
import {
  countTokens,
  evaluateThreshold,
  BENCHMARK_TOKENS_PER_LINE,
  BASELINE_TOKENS_PER_LINE,
  type ThresholdStatus,
} from './token-counter.js';

// ============================================================================
// Types
// ============================================================================

export interface ArtifactMetricRecord {
  /** Artifact file path (relative to project root) */
  artifactPath: string;
  /** Artifact type (requirement, use_case, architecture, etc.) */
  artifactType: string;
  /** Agent that produced the artifact */
  agent: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Token metrics */
  tokens: {
    totalTokens: number;
    nonBlankLines: number;
    tokensPerLine: number;
    characters: number;
  };
  /** Threshold status */
  thresholdStatus: ThresholdStatus['level'];
}

export interface AgentEfficiencySummary {
  agentName: string;
  period: string;
  totalArtifacts: number;
  totalTokens: number;
  totalLines: number;
  avgTokensPerLine: number;
  minTokensPerLine: number;
  maxTokensPerLine: number;
  vsBenchmark: number;
  vsBaseline: number;
  trend: 'improving' | 'stable' | 'degrading';
  thresholdStatus: ThresholdStatus['level'];
}

export interface MetricsQueryOptions {
  /** Filter by agent name */
  agent?: string;
  /** Filter records since this ISO date or duration string (e.g. '7d', '30d') */
  since?: string;
  /** Include benchmark comparison */
  compareBenchmark?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const METRICS_DIR = '.aiwg/metrics/tokens';
const RECORDS_FILE = 'records.json';

// ============================================================================
// ArtifactMetricsStore
// ============================================================================

export class ArtifactMetricsStore {
  private projectPath: string;
  private metricsDir: string;
  private records: ArtifactMetricRecord[];

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.metricsDir = path.join(projectPath, METRICS_DIR);
    this.records = [];
  }

  /**
   * Record metrics for an artifact after save.
   */
  async recordArtifact(
    artifactPath: string,
    content: string,
    artifactType: string,
    agent: string
  ): Promise<ArtifactMetricRecord> {
    const tokenCount = countTokens(content);
    const threshold = evaluateThreshold(tokenCount.tokensPerLine);

    const relativePath = path.isAbsolute(artifactPath)
      ? path.relative(this.projectPath, artifactPath)
      : artifactPath;

    const record: ArtifactMetricRecord = {
      artifactPath: relativePath,
      artifactType,
      agent,
      timestamp: new Date().toISOString(),
      tokens: {
        totalTokens: tokenCount.tokens,
        nonBlankLines: tokenCount.nonBlankLines,
        tokensPerLine: tokenCount.tokensPerLine,
        characters: tokenCount.characters,
      },
      thresholdStatus: threshold.level,
    };

    this.records.push(record);
    await this.persist();

    return record;
  }

  /**
   * Query records with optional filters.
   */
  queryRecords(options: MetricsQueryOptions = {}): ArtifactMetricRecord[] {
    let filtered = [...this.records];

    if (options.agent) {
      const agentLower = options.agent.toLowerCase();
      filtered = filtered.filter(
        (r) => r.agent.toLowerCase() === agentLower
      );
    }

    if (options.since) {
      const sinceDate = parseSinceDate(options.since);
      if (sinceDate) {
        filtered = filtered.filter(
          (r) => new Date(r.timestamp) >= sinceDate
        );
      }
    }

    return filtered;
  }

  /**
   * Get per-agent efficiency summaries.
   */
  getAgentSummaries(options: MetricsQueryOptions = {}): AgentEfficiencySummary[] {
    const records = this.queryRecords(options);
    const byAgent = new Map<string, ArtifactMetricRecord[]>();

    for (const record of records) {
      const existing = byAgent.get(record.agent) || [];
      existing.push(record);
      byAgent.set(record.agent, existing);
    }

    const summaries: AgentEfficiencySummary[] = [];

    for (const [agentName, agentRecords] of byAgent) {
      const totalTokens = agentRecords.reduce(
        (sum, r) => sum + r.tokens.totalTokens, 0
      );
      const totalLines = agentRecords.reduce(
        (sum, r) => sum + r.tokens.nonBlankLines, 0
      );
      const avgTokensPerLine = totalLines > 0 ? totalTokens / totalLines : 0;

      const tokensPerLineValues = agentRecords.map((r) => r.tokens.tokensPerLine);
      const minTokensPerLine = Math.min(...tokensPerLineValues);
      const maxTokensPerLine = Math.max(...tokensPerLineValues);

      const vsBenchmark =
        avgTokensPerLine > 0
          ? ((avgTokensPerLine - BENCHMARK_TOKENS_PER_LINE) / BENCHMARK_TOKENS_PER_LINE) * 100
          : 0;

      const vsBaseline =
        avgTokensPerLine > 0
          ? ((avgTokensPerLine - BASELINE_TOKENS_PER_LINE) / BASELINE_TOKENS_PER_LINE) * 100
          : 0;

      const threshold = evaluateThreshold(avgTokensPerLine);
      const trend = calculateTrend(agentRecords);

      summaries.push({
        agentName,
        period: options.since || 'all-time',
        totalArtifacts: agentRecords.length,
        totalTokens,
        totalLines,
        avgTokensPerLine: Math.round(avgTokensPerLine * 100) / 100,
        minTokensPerLine: Math.round(minTokensPerLine * 100) / 100,
        maxTokensPerLine: Math.round(maxTokensPerLine * 100) / 100,
        vsBenchmark: Math.round(vsBenchmark * 100) / 100,
        vsBaseline: Math.round(vsBaseline * 100) / 100,
        trend,
        thresholdStatus: threshold.level,
      });
    }

    return summaries;
  }

  /**
   * Load records from disk.
   */
  async load(): Promise<void> {
    try {
      const filePath = path.join(this.metricsDir, RECORDS_FILE);
      const content = await fs.readFile(filePath, 'utf-8');
      this.records = JSON.parse(content);
    } catch {
      this.records = [];
    }
  }

  /**
   * Persist records to disk.
   */
  private async persist(): Promise<void> {
    try {
      await fs.mkdir(this.metricsDir, { recursive: true });
      const filePath = path.join(this.metricsDir, RECORDS_FILE);
      await fs.writeFile(filePath, JSON.stringify(this.records, null, 2), 'utf-8');
    } catch {
      // Silently fail persistence — metrics are non-critical
    }
  }

  /**
   * Get all records (for testing).
   */
  getAllRecords(): ArtifactMetricRecord[] {
    return [...this.records];
  }
}

// ============================================================================
// Helpers
// ============================================================================

function parseSinceDate(since: string): Date | null {
  const durationMatch = since.match(/^(\d+)d$/);
  if (durationMatch) {
    const days = parseInt(durationMatch[1], 10);
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  const parsed = new Date(since);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function calculateTrend(
  records: ArtifactMetricRecord[]
): 'improving' | 'stable' | 'degrading' {
  if (records.length < 4) return 'stable';

  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const avgFirst =
    firstHalf.reduce((sum, r) => sum + r.tokens.tokensPerLine, 0) / firstHalf.length;
  const avgSecond =
    secondHalf.reduce((sum, r) => sum + r.tokens.tokensPerLine, 0) / secondHalf.length;

  const changePercent = ((avgSecond - avgFirst) / avgFirst) * 100;

  if (changePercent < -5) return 'improving';
  if (changePercent > 5) return 'degrading';
  return 'stable';
}
