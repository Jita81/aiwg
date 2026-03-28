import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConciergeResponseTranslator,
  classifyOutput,
  SENSITIVE_PATTERNS,
  NOISE_PATTERNS,
} from '../../../../tools/daemon/concierge/response-translator.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTranslator(overrides = {}) {
  return new ConciergeResponseTranslator(overrides);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConciergeResponseTranslator', () => {

  describe('classifyOutput()', () => {
    it('classifies doctor output', () => {
      const raw = 'OK: providers installed\nWARNING: outdated version\nOK: hooks active';
      expect(classifyOutput(raw)).toBe('doctor-output');
    });

    it('classifies stack traces', () => {
      const raw = 'Error: Cannot read property\n  at Object.<anonymous> (/src/index.js:10:5)';
      expect(classifyOutput(raw)).toBe('stack-trace');
    });

    it('classifies sync log', () => {
      const raw = 'Updated to v2026.3.1\nRedeployed 9 providers';
      expect(classifyOutput(raw)).toBe('sync-log');
    });

    it('classifies test results with pass pattern', () => {
      const raw = '247 tests passed, 0 failed';
      expect(classifyOutput(raw)).toBe('test-results');
    });

    it('classifies test results with fail pattern', () => {
      const raw = '3 tests failed ● auth.test.ts';
      expect(classifyOutput(raw)).toBe('test-results');
    });

    it('classifies empty output', () => {
      expect(classifyOutput('')).toBe('empty');
      expect(classifyOutput('   ')).toBe('empty');
      expect(classifyOutput(null)).toBe('empty');
      expect(classifyOutput(undefined)).toBe('empty');
    });

    it('respects explicit sourceType hint', () => {
      expect(classifyOutput('some random text', 'sync-log')).toBe('sync-log');
      expect(classifyOutput('error: something', 'agent-result')).toBe('agent-result');
    });

    it('falls back to agent-result for unrecognised output', () => {
      expect(classifyOutput('The feature is now implemented')).toBe('agent-result');
    });
  });

  describe('translate() — raw/verbose bypass', () => {
    it('returns raw output unchanged when raw=true', () => {
      const translator = makeTranslator();
      const raw = 'Error: TypeError\n  at src/index.js:5\nDEBUG: trace data';

      const result = translator.translate(raw, { raw: true });

      expect(result.translated).toBe(raw);
      expect(result.bypassed).toBe(true);
      expect(result.discreetApplied).toBe(false);
    });

    it('returns raw output unchanged when verbose=true', () => {
      const translator = makeTranslator();
      const raw = 'very verbose output with paths /home/user/project/file.ts';

      const result = translator.translate(raw, { verbose: true });

      expect(result.translated).toBe(raw);
      expect(result.bypassed).toBe(true);
    });

    it('includes outputType when not bypassed', () => {
      const translator = makeTranslator();
      const result = translator.translate('247 tests passed');
      expect(result.outputType).toBeDefined();
      expect(result.bypassed).toBe(false);
    });
  });

  describe('translate() — doctor output', () => {
    it('summarises all-healthy doctor output', () => {
      const translator = makeTranslator();
      const raw = 'OK: providers installed\nOK: hooks active\nOK: version current';

      const { translated } = translator.translate(raw, { sourceType: 'doctor-output' });

      expect(translated).toBe('All systems healthy.');
    });

    it('summarises doctor output with issues', () => {
      const translator = makeTranslator();
      const raw = 'OK: hooks active\nERROR: outdated version\nWARNING: missing provider';

      const { translated } = translator.translate(raw, { sourceType: 'doctor-output' });

      expect(translated).toMatch(/2\s+issues?\s+found/i);
    });
  });

  describe('translate() — stack traces', () => {
    it('converts stack trace to actionable summary', () => {
      const translator = makeTranslator();
      const raw = [
        'TypeError: Cannot read properties of undefined (reading \'id\')',
        '  at validateToken (/src/auth/token.ts:42:10)',
        '  at Object.<anonymous> (/src/index.ts:15:3)',
      ].join('\n');

      const { translated } = translator.translate(raw, { sourceType: 'stack-trace' });

      expect(translated).not.toContain('at validateToken');
      expect(translated).not.toContain('/src/auth/token.ts');
      expect(translated).toMatch(/encountered|problem|error/i);
      expect(translated).toContain('logged');
    });

    it('includes context in error summary', () => {
      const translator = makeTranslator();
      const raw = 'Error: connection refused\n  at connect (/lib/db.js:10:5)';

      const { translated } = translator.translate(raw, {
        sourceType: 'stack-trace',
        context: 'database migration',
      });

      expect(translated).toContain('database migration');
    });
  });

  describe('translate() — sync log', () => {
    it('condenses verbose sync log to one line', () => {
      const translator = makeTranslator();
      const raw = [
        'Fetching latest from npm...',
        'Updated to v2026.3.1',
        'Redeploying to claude-code... done',
        'Redeploying to copilot... done',
        'Redeploying to warp... done',
        'Sync complete',
      ].join('\n');

      const { translated } = translator.translate(raw, { sourceType: 'sync-log' });

      expect(translated).toContain('2026.3.1');
      expect(translated.split('\n').length).toBeLessThanOrEqual(3);
    });

    it('returns "Sync complete." when no version found', () => {
      const translator = makeTranslator();
      const { translated } = translator.translate('sync finished ok', { sourceType: 'sync-log' });
      expect(translated).toBe('Sync complete.');
    });
  });

  describe('translate() — test results', () => {
    it('reports all tests passing', () => {
      const translator = makeTranslator();
      const { translated } = translator.translate('247 tests passed, 0 failed');

      expect(translated).toMatch(/247\s+tests?\s+passed/i);
    });

    it('reports failing tests', () => {
      const translator = makeTranslator();
      const { translated } = translator.translate('3 tests failed, 244 passed');

      expect(translated).toMatch(/3\s+tests?\s+failed/i);
      expect(translated).toMatch(/244\s+passed/i);
    });
  });

  describe('translate() — empty output', () => {
    it('returns in-persona acknowledgment for empty output', () => {
      const translator = makeTranslator();
      const { translated } = translator.translate('', { sourceType: 'empty' });

      expect(translated).toMatch(/completed|no output/i);
    });

    it('includes context label if provided', () => {
      const translator = makeTranslator();
      const { translated } = translator.translate('', { sourceType: 'empty', context: 'Linting' });

      expect(translated).toContain('Linting');
    });
  });

  describe('translate() — discreet mode', () => {
    it('redacts sensitive content when isSensitive=true', () => {
      const translator = makeTranslator();
      const raw = 'token=ghp_ABC123XYZ789abc012def345ghi678jkl901mno234';

      const { translated, discreetApplied } = translator.translate(raw, { isSensitive: true });

      expect(discreetApplied).toBe(true);
      expect(translated).not.toContain('ghp_');
      expect(translated).toContain('[sensitive content redacted]');
    });

    it('applies discreet mode for sensitive operation categories', () => {
      const translator = makeTranslator();
      const raw = 'Rotated api_key=sk-abc123def456ghi789';

      const { translated, discreetApplied } = translator.translate(raw, {
        sourceType: 'token-rotation',
      });

      expect(discreetApplied).toBe(true);
      expect(translated).not.toContain('sk-');
    });

    it('redacts absolute paths in discreet mode', () => {
      const translator = makeTranslator();
      const raw = 'Config loaded from /home/user/.config/aiwg/settings.json';

      const { translated } = translator.translate(raw, { discreet: true });

      expect(translated).not.toContain('/home/user/.config');
      expect(translated).toContain('[path]');
    });

    it('does not redact paths when discreet mode is off', () => {
      const translator = makeTranslator();
      const raw = 'Config at /home/user/.config/aiwg/settings.json loaded';

      const { translated } = translator.translate(raw);
      // Paths are only redacted in discreet mode; non-discreet passes through
      expect(translated).toContain('/home/user/.config');
    });
  });

  describe('translate() — technical noise reduction', () => {
    it('removes JS stack frames', () => {
      const translator = makeTranslator();
      const raw = [
        'Operation result: success',
        '  at Object.<anonymous> (/src/index.js:10:5)',
        '  at Module._compile (internal/modules/cjs/loader.js:999:30)',
      ].join('\n');

      const { translated } = translator.translate(raw, { sourceType: 'agent-result' });

      expect(translated).not.toContain('at Object.<anonymous>');
      expect(translated).toContain('Operation result: success');
    });

    it('removes DEBUG log lines', () => {
      const translator = makeTranslator();
      const raw = 'Feature complete\nDEBUG: internal state = {...}\nAll tests pass';

      const { translated } = translator.translate(raw, { sourceType: 'agent-result' });

      expect(translated).not.toContain('DEBUG:');
      expect(translated).toContain('Feature complete');
    });

    it('disables noise suppression when suppressNoise=false', () => {
      const translator = makeTranslator({ suppressNoise: false });
      const frame = '  at Object.<anonymous> (/src/index.js:10:5)';
      const raw = `result: ok\n${frame}`;

      const { translated } = translator.translate(raw, { sourceType: 'agent-result' });
      expect(translated).toContain(frame.trim());
    });
  });

  describe('translate() — fidelity', () => {
    it('preserves actionable content in stack traces', () => {
      const translator = makeTranslator();
      const raw = 'TypeError: Cannot read properties of undefined\n  at foo.js:5';

      const { translated } = translator.translate(raw, { sourceType: 'stack-trace' });

      // The error type/description must be preserved (not silently dropped)
      expect(translated).toMatch(/cannot\s+read|undefined/i);
    });

    it('preserves issue counts in doctor output', () => {
      const translator = makeTranslator();
      const raw = 'ERROR: provider X missing\nERROR: provider Y missing\nOK: hooks active';

      const { translated } = translator.translate(raw, { sourceType: 'doctor-output' });

      expect(translated).toMatch(/2\s+issues?/i);
    });

    it('preserves failure count in test results', () => {
      const translator = makeTranslator();
      const { translated } = translator.translate('5 tests failed, 100 passed');
      expect(translated).toContain('5');
    });
  });

  describe('translate() — filler stripping', () => {
    it('removes "I have successfully" filler', () => {
      const translator = makeTranslator();
      const raw = 'I have successfully completed the migration. The database is ready.';

      const { translated } = translator.translate(raw, { sourceType: 'agent-result' });

      expect(translated).not.toContain('I have successfully');
      expect(translated).toContain('The database is ready');
    });

    it('removes "As you requested" filler', () => {
      const translator = makeTranslator();
      const raw = 'As you requested, the file has been updated.';

      const { translated } = translator.translate(raw, { sourceType: 'agent-result' });

      expect(translated).not.toContain('As you requested');
    });

    it('removes "Certainly!" filler', () => {
      const translator = makeTranslator();
      const raw = 'Certainly! Here are the results.';

      const { translated } = translator.translate(raw, { sourceType: 'agent-result' });

      expect(translated).not.toMatch(/^certainly/i);
    });

    it('disables filler stripping when stripFiller=false', () => {
      const translator = makeTranslator({ stripFiller: false });
      const raw = 'Certainly! Here are the results.';

      const { translated } = translator.translate(raw, { sourceType: 'agent-result' });
      expect(translated).toMatch(/certainly/i);
    });
  });

  describe('isSensitiveContent()', () => {
    it('detects JWT-shaped tokens', () => {
      const translator = makeTranslator();
      expect(translator.isSensitiveContent('token: eyJhbGciOiJIUzI1NiJ9.payload.sig')).toBe(true);
    });

    it('detects GitHub PATs', () => {
      const translator = makeTranslator();
      expect(translator.isSensitiveContent('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890')).toBe(true);
    });

    it('detects api_key patterns', () => {
      const translator = makeTranslator();
      expect(translator.isSensitiveContent('api_key=sk-abc123def456ghi789jkl012mno345pqr678s')).toBe(true);
    });

    it('returns false for benign content', () => {
      const translator = makeTranslator();
      expect(translator.isSensitiveContent('the test passed')).toBe(false);
      expect(translator.isSensitiveContent('')).toBe(false);
      expect(translator.isSensitiveContent(null)).toBe(false);
    });
  });

  describe('isSensitiveCategory()', () => {
    it('flags known sensitive categories', () => {
      const translator = makeTranslator();
      expect(translator.isSensitiveCategory('token-rotation')).toBe(true);
      expect(translator.isSensitiveCategory('credential-update')).toBe(true);
      expect(translator.isSensitiveCategory('key-management')).toBe(true);
    });

    it('does not flag normal categories', () => {
      const translator = makeTranslator();
      expect(translator.isSensitiveCategory('sync-log')).toBe(false);
      expect(translator.isSensitiveCategory('doctor-output')).toBe(false);
    });
  });

  describe('agent-result summarisation', () => {
    it('returns short results without summarisation', () => {
      const translator = makeTranslator({ summaryThreshold: 500 });
      const short = 'Fixed the null check. Tests pass.';

      const { translated } = translator.translate(short, { sourceType: 'agent-result' });
      expect(translated).toBe(short);
    });

    it('summarises long results beyond threshold', () => {
      const translator = makeTranslator({ summaryThreshold: 100 });
      const para1 = 'First paragraph with the key outcome.';
      const para2 = 'Second paragraph with extended details.'.padEnd(200, ' explanation');
      const raw = `${para1}\n\n${para2}`;

      const { translated } = translator.translate(raw, { sourceType: 'agent-result' });

      expect(translated).toContain(para1);
      expect(translated).toMatch(/expand|full details/i);
    });

    it('respects summaryThreshold=0 (never summarise)', () => {
      const translator = makeTranslator({ summaryThreshold: 0 });
      const longResult = 'A'.repeat(2000);

      const { translated } = translator.translate(longResult, { sourceType: 'agent-result' });
      expect(translated).toBe(longResult);
    });
  });
});
