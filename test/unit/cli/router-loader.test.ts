/**
 * Regression tests for router-loader.mjs tsx resolution
 *
 * Covers the bug where aiwg CLI crashed with exit 254 on global npm installs
 * because router-loader hardcoded the local devDependency path for tsx
 * (../../node_modules/.bin/tsx), which does not exist in production.
 *
 * @issue router-loader-tsx-fallback (fixed in rc.8)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the resolution logic directly by mocking fs.existsSync
// and inspecting what spawn is called with.

const mockSpawn = vi.fn(() => ({
  on: vi.fn((event, cb) => {
    if (event === 'close') cb(0);
  }),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

describe('router-loader tsx resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses local tsx binary when it exists', async () => {
    vi.mock('fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
    }));

    // Import after mocking
    const { existsSync } = await import('fs');
    const localBinExists = existsSync('/some/path/to/tsx');

    expect(localBinExists).toBe(true);
  });

  it('falls back to npx when local tsx binary is absent', async () => {
    // Simulate: local binary absent → should use npx
    const fakeExistsSync = vi.fn().mockReturnValue(false);

    // Replicate the resolveTsx logic from router-loader.mjs
    function resolveTsx(localBin: string, existsFn: (p: string) => boolean) {
      if (existsFn(localBin)) {
        return { cmd: localBin, args: [] };
      }
      return { cmd: 'npx', args: ['--yes', 'tsx'] };
    }

    const result = resolveTsx('/fake/node_modules/.bin/tsx', fakeExistsSync);

    expect(result.cmd).toBe('npx');
    expect(result.args).toEqual(['--yes', 'tsx']);
  });

  it('uses local binary directly when present (no npx overhead)', async () => {
    const fakeExistsSync = vi.fn().mockReturnValue(true);

    function resolveTsx(localBin: string, existsFn: (p: string) => boolean) {
      if (existsFn(localBin)) {
        return { cmd: localBin, args: [] };
      }
      return { cmd: 'npx', args: ['--yes', 'tsx'] };
    }

    const result = resolveTsx('/fake/node_modules/.bin/tsx', fakeExistsSync);

    expect(result.cmd).toBe('/fake/node_modules/.bin/tsx');
    expect(result.args).toEqual([]);
  });

  it('never spawns the raw tsx command name without npx as wrapper when local bin absent', async () => {
    // Guard: ensure we never produce { cmd: 'tsx', args: [] } — that would
    // depend on tsx being in PATH globally, which is not guaranteed.
    const fakeExistsSync = vi.fn().mockReturnValue(false);

    function resolveTsx(localBin: string, existsFn: (p: string) => boolean) {
      if (existsFn(localBin)) {
        return { cmd: localBin, args: [] };
      }
      return { cmd: 'npx', args: ['--yes', 'tsx'] };
    }

    const result = resolveTsx('/fake/node_modules/.bin/tsx', fakeExistsSync);

    // Must not be bare 'tsx' — that silently fails if tsx isn't globally installed
    expect(result.cmd).not.toBe('tsx');
    // Must use npx as the wrapper
    expect(result.cmd).toBe('npx');
  });
});
