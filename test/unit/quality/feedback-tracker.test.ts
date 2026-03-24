/**
 * Unit tests for Feedback Tracker and A/B Testing
 *
 * @source @src/quality/feedback-tracker.ts
 * @source @src/quality/feedback-ab.ts
 * @issue #148
 */

import { describe, it, expect } from 'vitest';
import { FeedbackTracker } from '../../../src/quality/feedback-tracker.js';
import {
  runABTest,
  mean,
  stdDev,
  welchTTest,
  interpretEffectSize,
  type ABVariant,
} from '../../../src/quality/feedback-ab.js';

describe('FeedbackTracker', () => {
  const PROJECT_PATH = '/tmp/test-project';

  describe('recordFeedback', () => {
    it('should record a feedback event', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      const record = await tracker.recordFeedback(
        'test.md', 'test-agent', 60, 75
      );

      expect(record.id).toMatch(/^fb-\d{4}$/);
      expect(record.scoreBefore).toBe(60);
      expect(record.scoreAfter).toBe(75);
      expect(record.delta).toBe(15);
      expect(record.improved).toBe(true);
    });

    it('should detect negative deltas', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      const record = await tracker.recordFeedback(
        'test.md', 'test-agent', 80, 70
      );

      expect(record.delta).toBe(-10);
      expect(record.improved).toBe(false);
    });

    it('should assign sequential IDs', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      const r1 = await tracker.recordFeedback('a.md', 'agent', 50, 60);
      const r2 = await tracker.recordFeedback('b.md', 'agent', 50, 60);

      expect(r1.id).toBe('fb-0001');
      expect(r2.id).toBe('fb-0002');
    });

    it('should store category', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      const record = await tracker.recordFeedback(
        'test.md', 'agent', 50, 70, 'structure'
      );
      expect(record.category).toBe('structure');
    });
  });

  describe('calculateAccuracy', () => {
    it('should return zeros for empty records', () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      const metrics = tracker.calculateAccuracy();
      expect(metrics.totalRecords).toBe(0);
      expect(metrics.accuracy).toBe(0);
      expect(metrics.falsePositiveRate).toBe(0);
    });

    it('should calculate accuracy correctly', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      await tracker.recordFeedback('a.md', 'agent', 50, 70);
      await tracker.recordFeedback('b.md', 'agent', 50, 80);
      await tracker.recordFeedback('c.md', 'agent', 80, 70);

      const metrics = tracker.calculateAccuracy();
      expect(metrics.totalRecords).toBe(3);
      expect(metrics.positiveDeltas).toBe(2);
      expect(metrics.negativeDeltas).toBe(1);
      expect(metrics.accuracy).toBeCloseTo(66.67, 1);
      expect(metrics.falsePositiveRate).toBeCloseTo(33.33, 1);
    });

    it('should calculate average and median delta', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      await tracker.recordFeedback('a.md', 'agent', 50, 60);
      await tracker.recordFeedback('b.md', 'agent', 50, 70);
      await tracker.recordFeedback('c.md', 'agent', 50, 80);

      const metrics = tracker.calculateAccuracy();
      expect(metrics.averageDelta).toBe(20);
      expect(metrics.medianDelta).toBe(20);
    });

    it('should filter by agent', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      await tracker.recordFeedback('a.md', 'agent-a', 50, 70);
      await tracker.recordFeedback('b.md', 'agent-b', 50, 40);

      const metricsA = tracker.calculateAccuracy({ agent: 'agent-a' });
      expect(metricsA.totalRecords).toBe(1);
      expect(metricsA.accuracy).toBe(100);

      const metricsB = tracker.calculateAccuracy({ agent: 'agent-b' });
      expect(metricsB.totalRecords).toBe(1);
      expect(metricsB.accuracy).toBe(0);
    });

    it('should filter by category', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      await tracker.recordFeedback('a.md', 'agent', 50, 70, 'structure');
      await tracker.recordFeedback('b.md', 'agent', 50, 40, 'style');

      const metrics = tracker.calculateAccuracy({ category: 'structure' });
      expect(metrics.totalRecords).toBe(1);
      expect(metrics.accuracy).toBe(100);
    });
  });

  describe('getAgentAccuracy', () => {
    it('should return per-agent breakdowns', async () => {
      const tracker = new FeedbackTracker(PROJECT_PATH);
      await tracker.recordFeedback('a.md', 'agent-a', 50, 70);
      await tracker.recordFeedback('b.md', 'agent-b', 50, 40);
      await tracker.recordFeedback('c.md', 'agent-a', 60, 80);

      const byAgent = tracker.getAgentAccuracy();
      expect(byAgent.size).toBe(2);
      expect(byAgent.get('agent-a')!.totalRecords).toBe(2);
      expect(byAgent.get('agent-b')!.totalRecords).toBe(1);
    });
  });
});

