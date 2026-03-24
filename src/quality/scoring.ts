/**
 * Pattern-based Quality Scoring Engine
 *
 * Scores SDLC artifacts against pattern definitions (required/recommended/antipattern).
 * Scoring: required (60%) + recommended (40%) - antipattern penalty.
 * Thresholds: excellent (90+), good (75+), acceptable (60+), needs-work (<60).
 *
 * @module quality/scoring
 * @issue #192
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Types
// ============================================================================

export interface PatternRule {
  id: string;
  pattern: string;
  description: string;
  weight?: number;
}

export interface PatternDefinition {
  id: string;
  name: string;
  description: string;
  required: PatternRule[];
  recommended: PatternRule[];
  antipatterns: PatternRule[];
}

export interface PatternMatch {
  rule: PatternRule;
  found: boolean;
  matchCount: number;
}

export interface ScoringResult {
  score: number;
  grade: 'excellent' | 'good' | 'acceptable' | 'needs-work';
  breakdown: {
    required: number;
    recommended: number;
    antipatternPenalty: number;
  };
  matches: {
    required: PatternMatch[];
    recommended: PatternMatch[];
    antipatterns: PatternMatch[];
  };
  patternId: string;
  artifactPath: string;
}

// ============================================================================
// Constants
// ============================================================================

export const REQUIRED_WEIGHT = 0.60;
export const RECOMMENDED_WEIGHT = 0.40;

export const THRESHOLDS = {
  excellent: 90,
  good: 75,
  acceptable: 60,
} as const;

// ============================================================================
// Scoring Engine
// ============================================================================

export function scoreContent(
  content: string,
  patterns: PatternDefinition,
  artifactPath: string = ''
): ScoringResult {
  const requiredMatches = patterns.required.map((rule) => matchPattern(content, rule));
  const requiredFound = requiredMatches.filter((m) => m.found).length;
  const requiredScore =
    patterns.required.length > 0
      ? (requiredFound / patterns.required.length) * 100
      : 100;

  const recommendedMatches = patterns.recommended.map((rule) => matchPattern(content, rule));
  const recommendedFound = recommendedMatches.filter((m) => m.found).length;
  const recommendedScore =
    patterns.recommended.length > 0
      ? (recommendedFound / patterns.recommended.length) * 100
      : 100;

  const antipatternMatches = patterns.antipatterns.map((rule) => matchPattern(content, rule));
  const antipatternPenalty = antipatternMatches.reduce((penalty, match) => {
    if (match.found) {
      const weight = match.rule.weight || 0.05;
      return penalty + weight * 100;
    }
    return penalty;
  }, 0);

  const rawScore =
    requiredScore * REQUIRED_WEIGHT +
    recommendedScore * RECOMMENDED_WEIGHT -
    antipatternPenalty;

  const score = Math.max(0, Math.min(100, Math.round(rawScore * 100) / 100));
  const grade = getGrade(score);

  return {
    score,
    grade,
    breakdown: {
      required: Math.round(requiredScore * 100) / 100,
      recommended: Math.round(recommendedScore * 100) / 100,
      antipatternPenalty: Math.round(antipatternPenalty * 100) / 100,
    },
    matches: {
      required: requiredMatches,
      recommended: recommendedMatches,
      antipatterns: antipatternMatches,
    },
    patternId: patterns.id,
    artifactPath,
  };
}

export function matchPattern(content: string, rule: PatternRule): PatternMatch {
  try {
    let pattern = rule.pattern;
    let flags = 'gm';
    // Handle PCRE inline flag (?i) — strip it and add 'i' to RegExp flags
    if (pattern.startsWith('(?i)')) {
      pattern = pattern.slice(4);
      flags = 'gmi';
    }
    const regex = new RegExp(pattern, flags);
    const matches = content.match(regex);
    return {
      rule,
      found: matches !== null && matches.length > 0,
      matchCount: matches ? matches.length : 0,
    };
  } catch {
    return {
      rule,
      found: false,
      matchCount: 0,
    };
  }
}

export function getGrade(score: number): ScoringResult['grade'] {
  if (score >= THRESHOLDS.excellent) return 'excellent';
  if (score >= THRESHOLDS.good) return 'good';
  if (score >= THRESHOLDS.acceptable) return 'acceptable';
  return 'needs-work';
}

// ============================================================================
// Pattern Loading
// ============================================================================

export async function loadBuiltinPattern(
  artifactType: string
): Promise<PatternDefinition | null> {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const patternPath = path.join(currentDir, 'patterns', `${artifactType}.json`);
    const content = await fs.readFile(patternPath, 'utf-8');
    return JSON.parse(content) as PatternDefinition;
  } catch {
    return null;
  }
}

export async function loadPatternFromFile(
  filePath: string
): Promise<PatternDefinition | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PatternDefinition;
  } catch {
    return null;
  }
}

export function getAvailablePatternTypes(): string[] {
  return ['use-case', 'adr', 'test-plan', 'sad'];
}

export function detectArtifactType(
  content: string,
  filePath: string
): string | null {
  const lower = content.toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  if (basename.startsWith('uc-') || /^#\s+UC-\d+/m.test(content)) {
    return 'use-case';
  }
  if (basename.startsWith('adr-') || /^#\s+ADR-\d+/m.test(content)) {
    return 'adr';
  }
  if (lower.includes('test plan') || lower.includes('test strategy')) {
    return 'test-plan';
  }
  if (
    lower.includes('software architecture') ||
    lower.includes('system architecture') ||
    basename.includes('sad')
  ) {
    return 'sad';
  }

  return null;
}

export async function scoreArtifact(
  filePath: string,
  patternType?: string
): Promise<ScoringResult | null> {
  const content = await fs.readFile(filePath, 'utf-8');
  const type = patternType || detectArtifactType(content, filePath);

  if (!type) return null;

  const patterns = await loadBuiltinPattern(type);
  if (!patterns) return null;

  return scoreContent(content, patterns, filePath);
}
