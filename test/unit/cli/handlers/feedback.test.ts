/**
 * Unit tests for feedback.ts handler
 *
 * @issue #885
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HandlerContext } from '../../../../src/cli/handlers/types.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockSpawnSync,
  mockReadAiwgConfig,
  mockRlQuestion,
  mockRlClose,
} = vi.hoisted(() => ({
  mockSpawnSync: vi.fn(),
  mockReadAiwgConfig: vi.fn().mockResolvedValue(null),
  mockRlQuestion: vi.fn(),
  mockRlClose: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawnSync: mockSpawnSync,
}));

vi.mock('../../../../src/config/aiwg-config.js', () => ({
  readAiwgConfig: mockReadAiwgConfig,
}));

// Mock readline — default: non-interactive (isTTY = false via process.stdin)
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: mockRlQuestion,
    close: mockRlClose,
  })),
}));

import { feedbackHandler } from '../../../../src/cli/handlers/feedback.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(args: string[] = []): HandlerContext {
  return {
    args,
    rawArgs: ['feedback', ...args],
    cwd: '/mock/cwd',
    frameworkRoot: '/mock/framework/root',
  };
}

/** Set process.stdin.isTTY — returns restore function */
function setTTY(value: boolean): () => void {
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  return () => Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('feedbackHandler metadata', () => {
  it('has correct id, category, and aliases', () => {
    expect(feedbackHandler.id).toBe('feedback');
    expect(feedbackHandler.category).toBe('utility');
    expect(feedbackHandler.aliases).toContain('report');
    expect(feedbackHandler.description).toMatch(/feedback/i);
    expect(typeof feedbackHandler.execute).toBe('function');
  });
});

describe('feedbackHandler.execute — arg parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: gh CLI not present
    mockSpawnSync.mockReturnValue({ status: 1 });
    // aiwg version returns something
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === process.execPath && Array.isArray(args) && args.includes('version')) {
        return { status: 0, stdout: '2026.4.0' };
      }
      return { status: 1 };
    });
  });

  it('parses --type bug', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'bug', '--title', 'test', '--body', 'desc']));
    // Should print issue body containing "Bug Report"
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/bug/i);
    logSpy.mockRestore();
    restore();
  });

  it('parses --type feature', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'feature', '--title', 'test', '--body', 'desc']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/feature/i);
    logSpy.mockRestore();
    restore();
  });

  it('parses --type doc', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'doc', '--title', 'test', '--body', 'desc']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/doc/i);
    logSpy.mockRestore();
    restore();
  });

  it('defaults to "other" when --type is not provided in non-interactive mode', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--title', 'test', '--body', 'desc']));
    // Should complete without error and fall through to stdout print
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
    restore();
  });

  it('uses default title when --title is not provided', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'bug', '--body', 'desc']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/\[bug\]/);
    logSpy.mockRestore();
    restore();
  });
});

describe('feedbackHandler.execute — system context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === process.execPath && Array.isArray(args) && args.includes('version')) {
        return { status: 0, stdout: 'aiwg version 2026.4.0\n' };
      }
      return { status: 1 };
    });
  });

  it('collects system context by default', async () => {
    const restore = setTTY(false);
    mockReadAiwgConfig.mockResolvedValue({
      providers: ['claude'],
      installed: { 'sdlc-complete': {} },
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'bug', '--title', 't', '--body', 'b']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/System context/);
    logSpy.mockRestore();
    restore();
  });

  it('omits system context with --no-context', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'bug', '--title', 't', '--body', 'b', '--no-context']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/System context omitted/);
    logSpy.mockRestore();
    restore();
  });

  it('includes provider and frameworks from config', async () => {
    const restore = setTTY(false);
    mockReadAiwgConfig.mockResolvedValue({
      providers: ['codex'],
      installed: { 'sdlc-complete': {}, 'aiwg-utils': {} },
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'bug', '--title', 't', '--body', 'b']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/codex/);
    expect(printed).toMatch(/sdlc-complete/);
    logSpy.mockRestore();
    restore();
  });
});

