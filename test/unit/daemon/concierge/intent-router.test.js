import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConciergeIntentRouter,
  INTENT_PATTERNS,
  DEFAULT_HANDLERS,
} from '../../../../tools/daemon/concierge/intent-router.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRouter(overrides = {}) {
  return new ConciergeIntentRouter(overrides);
}

function makeSessionLog() {
  const entries = [];
  return {
    log: vi.fn((entry) => entries.push(entry)),
    entries,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConciergeIntentRouter', () => {
  describe('classify()', () => {
    it('classifies maintenance intent', () => {
      const router = makeRouter();

      const inputs = [
        'is aiwg up to date',
        'run a health check',
        'aiwg doctor',
        'aiwg update',
        'check for updates',
        'validate metadata',
      ];

      for (const msg of inputs) {
        const { category, confidence } = router.classify(msg);
        expect(category, `Expected maintenance for: "${msg}"`).toBe('maintenance');
        expect(confidence).toBe(1.0);
      }
    });

    it('classifies scheduling intent', () => {
      const router = makeRouter();

      const inputs = [
        'run the tests every morning',
        'set up a cron job',
        'schedule daily backups',
        'run linting every hour',
      ];

      for (const msg of inputs) {
        const { category, confidence } = router.classify(msg);
        expect(category, `Expected scheduling for: "${msg}"`).toBe('scheduling');
        expect(confidence).toBe(1.0);
      }
    });

    it('classifies agent-teams intent', () => {
      const router = makeRouter();

      const inputs = [
        'run a security review',
        'start a security team',
        'launch a test review',
        'multi-agent review',
        'compliance review',
      ];

      for (const msg of inputs) {
        const { category, confidence } = router.classify(msg);
        expect(category, `Expected agent-teams for: "${msg}"`).toBe('agent-teams');
        expect(confidence).toBe(1.0);
      }
    });

    it('classifies sdlc intent', () => {
      const router = makeRouter();

      const inputs = [
        'transition to elaboration',
        'move to construction phase',
        'start inception',
        'project status',
        'deploy to production',
        'address issues 17 18',
        'fix bug #42',
      ];

      for (const msg of inputs) {
        const { category, confidence } = router.classify(msg);
        expect(category, `Expected sdlc for: "${msg}"`).toBe('sdlc');
        expect(confidence).toBe(1.0);
      }
    });

    it('classifies query intent', () => {
      const router = makeRouter();

      const inputs = [
        'what commands are available',
        'how do I install this on copilot',
        'can I install this on copilot',
        'help',
        'what is the capability matrix',
        'how does the scheduler work',
      ];

      for (const msg of inputs) {
        const { category, confidence } = router.classify(msg);
        expect(category, `Expected query for: "${msg}"`).toBe('query');
        expect(confidence).toBe(1.0);
      }
    });

    it('classifies conversational intent as fallback', () => {
      const router = makeRouter();

      const inputs = [
        'thanks',
        'looks good to me',
        'sounds great',
        'ok',
        'got it',
      ];

      for (const msg of inputs) {
        const { category, confidence } = router.classify(msg);
        expect(category, `Expected conversational for: "${msg}"`).toBe('conversational');
        expect(confidence).toBe(0.5);
      }
    });

    it('returns conversational for empty or non-string input', () => {
      const router = makeRouter();

      expect(router.classify('').category).toBe('conversational');
      expect(router.classify(null).category).toBe('conversational');
      expect(router.classify(undefined).category).toBe('conversational');
    });
  });

  describe('route()', () => {
    it('returns ok result for a matched, available handler', () => {
      const router = makeRouter({ provider: 'claude-code' });
      const result = router.route('is aiwg up to date');

      expect(result.ok).toBe(true);
      expect(result.fallback).toBe(false);
      expect(result.category).toBe('maintenance');
      expect(result.handler).toBeDefined();
      expect(result.handler.id).toBe('aiwg-steward');
      expect(result.confidence).toBe(1.0);
    });

    it('returns fallback when confidence is below threshold', () => {
      const router = makeRouter({ confidenceThreshold: 0.9 });
      // "thanks" → conversational → confidence 0.5, which is below 0.9
      const result = router.route('thanks');

      expect(result.ok).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe('low-confidence');
      expect(result.suggestion).toBeDefined();
    });

    it('returns fallback when capability is unavailable', () => {
      // Mock a capability matrix where scheduling (cron) is unavailable on fake-provider
      const capabilityMatrix = {
        providers: {
          'fake-provider': {
            native_features: { cron: false },
            emulation: { cron: null },
          },
        },
      };

      const router = makeRouter({ capabilityMatrix, provider: 'fake-provider' });
      const result = router.route('run tests every morning', { provider: 'fake-provider' });

      expect(result.ok).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe('capability-unavailable');
      expect(result.suggestion).toContain('cron');
    });

    it('dispatches scheduling to native cron on claude-code', () => {
      const capabilityMatrix = {
        providers: {
          'claude-code': {
            native_features: { cron: true },
            emulation: { cron: 'native' },
          },
        },
      };

      const router = makeRouter({ capabilityMatrix, provider: 'claude-code' });
      const result = router.route('run lint every morning');

      expect(result.ok).toBe(true);
      expect(result.category).toBe('scheduling');
      expect(result.handler.id).toBe('schedule');
    });

    it('logs routing decisions to session log', () => {
      const sessionLog = makeSessionLog();
      const router = makeRouter({ sessionLog });

      router.route('is aiwg up to date');

      expect(sessionLog.log).toHaveBeenCalledOnce();
      const entry = sessionLog.entries[0];
      expect(entry.source).toBe('concierge:intent-router');
      expect(entry.timestamp).toBeDefined();
      expect(entry.category).toBe('maintenance');
    });

    it('redacts sensitive messages in session log', () => {
      const sessionLog = makeSessionLog();
      const router = makeRouter({ sessionLog });

      router.route('rotate the api token please');

      const entry = sessionLog.entries[0];
      expect(entry.message).toBe('[redacted]');
    });

    it('does not redact non-sensitive messages', () => {
      const sessionLog = makeSessionLog();
      const router = makeRouter({ sessionLog });

      const msg = 'is aiwg up to date';
      router.route(msg);

      const entry = sessionLog.entries[0];
      expect(entry.message).toBe(msg);
    });

    it('uses ctx.provider over instance provider', () => {
      const capabilityMatrix = {
        providers: {
          'other-provider': {
            native_features: { cron: false },
            emulation: { cron: null },
          },
          'claude-code': {
            native_features: { cron: true },
            emulation: { cron: 'native' },
          },
        },
      };

      const router = makeRouter({ capabilityMatrix, provider: 'claude-code' });
      // Override provider in ctx to one without cron support
      const result = router.route('run lint every hour', { provider: 'other-provider' });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('capability-unavailable');
    });

    it('skips capability check when no matrix is configured', () => {
      const router = makeRouter({ provider: 'claude-code' }); // no capabilityMatrix
      const result = router.route('run tests every morning');

      expect(result.ok).toBe(true);
      expect(result.category).toBe('scheduling');
    });

    it('handles logging errors gracefully', () => {
      const brokenLog = { log: vi.fn(() => { throw new Error('log failed'); }) };
      const router = makeRouter({ sessionLog: brokenLog });

      // Should not throw
      expect(() => router.route('is aiwg up to date')).not.toThrow();
    });
  });

  describe('fallback suggestions', () => {
    it('provides clarification suggestion for low-confidence', () => {
      const router = makeRouter({ confidenceThreshold: 0.99 });
      const result = router.route('ok thanks');

      expect(result.fallback).toBe(true);
      expect(result.suggestion).toMatch(/clarify|rephrase/i);
    });

    it('provides in-persona suggestion for capability-unavailable', () => {
      const capabilityMatrix = {
        providers: {
          'limited': {
            native_features: { cron: false },
            emulation: { cron: null },
          },
        },
      };
      const router = makeRouter({ capabilityMatrix, provider: 'limited' });
      const result = router.route('run daily backups');

      expect(result.suggestion).toContain('cron');
      expect(result.suggestion).toContain('limited');
    });
  });

  describe('introspection', () => {
    it('exposes pattern catalog without catch-all', () => {
      const router = makeRouter();
      const patterns = router.getPatterns();

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.category !== 'conversational')).toBe(true);
    });

    it('exposes handler catalog', () => {
      const router = makeRouter();
      const handlers = router.getHandlers();

      expect(handlers.maintenance).toBeDefined();
      expect(handlers.scheduling).toBeDefined();
      expect(handlers['agent-teams']).toBeDefined();
      expect(handlers.sdlc).toBeDefined();
      expect(handlers.query).toBeDefined();
      expect(handlers.conversational).toBeDefined();
    });
  });

  describe('pattern constants', () => {
    it('exports INTENT_PATTERNS with all expected categories', () => {
      const categories = INTENT_PATTERNS.map((p) => p.category);
      expect(categories).toContain('maintenance');
      expect(categories).toContain('scheduling');
      expect(categories).toContain('agent-teams');
      expect(categories).toContain('sdlc');
      expect(categories).toContain('query');
      expect(categories).toContain('conversational');
    });

    it('exports DEFAULT_HANDLERS with type descriptors', () => {
      for (const [, handler] of Object.entries(DEFAULT_HANDLERS)) {
        expect(handler.id).toBeDefined();
        expect(handler.type).toBeDefined();
        expect(handler.description).toBeDefined();
      }
    });
  });
});
