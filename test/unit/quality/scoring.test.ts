/**
 * Unit tests for Pattern-based Quality Scoring
 *
 * @source @src/quality/scoring.ts
 * @issue #192
 */

import { describe, it, expect } from 'vitest';
import {
  scoreContent,
  matchPattern,
  getGrade,
  detectArtifactType,
  getAvailablePatternTypes,
  REQUIRED_WEIGHT,
  RECOMMENDED_WEIGHT,
  THRESHOLDS,
  type PatternDefinition,
  type PatternRule,
} from '../../../src/quality/scoring.js';

const minimalPatterns: PatternDefinition = {
  id: 'test-pattern',
  name: 'Test Pattern',
  description: 'Minimal pattern for testing',
  required: [
    { id: 'r1', pattern: '(?i)title\\s*:', description: 'Title field' },
    { id: 'r2', pattern: '(?i)description\\s*:', description: 'Description field' },
  ],
  recommended: [
    { id: 'rec1', pattern: '(?i)notes?\\s*:', description: 'Notes section' },
  ],
  antipatterns: [
    { id: 'ap1', pattern: '(?i)\\bTODO\\b', weight: 0.1, description: 'Unresolved TODO' },
  ],
};

const perfectContent = `
# Example

Title: My Artifact
Description: A well-formed artifact
Notes: Additional context here
`;

const partialContent = `
# Example

Title: My Artifact
`;

const badContent = `
TODO: fill this in later
Some random text without any structure
`;

describe('Pattern-based Quality Scoring', () => {
  describe('scoreContent', () => {
    it('should score perfect content highly', () => {
      const result = scoreContent(perfectContent, minimalPatterns);
      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.grade).toBe('excellent');
    });

    it('should score partial content lower', () => {
      const result = scoreContent(partialContent, minimalPatterns);
      expect(result.score).toBeLessThan(90);
      expect(result.breakdown.required).toBe(50);
    });

    it('should apply antipattern penalty', () => {
      const result = scoreContent(badContent, minimalPatterns);
      expect(result.breakdown.antipatternPenalty).toBeGreaterThan(0);
    });

    it('should never go below 0', () => {
      const heavyAntipatterns: PatternDefinition = {
        ...minimalPatterns,
        antipatterns: [
          { id: 'ap1', pattern: '.', weight: 2.0, description: 'Matches everything' },
        ],
      };
      const result = scoreContent('anything', heavyAntipatterns);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should never exceed 100', () => {
      const result = scoreContent(perfectContent, minimalPatterns);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should use correct weights', () => {
      expect(REQUIRED_WEIGHT).toBe(0.60);
      expect(RECOMMENDED_WEIGHT).toBe(0.40);
    });

    it('should include match details', () => {
      const result = scoreContent(perfectContent, minimalPatterns);
      expect(result.matches.required).toHaveLength(2);
      expect(result.matches.recommended).toHaveLength(1);
      expect(result.matches.antipatterns).toHaveLength(1);
    });

    it('should set patternId from definition', () => {
      const result = scoreContent(perfectContent, minimalPatterns);
      expect(result.patternId).toBe('test-pattern');
    });

    it('should handle empty required/recommended arrays', () => {
      const emptyPatterns: PatternDefinition = {
        id: 'empty',
        name: 'Empty',
        description: 'No patterns',
        required: [],
        recommended: [],
        antipatterns: [],
      };
      const result = scoreContent('anything', emptyPatterns);
      expect(result.score).toBe(100);
    });
  });

  describe('matchPattern', () => {
    it('should find matching patterns', () => {
      const rule: PatternRule = {
        id: 'test',
        pattern: '(?i)hello',
        description: 'Greeting',
      };
      const result = matchPattern('Hello World', rule);
      expect(result.found).toBe(true);
      expect(result.matchCount).toBe(1);
    });

    it('should count multiple matches', () => {
      const rule: PatternRule = {
        id: 'test',
        pattern: '\\bline\\b',
        description: 'Line word',
      };
      const result = matchPattern('line one\nline two\nline three', rule);
      expect(result.matchCount).toBe(3);
    });

    it('should handle non-matching patterns', () => {
      const rule: PatternRule = {
        id: 'test',
        pattern: 'nonexistent',
        description: 'Missing',
      };
      const result = matchPattern('hello world', rule);
      expect(result.found).toBe(false);
      expect(result.matchCount).toBe(0);
    });

    it('should handle invalid regex gracefully', () => {
      const rule: PatternRule = {
        id: 'test',
        pattern: '[invalid',
        description: 'Bad regex',
      };
      const result = matchPattern('test', rule);
      expect(result.found).toBe(false);
    });
  });

  describe('getGrade', () => {
    it('should return excellent for 90+', () => {
      expect(getGrade(90)).toBe('excellent');
      expect(getGrade(100)).toBe('excellent');
    });

    it('should return good for 75-89', () => {
      expect(getGrade(75)).toBe('good');
      expect(getGrade(89)).toBe('good');
    });

    it('should return acceptable for 60-74', () => {
      expect(getGrade(60)).toBe('acceptable');
      expect(getGrade(74)).toBe('acceptable');
    });

    it('should return needs-work for below 60', () => {
      expect(getGrade(59)).toBe('needs-work');
      expect(getGrade(0)).toBe('needs-work');
    });
  });

  describe('detectArtifactType', () => {
    it('should detect use case from heading', () => {
      expect(detectArtifactType('# UC-001 Login', 'artifact.md')).toBe('use-case');
    });

    it('should detect use case from filename', () => {
      expect(detectArtifactType('some content', 'uc-001-login.md')).toBe('use-case');
    });

    it('should detect ADR from heading', () => {
      expect(detectArtifactType('# ADR-005 Database Choice', 'doc.md')).toBe('adr');
    });

    it('should detect ADR from filename', () => {
      expect(detectArtifactType('content', 'adr-005.md')).toBe('adr');
    });

    it('should detect test plan', () => {
      expect(detectArtifactType('# Test Plan for Feature X', 'plan.md')).toBe('test-plan');
    });

    it('should detect SAD', () => {
      expect(
        detectArtifactType('# Software Architecture Document', 'doc.md')
      ).toBe('sad');
    });

    it('should return null for unrecognized content', () => {
      expect(detectArtifactType('random notes', 'notes.md')).toBeNull();
    });
  });

  describe('getAvailablePatternTypes', () => {
    it('should list all built-in types', () => {
      const types = getAvailablePatternTypes();
      expect(types).toContain('use-case');
      expect(types).toContain('adr');
      expect(types).toContain('test-plan');
      expect(types).toContain('sad');
      expect(types).toHaveLength(4);
    });
  });

  describe('threshold constants', () => {
    it('should have correct values', () => {
      expect(THRESHOLDS.excellent).toBe(90);
      expect(THRESHOLDS.good).toBe(75);
      expect(THRESHOLDS.acceptable).toBe(60);
    });
  });
});
