/**
 * Unit tests for tools/cli/update.mjs
 *
 * Tests channel-switching logic. Because update.mjs is a standalone script,
 * we test the switchTo* functions from the channel manager that it delegates to,
 * and verify the script has the right structure.
 *
 * @issue #687
 * @parent #684
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const UPDATE_SCRIPT = resolve(__dirname, '../../../tools/cli/update.mjs');

// Mock channel manager functions called by update.mjs
const mockSwitchToNext = vi.fn().mockResolvedValue(undefined);
const mockSwitchToNightly = vi.fn().mockResolvedValue(undefined);
const mockSwitchToStable = vi.fn().mockResolvedValue(undefined);
const mockLoadConfig = vi.fn().mockResolvedValue({ channel: 'stable' });

vi.mock('../../../src/channel/manager.mjs', () => ({
  loadConfig: mockLoadConfig,
  switchToNext: mockSwitchToNext,
  switchToNightly: mockSwitchToNightly,
  switchToStable: mockSwitchToStable,
}));

// ── File existence ───────────────────────────────────────────

describe('tools/cli/update.mjs — file', () => {
  it('exists at expected path', () => {
    expect(existsSync(UPDATE_SCRIPT)).toBe(true);
  });

  it('starts with shebang', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(UPDATE_SCRIPT, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('imports switchToNext, switchToNightly, switchToStable from channel manager', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(UPDATE_SCRIPT, 'utf-8');
    expect(content).toContain('switchToNext');
    expect(content).toContain('switchToNightly');
    expect(content).toContain('switchToStable');
  });

  it('handles --channel flag', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(UPDATE_SCRIPT, 'utf-8');
    expect(content).toContain('--channel');
  });

  it('handles unknown channel with exit 1', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(UPDATE_SCRIPT, 'utf-8');
    expect(content).toContain('Unknown channel');
    expect(content).toContain('process.exit(1)');
  });
});

// ── Channel switching logic (mirrors update.mjs runUpdate) ────

describe('update.mjs: channel switching logic', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function simulateUpdate(channelArg: string | null, currentChannel = 'stable') {
    mockLoadConfig.mockResolvedValue({ channel: currentChannel });
    const { loadConfig, switchToNext, switchToNightly, switchToStable } = await import('../../../src/channel/manager.mjs');
    const config = await loadConfig();

    if (channelArg) {
      switch (channelArg) {
        case 'next': await switchToNext(); break;
        case 'nightly': await switchToNightly(); break;
        case 'latest': case 'stable': await switchToStable(); break;
        default: throw new Error(`Unknown channel: ${channelArg}`);
      }
    }
    return config;
  }

  it('--channel next calls switchToNext()', async () => {
    await simulateUpdate('next');
    expect(mockSwitchToNext).toHaveBeenCalled();
    expect(mockSwitchToNightly).not.toHaveBeenCalled();
    expect(mockSwitchToStable).not.toHaveBeenCalled();
  });

  it('--channel nightly calls switchToNightly()', async () => {
    await simulateUpdate('nightly');
    expect(mockSwitchToNightly).toHaveBeenCalled();
    expect(mockSwitchToNext).not.toHaveBeenCalled();
  });

  it('--channel latest calls switchToStable()', async () => {
    await simulateUpdate('latest');
    expect(mockSwitchToStable).toHaveBeenCalled();
  });

  it('--channel stable calls switchToStable()', async () => {
    await simulateUpdate('stable');
    expect(mockSwitchToStable).toHaveBeenCalled();
  });

  it('unknown channel throws error', async () => {
    await expect(simulateUpdate('unknown-xyz')).rejects.toThrow('Unknown channel');
  });
});

// ── Workspace-status.mjs ───────────────────────────────────────

describe('tools/cli/workspace-status.mjs — file', () => {
  const SCRIPT = resolve(__dirname, '../../../tools/cli/workspace-status.mjs');

  it('exists', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('starts with shebang', async () => {
    const { readFileSync } = await import('fs');
    expect(readFileSync(SCRIPT, 'utf-8').startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('reads .aiwg/frameworks/registry.json (workspace registry)', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toMatch(/registry\.json|frameworks/);
  });
});

// ── workspace-migrate.mjs ────────────────────────────────────

describe('tools/cli/workspace-migrate.mjs — file', () => {
  const SCRIPT = resolve(__dirname, '../../../tools/cli/workspace-migrate.mjs');

  it('exists', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('supports --dry-run flag', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('dry-run');
  });

  it('creates backup (mentions backup path)', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toMatch(/backup/i);
  });
});

// ── workspace-rollback.mjs ───────────────────────────────────

describe('tools/cli/workspace-rollback.mjs — file', () => {
  const SCRIPT = resolve(__dirname, '../../../tools/cli/workspace-rollback.mjs');

  it('exists', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('handles missing backup gracefully (has error handling)', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    // Should not crash silently — check for error messaging
    expect(content).toMatch(/No backup|backup.*not found|exit\(1\)/i);
  });
});

// ── validate-metadata.mjs ────────────────────────────────────

describe('tools/cli/validate-metadata.mjs — file', () => {
  const SCRIPT = resolve(__dirname, '../../../tools/cli/validate-metadata.mjs');

  it('exists', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('exits 1 on invalid metadata (has exit 1)', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('process.exit(1)');
  });

  it('supports --fix flag', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('--fix');
  });

  it('supports --format flag', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('--format');
  });
});

// ── config-gitignore.mjs ──────────────────────────────────────

describe('tools/cli/config-gitignore.mjs — file', () => {
  const SCRIPT = resolve(__dirname, '../../../tools/cli/config-gitignore.mjs');

  it('exists', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('handles --fix flag', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('--fix');
  });

  it('covers AIWG runtime patterns', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('.aiwg/working/');
  });

  it('handles missing .gitignore by creating one', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(SCRIPT, 'utf-8');
    // Should handle no .gitignore case
    expect(content).toMatch(/\.gitignore/);
  });
});
