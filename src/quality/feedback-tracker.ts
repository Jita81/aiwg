/**
 * Feedback Tracker — record before/after quality scores and accuracy
 *
 * Tracks quality score deltas from feedback iterations, calculates
 * accuracy (% positive deltas), and false positive rate.
 * Persists to `.aiwg/metrics/feedback/`.
 *
 * @module quality/feedback-tracker
 * @issue #148
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface FeedbackRecord {
  id: string;
  artifactPath: string;
  agent: string;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  improved: boolean;
  timestamp: string;
  category?: string;
}

export interface AccuracyMetrics {
  totalRecords: number;
  positiveDeltas: number;
  negativeDeltas: number;
  zeroDeltas: number;
  accuracy: number;
  falsePositiveRate: number;
  averageDelta: number;
  medianDelta: number;
}

// ============================================================================
// Constants
// ============================================================================

const FEEDBACK_DIR = '.aiwg/metrics/feedback';
const RECORDS_FILE = 'records.json';

// ============================================================================
// FeedbackTracker
// ============================================================================

export class FeedbackTracker {
  private feedbackDir: string;
  private records: FeedbackRecord[];
  private nextId: number;

  constructor(projectPath: string) {
    this.feedbackDir = path.join(projectPath, FEEDBACK_DIR);
    this.records = [];
    this.nextId = 1;
  }

  async recordFeedback(
    artifactPath: string,
    agent: string,
    scoreBefore: number,
    scoreAfter: number,
    category?: string
  ): Promise<FeedbackRecord> {
    const delta = scoreAfter - scoreBefore;

    const record: FeedbackRecord = {
      id: `fb-${String(this.nextId++).padStart(4, '0')}`,
      artifactPath,
      agent,
      scoreBefore,
      scoreAfter,
      delta,
      improved: delta > 0,
      timestamp: new Date().toISOString(),
      category,
    };

    this.records.push(record);
    await this.persist();

    return record;
  }

  calculateAccuracy(options?: { agent?: string; category?: string }): AccuracyMetrics {
    let filtered = [...this.records];

    if (options?.agent) {
      const agentLower = options.agent.toLowerCase();
      filtered = filtered.filter((r) => r.agent.toLowerCase() === agentLower);
    }

    if (options?.category) {
      filtered = filtered.filter((r) => r.category === options.category);
    }

    if (filtered.length === 0) {
      return {
        totalRecords: 0,
        positiveDeltas: 0,
        negativeDeltas: 0,
        zeroDeltas: 0,
        accuracy: 0,
        falsePositiveRate: 0,
        averageDelta: 0,
        medianDelta: 0,
      };
    }

    const positiveDeltas = filtered.filter((r) => r.delta > 0).length;
    const negativeDeltas = filtered.filter((r) => r.delta < 0).length;
    const zeroDeltas = filtered.filter((r) => r.delta === 0).length;

    const deltas = filtered.map((r) => r.delta);
    const averageDelta =
      deltas.reduce((sum, d) => sum + d, 0) / deltas.length;

    const sortedDeltas = [...deltas].sort((a, b) => a - b);
    const medianDelta =
      sortedDeltas.length % 2 === 0
        ? (sortedDeltas[sortedDeltas.length / 2 - 1] + sortedDeltas[sortedDeltas.length / 2]) / 2
        : sortedDeltas[Math.floor(sortedDeltas.length / 2)];

    return {
      totalRecords: filtered.length,
      positiveDeltas,
      negativeDeltas,
      zeroDeltas,
      accuracy: Math.round((positiveDeltas / filtered.length) * 10000) / 100,
      falsePositiveRate: Math.round((negativeDeltas / filtered.length) * 10000) / 100,
      averageDelta: Math.round(averageDelta * 100) / 100,
      medianDelta: Math.round(medianDelta * 100) / 100,
    };
  }

  getAgentAccuracy(): Map<string, AccuracyMetrics> {
    const agents = new Set(this.records.map((r) => r.agent));
    const result = new Map<string, AccuracyMetrics>();

    for (const agent of agents) {
      result.set(agent, this.calculateAccuracy({ agent }));
    }

    return result;
  }

  async load(): Promise<void> {
    try {
      const filePath = path.join(this.feedbackDir, RECORDS_FILE);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      this.records = data.records || [];
      this.nextId = data.nextId || this.records.length + 1;
    } catch {
      this.records = [];
      this.nextId = 1;
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(this.feedbackDir, { recursive: true });
      const filePath = path.join(this.feedbackDir, RECORDS_FILE);
      await fs.writeFile(
        filePath,
        JSON.stringify({ records: this.records, nextId: this.nextId }, null, 2),
        'utf-8'
      );
    } catch {
      // Non-critical
    }
  }

  getAllRecords(): FeedbackRecord[] {
    return [...this.records];
  }
}
