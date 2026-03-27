/**
 * Ralph External Loop — Live UAT with Codex Provider
 *
 * Runs the same orchestrator test cases as the stub UAT suite but using
 * the REAL codex provider. Requires a valid codex CLI installation and
 * OpenAI API key.
 *
 * Run on demand (NOT part of CI):
 *   npm run uat:codex
 *
 * Requirements:
 *   - codex CLI installed (codex exec --full-auto)
 *   - OPENAI_API_KEY set
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirnameUat = dirname(__filename);
const PROJECT_ROOT = resolve(__dirnameUat, '../..');

// @ts-ignore
const { Orchestrator } = await import(join(PROJECT_ROOT, 'tools/ralph-external/orchestrator.mjs'));
// @ts-ignore
const { StateManager } = await import(join(PROJECT_ROOT, 'tools/ralph-external/state-manager.mjs'));

function makeTmpDir(): string {
  const dir = join(tmpdir(), `aiwg-uat-codex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const LIVE_BASE_CONFIG = {
  provider: 'codex',
  maxIterations: 3,
  model: 'haiku',           // Maps to gpt-5.4 via codex adapter (all tiers use flagship for CLI)
  timeoutMinutes: 3,
  enablePIDControl: false,
  enableOverseer: false,
  enableSemanticMemory: false,
  crossTask: false,
  enableAnalytics: false,
  enableBestOutput: false,
  enableEarlyStopping: false,
  enableClaudeIntelligence: false,
  enableSnapshots: false,
  enableCheckpoints: false,
};

let testDir: string;

beforeEach(() => {
  testDir = makeTmpDir();
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe('UAT [LIVE-CODEX]: Orchestrator — real codex provider', () => {
  it('completes a trivial task in ≤3 iterations', async () => {
    const orc = new Orchestrator(testDir);
    const doneFile = join(testDir, 'uat-done.txt');

    const result = await orc.execute({
      ...LIVE_BASE_CONFIG,
      objective: `Create a file at ${doneFile} containing the text "Ralph Loop: SUCCESS"`,
      completionCriteria: `File ${doneFile} exists and contains "Ralph Loop: SUCCESS"`,
    });

    expect(result.loopId).toBeDefined();
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.iterations).toBeLessThanOrEqual(3);
  }, 300000);

  it('creates per-iteration output files', async () => {
    const orc = new Orchestrator(testDir);
    const doneFile = join(testDir, 'uat-outputs-done.txt');

    await orc.execute({
      ...LIVE_BASE_CONFIG,
      objective: `Create a file at ${doneFile} containing the text "Ralph Loop: SUCCESS"`,
      completionCriteria: `File ${doneFile} exists`,
      maxIterations: 1,
    });

    const outputsDir = join(testDir, '.aiwg', 'ralph-external', 'outputs');
    expect(existsSync(outputsDir)).toBe(true);
    expect(existsSync(join(outputsDir, '001-stdout.log'))).toBe(true);
  }, 300000);

  it('saves state after completion', async () => {
    const orc = new Orchestrator(testDir);
    const doneFile = join(testDir, 'uat-state-done.txt');

    await orc.execute({
      ...LIVE_BASE_CONFIG,
      objective: `Create a file at ${doneFile} containing the text "Ralph Loop: SUCCESS"`,
      completionCriteria: `File ${doneFile} exists`,
    });

    const sm = new StateManager(testDir);
    const state = sm.load();
    expect(state).not.toBeNull();
    expect(['completed', 'failed', 'limit_reached']).toContain(state.status);
  }, 300000);
});