describe('feedbackHandler.execute — submission via gh CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses gh CLI when available and it succeeds', async () => {
    const restore = setTTY(false);
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'gh' && Array.isArray(args) && args.includes('--version')) return { status: 0 };
      if (cmd === process.execPath) return { status: 0, stdout: '' };
      if (cmd === 'gh' && Array.isArray(args) && args.includes('create')) return { status: 0 };
      return { status: 0 };
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await feedbackHandler.execute(
      makeCtx(['--type', 'bug', '--title', 'test bug', '--body', 'something broke']),
    );

    expect(result.exitCode).toBe(0);
    const ghCreateCall = mockSpawnSync.mock.calls.find(
      (c: unknown[]) => c[0] === 'gh' && Array.isArray(c[1]) && c[1].includes('create'),
    );
    expect(ghCreateCall).toBeDefined();
    logSpy.mockRestore();
    restore();
  });

  it('passes correct label for bug type', async () => {
    const restore = setTTY(false);
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'gh' && Array.isArray(args) && args.includes('--version')) return { status: 0 };
      if (cmd === process.execPath) return { status: 0, stdout: '' };
      return { status: 0 };
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(
      makeCtx(['--type', 'bug', '--title', 'bug title', '--body', 'body']),
    );

    const ghCreateCall = mockSpawnSync.mock.calls.find(
      (c: unknown[]) => c[0] === 'gh' && Array.isArray(c[1]) && c[1].includes('create'),
    );
    expect(ghCreateCall![1]).toContain('bug');
    logSpy.mockRestore();
    restore();
  });

  it('passes correct label for feature type', async () => {
    const restore = setTTY(false);
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'gh' && Array.isArray(args) && args.includes('--version')) return { status: 0 };
      if (cmd === process.execPath) return { status: 0, stdout: '' };
      return { status: 0 };
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(
      makeCtx(['--type', 'feature', '--title', 'feat title', '--body', 'body']),
    );

    const ghCreateCall = mockSpawnSync.mock.calls.find(
      (c: unknown[]) => c[0] === 'gh' && Array.isArray(c[1]) && c[1].includes('create'),
    );
    expect(ghCreateCall![1]).toContain('enhancement');
    logSpy.mockRestore();
    restore();
  });

  it('falls back to stdout when gh CLI not available and not TTY', async () => {
    const restore = setTTY(false);
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'gh') return { status: 1 }; // gh not available
      if (cmd === process.execPath) return { status: 0, stdout: '' };
      return { status: 1 };
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await feedbackHandler.execute(
      makeCtx(['--type', 'bug', '--title', 'title', '--body', 'body']),
    );

    expect(result.exitCode).toBe(0);
    // Should print the issue body to stdout
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/Issue body|Submit at/i);
    logSpy.mockRestore();
    restore();
  });

  it('falls back to browser when gh CLI fails but TTY is available', async () => {
    const restore = setTTY(true);
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'gh' && Array.isArray(args) && args.includes('--version')) return { status: 0 };
      if (cmd === 'gh' && Array.isArray(args) && args.includes('create')) return { status: 1 }; // create fails
      if (cmd === process.execPath) return { status: 0, stdout: '' };
      // xdg-open or open
      return { status: 0 };
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await feedbackHandler.execute(
      makeCtx(['--type', 'bug', '--title', 'title', '--body', 'body']),
    );

    expect(result.exitCode).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('gh issue create failed'));
    warnSpy.mockRestore();
    logSpy.mockRestore();
    restore();
  });
});

describe('feedbackHandler.execute — issue templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'gh') return { status: 1 }; // no gh CLI
      if (cmd === process.execPath) return { status: 0, stdout: '' };
      return { status: 1 };
    });
  });

  it('bug template includes "Bug Report" heading', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'bug', '--title', 't', '--body', 'b']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/Bug Report/);
    logSpy.mockRestore();
    restore();
  });

  it('feature template includes "Feature Request" heading', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'feature', '--title', 't', '--body', 'b']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/Feature Request/);
    logSpy.mockRestore();
    restore();
  });

  it('doc template includes "Documentation Gap" heading', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(makeCtx(['--type', 'doc', '--title', 't', '--body', 'b']));
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/Documentation Gap/);
    logSpy.mockRestore();
    restore();
  });

  it('includes custom title in output', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(
      makeCtx(['--type', 'bug', '--title', 'my custom bug title', '--body', 'desc']),
    );
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/my custom bug title/);
    logSpy.mockRestore();
    restore();
  });

  it('includes custom body in output', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await feedbackHandler.execute(
      makeCtx(['--type', 'bug', '--title', 't', '--body', 'my detailed description here']),
    );
    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/my detailed description here/);
    logSpy.mockRestore();
    restore();
  });
});

describe('feedbackHandler.execute — return value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnSync.mockReturnValue({ status: 1 });
  });

  it('always returns exitCode 0 on success', async () => {
    const restore = setTTY(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await feedbackHandler.execute(
      makeCtx(['--type', 'bug', '--title', 't', '--body', 'b', '--no-context']),
    );
    expect(result.exitCode).toBe(0);
    logSpy.mockRestore();
    restore();
  });
});
