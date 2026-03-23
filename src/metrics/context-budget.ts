/**
 * Context Budget — configurable context/generation token split
 *
 * Manages token budgets for context windows with a default 70/30 split
 * (70% context, 30% generation). Supports priority scoring based on
 * recency, similarity, and @-mention presence.
 *
 * @module metrics/context-budget
 * @issue #144
 */

import { promises as fs } from 'fs';
import path from 'path';
import { estimateTokens } from './token-counter.js';

// ============================================================================
// Types
// ============================================================================

export interface BudgetConfig {
  /** Total context window size in tokens */
  totalTokens: number;
  /** Fraction allocated to context (0-1), default 0.70 */
  contextFraction: number;
  /** Fraction allocated to generation (0-1), default 0.30 */
  generationFraction: number;
  /** Warning threshold as fraction of context budget (0-1), default 0.85 */
  warningThreshold: number;
  /** Hard limit as fraction of context budget (0-1), default 0.95 */
  hardLimitThreshold: number;
}

export interface ContextItem {
  /** Unique identifier */
  id: string;
  /** The content text */
  content: string;
  /** Estimated token count */
  tokens: number;
  /** Priority score (higher = more important, 0-1) */
  priority: number;
  /** Source metadata */
  source: {
    /** How the item was included */
    type: 'at-mention' | 'auto' | 'system' | 'user';
    /** ISO timestamp of when the item was added */
    addedAt: string;
    /** Similarity score to current task (0-1) */
    similarity?: number;
  };
}

export interface BudgetStatus {
  /** Total budget for context in tokens */
  contextBudget: number;
  /** Total budget for generation in tokens */
  generationBudget: number;
  /** Tokens currently used by context items */
  contextUsed: number;
  /** Remaining context tokens */
  contextRemaining: number;
  /** Usage fraction (0-1) */
  usageFraction: number;
  /** Current status level */
  level: 'ok' | 'warning' | 'critical' | 'exceeded';
  /** Number of context items */
  itemCount: number;
}

export interface DegradationResult {
  /** Items that were kept */
  kept: ContextItem[];
  /** Items that were dropped */
  dropped: ContextItem[];
  /** Tokens freed by degradation */
  tokensFreed: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: BudgetConfig = {
  totalTokens: 200000,
  contextFraction: 0.70,
  generationFraction: 0.30,
  warningThreshold: 0.85,
  hardLimitThreshold: 0.95,
};

const CONFIG_PATH = '.aiwg/config/context-budget.json';

// ============================================================================
// ContextBudgetManager
// ============================================================================

export class ContextBudgetManager {
  private config: BudgetConfig;
  private items: ContextItem[];
  private projectPath: string;

  constructor(projectPath: string, config?: Partial<BudgetConfig>) {
    this.projectPath = projectPath;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.items = [];

    // Validate fractions sum to 1
    const total = this.config.contextFraction + this.config.generationFraction;
    if (Math.abs(total - 1.0) > 0.001) {
      throw new Error(
        `Context and generation fractions must sum to 1.0, got ${total}`
      );
    }
  }

  get contextBudget(): number {
    return Math.floor(this.config.totalTokens * this.config.contextFraction);
  }

  get generationBudget(): number {
    return Math.floor(this.config.totalTokens * this.config.generationFraction);
  }

  addItem(
    id: string,
    content: string,
    sourceType: ContextItem['source']['type'],
    similarity?: number
  ): ContextItem {
    const tokens = estimateTokens(content);
    const priority = calculatePriority(sourceType, similarity);

    const item: ContextItem = {
      id,
      content,
      tokens,
      priority,
      source: {
        type: sourceType,
        addedAt: new Date().toISOString(),
        similarity,
      },
    };

    this.items.push(item);
    return item;
  }

  removeItem(id: string): boolean {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    return true;
  }

  getStatus(): BudgetStatus {
    const contextUsed = this.items.reduce((sum, item) => sum + item.tokens, 0);
    const contextBudget = this.contextBudget;
    const usageFraction = contextBudget > 0 ? contextUsed / contextBudget : 0;

    let level: BudgetStatus['level'];
    if (usageFraction > 1.0) {
      level = 'exceeded';
    } else if (usageFraction >= this.config.hardLimitThreshold) {
      level = 'critical';
    } else if (usageFraction >= this.config.warningThreshold) {
      level = 'warning';
    } else {
      level = 'ok';
    }

    return {
      contextBudget,
      generationBudget: this.generationBudget,
      contextUsed,
      contextRemaining: Math.max(0, contextBudget - contextUsed),
      usageFraction: Math.round(usageFraction * 10000) / 10000,
      level,
      itemCount: this.items.length,
    };
  }

  wouldExceed(content: string): boolean {
    const tokens = estimateTokens(content);
    const status = this.getStatus();
    return (status.contextUsed + tokens) > this.contextBudget;
  }

  degrade(): DegradationResult {
    const targetTokens = Math.floor(
      this.contextBudget * this.config.warningThreshold
    );

    const sorted = [...this.items].sort((a, b) => a.priority - b.priority);

    let currentTokens = this.items.reduce((sum, item) => sum + item.tokens, 0);
    const dropped: ContextItem[] = [];
    const droppedIds = new Set<string>();

    for (const item of sorted) {
      if (currentTokens <= targetTokens) break;
      if (item.source.type === 'system') continue;

      dropped.push(item);
      droppedIds.add(item.id);
      currentTokens -= item.tokens;
    }

    this.items = this.items.filter((item) => !droppedIds.has(item.id));

    const tokensFreed = dropped.reduce((sum, item) => sum + item.tokens, 0);

    return {
      kept: [...this.items],
      dropped,
      tokensFreed,
    };
  }

  getItems(): ContextItem[] {
    return [...this.items].sort((a, b) => b.priority - a.priority);
  }

  async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.projectPath, CONFIG_PATH);
      const content = await fs.readFile(configPath, 'utf-8');
      const loaded = JSON.parse(content);
      this.config = { ...DEFAULT_CONFIG, ...loaded };
    } catch {
      // Use defaults
    }
  }

  async saveConfig(): Promise<void> {
    const configPath = path.join(this.projectPath, CONFIG_PATH);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );
  }

  getConfig(): BudgetConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Priority Scoring
// ============================================================================

export function calculatePriority(
  sourceType: ContextItem['source']['type'],
  similarity?: number
): number {
  let base: number;
  switch (sourceType) {
    case 'system':
      base = 1.0;
      break;
    case 'at-mention':
      base = 0.9;
      break;
    case 'user':
      base = 0.7;
      break;
    case 'auto':
      base = 0.5;
      break;
    default:
      base = 0.3;
  }

  const similarityBonus = similarity ? similarity * 0.1 : 0;

  return Math.min(1.0, base + similarityBonus);
}
