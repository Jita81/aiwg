/**
 * Unit tests for team.ts handler
 * Covers run, list, info subcommands.
 *
 * @issue #691
 * @parent #684
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { HandlerContext } from '../../../../src/cli/handlers/types.js';

// ── Mocks ────────────────────────────────────────────────────

vi.mock('../../../../src/cli/ui.js', () => ({
  blank: vi.fn(),
  rule: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  dim: vi.fn(),
  bold: vi.fn((s: string) => s),
  brandMark: vi.fn(() => '◆'),
  dimText: vi.fn((s: string) => s),
  header: vi.fn(),
  accent: vi.fn((s: string) => s),
  error: vi.fn(),
}));

import { teamHandler } from '../../../../src/cli/handlers/team.js';

// ── Test data ─────────────────────────────────────────────────

const sampleTeam = {
  name: 'SDLC Review',
  slug: 'sdlc-review',
  description: 'Core SDLC review team',
  agents: [
    { agent: 'requirements-analyst', role: 'lead', responsibilities: ['Analyze requirements'] },
    { agent: 'test-architect', role: 'reviewer', responsibilities: ['Review test coverage'] },
  ],
  dispatch: 'sequential' as const,
  sdlc_phases: ['elaboration', 'construction'],
};

// ── Helpers ───────────────────────────────────────────────────

let tmpDir: string;
let teamsDir: string;
let frameworkRoot: string;

function makeCtx(args: string[] = {}): HandlerContext {
  return {
    args: args as unknown as string[],
    rawArgs: ['team', ...(args as unknown as string[])],
    cwd: tmpDir,
    frameworkRoot,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'aiwg-team-test-'));
  frameworkRoot = mkdtempSync(join(tmpdir(), 'aiwg-team-fw-'));
  teamsDir = join(tmpDir, '.aiwg', 'teams');
  mkdirSync(teamsDir, { recursive: true });
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(frameworkRoot, { recursive: true, force: true });
});

function writeTeam(slug: string, team = sampleTeam): void {
  writeFileSync(join(teamsDir, `${slug}.json`), JSON.stringify(team));
}

// ── teamHandler metadata ──────────────────────────────────────

describe('teamHandler metadata', () => {
  it('has correct id and category', () => {
    expect(teamHandler.id).toBe('team');
    expect(teamHandler.category).toBe('orchestration');
    expect(teamHandler.aliases).toContain('teams');
    expect(typeof teamHandler.execute).toBe('function');
  });
});

// ── No subcommand / help ──────────────────────────────────────

describe('team (no subcommand)', () => {
  it('shows help and exits 0', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await teamHandler.execute(makeCtx([]));
    expect(result.exitCode).toBe(0);
    consoleSpy.mockRestore();
  });

  it('unknown subcommand exits 1', async () => {
    const result = await teamHandler.execute(makeCtx(['bogus']));
    expect(result.exitCode).toBe(1);
  });
});

// ── team list ────────────────────────────────────────────────

describe('team list', () => {
  it('exits 0 when no teams found (graceful)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await teamHandler.execute(makeCtx(['list']));
    expect(result.exitCode).toBe(0);
    consoleSpy.mockRestore();
  });

  it('exits 0 and lists teams when teams exist', async () => {
    writeTeam('sdlc-review');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await teamHandler.execute(makeCtx(['list']));
    expect(result.exitCode).toBe(0);
    consoleSpy.mockRestore();
  });

  it('--json outputs parseable JSON array', async () => {
    writeTeam('sdlc-review');
    const jsonLines: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((s) => jsonLines.push(String(s)));
    await teamHandler.execute(makeCtx(['list', '--json']));
    consoleSpy.mockRestore();
    const jsonOutput = jsonLines.find(s => { try { JSON.parse(s); return true; } catch { return false; } });
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty('slug', 'sdlc-review');
  });
});

// ── team info ────────────────────────────────────────────────

describe('team info', () => {
  it('exits 1 when no slug given', async () => {
    const result = await teamHandler.execute(makeCtx(['info']));
    expect(result.exitCode).toBe(1);
  });

  it('exits 1 when team not found', async () => {
    const result = await teamHandler.execute(makeCtx(['info', 'nonexistent']));
    expect(result.exitCode).toBe(1);
  });

  it('exits 0 and shows team info for known team', async () => {
    writeTeam('sdlc-review');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await teamHandler.execute(makeCtx(['info', 'sdlc-review']));
    expect(result.exitCode).toBe(0);
    consoleSpy.mockRestore();
  });

  it('--json outputs parseable JSON with team fields', async () => {
    writeTeam('sdlc-review');
    const jsonLines: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((s) => jsonLines.push(String(s)));
    await teamHandler.execute(makeCtx(['info', 'sdlc-review', '--json']));
    consoleSpy.mockRestore();
    const jsonOutput = jsonLines.find(s => { try { JSON.parse(s); return true; } catch { return false; } });
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed).toHaveProperty('name', 'SDLC Review');
    expect(parsed).toHaveProperty('agents');
  });
});

// ── team run ─────────────────────────────────────────────────

describe('team run', () => {
  it('exits 1 when no slug given', async () => {
    const result = await teamHandler.execute(makeCtx(['run']));
    expect(result.exitCode).toBe(1);
  });

  it('exits 1 when team not found', async () => {
    const result = await teamHandler.execute(makeCtx(['run', 'nonexistent']));
    expect(result.exitCode).toBe(1);
  });

  it('exits 0 for known team (claude native dispatch)', async () => {
    writeTeam('sdlc-review');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Simulate Claude Code environment
    const origEnv = process.env.CLAUDE_CODE_VERSION;
    process.env.CLAUDE_CODE_VERSION = '1.0.0';
    const result = await teamHandler.execute(makeCtx(['run', 'sdlc-review']));
    process.env.CLAUDE_CODE_VERSION = origEnv;
    expect(result.exitCode).toBe(0);
    consoleSpy.mockRestore();
  });

  it('exits 0 for known team with --provider override (mc emulation)', async () => {
    writeTeam('sdlc-review');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await teamHandler.execute(makeCtx(['run', 'sdlc-review', '--provider', 'cursor']));
    expect(result.exitCode).toBe(0);
    consoleSpy.mockRestore();
  });
});
