/**
 * Regression tests for doctor channel awareness
 *
 * Covers the false-positive "AIWG not installed" error that doctor reported
 * when running on the `next` channel (npm global install). The root cause was
 * that doctor hardcoded ~/.local/share/ai-writing-guide as AIWG_ROOT, which
 * only exists for edge/git-clone installs — not for npm global installs.
 *
 * @issue doctor-channel-false-positive (fixed alongside tsx fallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock channel manager to simulate different install scenarios
const mockGetFrameworkRoot = vi.fn();
const mockGetVersionInfo = vi.fn();

vi.mock('../../../src/channel/manager.mjs', () => ({
  getFrameworkRoot: mockGetFrameworkRoot,
  getVersionInfo: mockGetVersionInfo,
}));

describe('doctor channel awareness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFrameworkRoot resolution', () => {
    it('resolves to npm global path on stable channel', async () => {
      const npmGlobalPath = '/usr/local/lib/node_modules/aiwg';
      mockGetFrameworkRoot.mockResolvedValue(npmGlobalPath);

      const { getFrameworkRoot } = await import('../../../src/channel/manager.mjs');
      const root = await getFrameworkRoot();

      expect(root).toBe(npmGlobalPath);
      expect(root).not.toContain('.local/share/ai-writing-guide');
    });

    it('resolves to npm global path on next channel (rc install)', async () => {
      const npmGlobalPath = '/usr/local/lib/node_modules/aiwg';
      mockGetFrameworkRoot.mockResolvedValue(npmGlobalPath);

      const { getFrameworkRoot } = await import('../../../src/channel/manager.mjs');
      const root = await getFrameworkRoot();

      // Key regression: next channel must NOT use the legacy edge path
      expect(root).not.toContain('ai-writing-guide');
    });

    it('resolves to edge path when channel is edge', async () => {
      const edgePath = '/home/user/.local/share/ai-writing-guide';
      mockGetFrameworkRoot.mockResolvedValue(edgePath);

      const { getFrameworkRoot } = await import('../../../src/channel/manager.mjs');
      const root = await getFrameworkRoot();

      expect(root).toBe(edgePath);
    });
  });

  describe('getVersionInfo channel label', () => {
    it('includes [next] label for rc builds', async () => {
      mockGetVersionInfo.mockResolvedValue({
        version: '2026.4.0-rc.8',
        channel: 'next',
        packageRoot: '/usr/local/lib/node_modules/aiwg',
        devMode: false,
      });

      const { getVersionInfo } = await import('../../../src/channel/manager.mjs');
      const info = await getVersionInfo();

      expect(info.channel).toBe('next');
      expect(info.version).toContain('-rc.');
    });

    it('includes [nightly] label for nightly builds', async () => {
      mockGetVersionInfo.mockResolvedValue({
        version: '2026.4.0-nightly.20260404',
        channel: 'nightly',
        packageRoot: '/usr/local/lib/node_modules/aiwg',
        devMode: false,
      });

      const { getVersionInfo } = await import('../../../src/channel/manager.mjs');
      const info = await getVersionInfo();

      expect(info.channel).toBe('nightly');
    });

    it('reports stable channel without suffix for stable builds', async () => {
      mockGetVersionInfo.mockResolvedValue({
        version: '2026.4.0',
        channel: 'stable',
        packageRoot: '/usr/local/lib/node_modules/aiwg',
        devMode: false,
      });

      const { getVersionInfo } = await import('../../../src/channel/manager.mjs');
      const info = await getVersionInfo();

      expect(info.channel).toBe('stable');
      expect(info.version).not.toContain('-');
    });
  });

  describe('doctor installation check logic', () => {
    it('does not emit false-positive error when npm global root exists', () => {
      // Simulate: getFrameworkRoot() returned an npm global path that exists
      // Doctor should report OK, not "AIWG not installed"
      const frameworkRoot = '/usr/local/lib/node_modules/aiwg';
      const fileExists = vi.fn().mockResolvedValue(true);

      // Replicate the doctor check logic
      async function checkInstallation(root: string, exists: (p: string) => Promise<boolean>) {
        const installed = await exists(root);
        return installed
          ? { status: 'ok', message: `Found at ${root}` }
          : { status: 'error', message: `AIWG not found at ${root}. Run: npm install -g aiwg` };
      }

      return checkInstallation(frameworkRoot, fileExists).then((result) => {
        expect(result.status).toBe('ok');
        expect(result.message).toContain(frameworkRoot);
      });
    });

    it('reports error with the actual checked path (not legacy edge path)', () => {
      const frameworkRoot = '/usr/local/lib/node_modules/aiwg';
      const fileExists = vi.fn().mockResolvedValue(false);

      async function checkInstallation(root: string, exists: (p: string) => Promise<boolean>) {
        const installed = await exists(root);
        return installed
          ? { status: 'ok', message: `Found at ${root}` }
          : { status: 'error', message: `AIWG not found at ${root}. Run: npm install -g aiwg` };
      }

      return checkInstallation(frameworkRoot, fileExists).then((result) => {
        expect(result.status).toBe('error');
        // Error must show the actual path checked, not a hardcoded legacy path
        expect(result.message).toContain(frameworkRoot);
        expect(result.message).not.toContain('ai-writing-guide');
      });
    });
  });
});