describe('Feedback A/B Testing', () => {
  describe('mean', () => {
    it('should calculate arithmetic mean', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(mean([])).toBe(0);
    });
  });

  describe('stdDev', () => {
    it('should calculate sample standard deviation', () => {
      const result = stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result).toBeCloseTo(2.0, 0);
    });

    it('should return 0 for single element', () => {
      expect(stdDev([5])).toBe(0);
    });
  });

  describe('welchTTest', () => {
    it('should calculate t-statistic', () => {
      const result = welchTTest(10, 12, 2, 2, 30, 30);
      expect(result.tStatistic).toBeLessThan(0);
      expect(result.degreesOfFreedom).toBeGreaterThan(0);
    });

    it('should handle equal means', () => {
      const result = welchTTest(10, 10, 2, 2, 30, 30);
      expect(result.tStatistic).toBeCloseTo(0);
    });
  });

  describe('runABTest', () => {
    it('should detect significant difference', () => {
      const control: ABVariant = {
        name: 'control',
        deltas: [3, 4, 5, 6, 7, 4, 5, 6, 5, 5],
      };
      const treatment: ABVariant = {
        name: 'treatment',
        deltas: [13, 14, 15, 16, 17, 14, 15, 16, 15, 15],
      };

      const result = runABTest(control, treatment);
      expect(result.significant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.treatmentMean).toBeGreaterThan(result.controlMean);
    });

    it('should not detect significance for similar groups', () => {
      const control: ABVariant = {
        name: 'control',
        deltas: [5, 6, 5, 4, 5, 6, 5, 5, 4, 6],
      };
      const treatment: ABVariant = {
        name: 'treatment',
        deltas: [5, 5, 6, 5, 4, 5, 6, 5, 5, 5],
      };

      const result = runABTest(control, treatment);
      expect(result.significant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should throw for insufficient samples', () => {
      const control: ABVariant = {
        name: 'control',
        deltas: [1, 2, 3],
      };
      const treatment: ABVariant = {
        name: 'treatment',
        deltas: [4, 5, 6],
      };

      expect(() => runABTest(control, treatment)).toThrow('Insufficient samples');
    });

    it('should respect custom alpha', () => {
      const control: ABVariant = {
        name: 'control',
        deltas: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      };
      const treatment: ABVariant = {
        name: 'treatment',
        deltas: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
      };

      const result = runABTest(control, treatment, { alpha: 0.001 });
      expect(result.alpha).toBe(0.001);
    });

    it('should include effect size', () => {
      const control: ABVariant = {
        name: 'control',
        deltas: [4, 5, 5, 5, 5, 5, 5, 5, 5, 6],
      };
      const treatment: ABVariant = {
        name: 'treatment',
        deltas: [14, 15, 15, 15, 15, 15, 15, 15, 15, 16],
      };

      const result = runABTest(control, treatment);
      expect(result.effectSize).not.toBe(0);
      expect(result.effectInterpretation).toBeDefined();
    });
  });

  describe('interpretEffectSize', () => {
    it('should classify negligible effects', () => {
      expect(interpretEffectSize(0.1)).toBe('negligible');
    });

    it('should classify small effects', () => {
      expect(interpretEffectSize(0.3)).toBe('small');
    });

    it('should classify medium effects', () => {
      expect(interpretEffectSize(0.6)).toBe('medium');
    });

    it('should classify large effects', () => {
      expect(interpretEffectSize(1.0)).toBe('large');
    });
  });
});
