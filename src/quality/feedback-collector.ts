/**
 * Feedback Collector — structured feedback from validation/review cycles
 *
 * Collects feedback per agent, analyzes patterns, and proposes
 * constraint updates for self-improving agent prompts.
 *
 * @module quality/feedback-collector
 * @issue #146
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface FeedbackEntry {
  id: string;
  agent: string;
  feedbackType: 'error' | 'improvement' | 'pattern' | 'regression';
  description: string;
  context: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  source: 'validation' | 'review' | 'test' | 'user' | 'auto';
}

export interface FeedbackPattern {
  patternId: string;
  agent: string;
  description: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  severity: FeedbackEntry['severity'];
  suggestedConstraint: string;
  feedbackIds: string[];
}

export interface ConstraintProposal {
  agent: string;
  version: number;
  timestamp: string;
  additions: string[];
  modifications: Array<{ original: string; proposed: string; reason: string }>;
  patterns: FeedbackPattern[];
  status: 'proposed' | 'approved' | 'rejected' | 'applied';
}

// ============================================================================
// Constants
// ============================================================================

const FEEDBACK_DIR = '.aiwg/feedback';

// ============================================================================
// FeedbackCollector
// ============================================================================

export class FeedbackCollector {
  private projectPath: string;
  private entries: Map<string, FeedbackEntry[]>;
  private nextId: number;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.entries = new Map();
    this.nextId = 1;
  }

  async record(
    agent: string,
    feedbackType: FeedbackEntry['feedbackType'],
    description: string,
    context: string,
    severity: FeedbackEntry['severity'] = 'medium',
    source: FeedbackEntry['source'] = 'auto'
  ): Promise<FeedbackEntry> {
    const entry: FeedbackEntry = {
      id: `fbc-${String(this.nextId++).padStart(5, '0')}`,
      agent,
      feedbackType,
      description,
      context,
      severity,
      timestamp: new Date().toISOString(),
      source,
    };

    const agentEntries = this.entries.get(agent) || [];
    agentEntries.push(entry);
    this.entries.set(agent, agentEntries);

    await this.persistEntry(agent, entry);
    return entry;
  }

  getEntriesForAgent(agent: string): FeedbackEntry[] {
    return this.entries.get(agent) || [];
  }

  getAllEntries(): FeedbackEntry[] {
    const all: FeedbackEntry[] = [];
    for (const entries of this.entries.values()) {
      all.push(...entries);
    }
    return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Analyze feedback for an agent and identify recurring patterns.
   */
  analyzePatterns(agent: string): FeedbackPattern[] {
    const entries = this.getEntriesForAgent(agent);
    if (entries.length === 0) return [];

    // Group by description similarity (simple keyword clustering)
    const clusters = new Map<string, FeedbackEntry[]>();

    for (const entry of entries) {
      const key = extractPatternKey(entry.description);
      const cluster = clusters.get(key) || [];
      cluster.push(entry);
      clusters.set(key, cluster);
    }

    const patterns: FeedbackPattern[] = [];
    let patternNum = 1;

    for (const [key, cluster] of clusters) {
      if (cluster.length < 2) continue; // Only patterns with 2+ occurrences

      const sorted = cluster.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const maxSeverity = cluster.reduce((max, e) => {
        const order = { critical: 4, high: 3, medium: 2, low: 1 };
        return order[e.severity] > order[max] ? e.severity : max;
      }, 'low' as FeedbackEntry['severity']);

      patterns.push({
        patternId: `pat-${agent}-${String(patternNum++).padStart(3, '0')}`,
        agent,
        description: `Recurring: ${key} (${cluster.length} occurrences)`,
        occurrences: cluster.length,
        firstSeen: sorted[0].timestamp,
        lastSeen: sorted[sorted.length - 1].timestamp,
        severity: maxSeverity,
        suggestedConstraint: generateConstraintSuggestion(key, cluster),
        feedbackIds: cluster.map((e) => e.id),
      });
    }

    return patterns.sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * Generate a constraint update proposal for an agent.
   */
  proposeConstraintUpdate(agent: string): ConstraintProposal | null {
    const patterns = this.analyzePatterns(agent);
    if (patterns.length === 0) return null;

    const additions = patterns
      .filter((p) => p.occurrences >= 3 || p.severity === 'critical')
      .map((p) => p.suggestedConstraint);

    if (additions.length === 0) return null;

    return {
      agent,
      version: 1, // Would increment based on existing versions
      timestamp: new Date().toISOString(),
      additions,
      modifications: [],
      patterns,
      status: 'proposed',
    };
  }

  async load(): Promise<void> {
    try {
      const feedbackDir = path.join(this.projectPath, FEEDBACK_DIR);
      const agents = await fs.readdir(feedbackDir).catch(() => []);

      for (const agentDir of agents) {
        const agentPath = path.join(feedbackDir, agentDir);
        const stat = await fs.stat(agentPath);
        if (!stat.isDirectory() || agentDir === 'constraints') continue;

        const files = await fs.readdir(agentPath);
        const entries: FeedbackEntry[] = [];

        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const content = await fs.readFile(path.join(agentPath, file), 'utf-8');
          entries.push(JSON.parse(content));
        }

        if (entries.length > 0) {
          this.entries.set(agentDir, entries);
          this.nextId = Math.max(this.nextId, ...entries.map((e) => {
            const num = parseInt(e.id.replace('fbc-', ''), 10);
            return isNaN(num) ? 0 : num + 1;
          }));
        }
      }
    } catch {
      // Start fresh
    }
  }

  private async persistEntry(agent: string, entry: FeedbackEntry): Promise<void> {
    try {
      const agentDir = path.join(this.projectPath, FEEDBACK_DIR, agent);
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(
        path.join(agentDir, `${entry.id}.json`),
        JSON.stringify(entry, null, 2),
        'utf-8'
      );
    } catch {
      // Non-critical
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function extractPatternKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(' ');
}

function generateConstraintSuggestion(key: string, entries: FeedbackEntry[]): string {
  const types = [...new Set(entries.map((e) => e.feedbackType))];
  if (types.includes('error')) {
    return `MUST NOT: ${key} — detected ${entries.length} times, most recently ${entries[entries.length - 1].timestamp}`;
  }
  return `SHOULD: Address "${key}" pattern — ${entries.length} occurrences across feedback`;
}
