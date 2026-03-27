/**
 * Unit tests for aiwg packages handler
 *
 * @source @src/cli/handlers/packages.ts
 * @implements #557
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HandlerContext } from '../../../../src/cli/handlers/types.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../../src/packages/registry.js', () => ({
  listInstalledPackages: vi.fn(),
  uninstallPackage: vi.fn(),
}));

vi.mock('../../../../src/packages/package-registry.js', () => ({
  getPackageEntry: vi.fn(),
}));

vi.mock('../../../../src/cli/ui.js', () => ({
  blank: vi.fn(),
  rule: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  dim: vi.fn(),
  dimText: vi.fn((s: string) => s),
  bold: vi.fn((s: string) => s),
  brandMark: vi.fn(() => '◆'),
}));

const SAMPLE_PACKAGE_INFO = {
  key: 'roko/ring-methodology',
  name: 'ring-methodology',
  owner: 'roko',
  version: '2026.3.4',
  type: 'framework',
  source: 'https://git.integrolabs.net/roko/ring-methodology.git',
  installedAt: '2026-03-01T00:00:00.000Z',
  deployCount: 0,
};

const SAMPLE_ENTRY = {
  version: '2026.3.4',
  source: 'https://git.integrolabs.net/roko/ring-methodology.git',
  type: 'framework',
  cachePath: '/home/user/.cache/aiwg/packages/roko/ring-methodology@2026.3.4',
  installedAt: '2026-03-01T00:00:00.000Z',
  deployedTo: [],
};

function makeCtx(args: string[] = []): HandlerContext {
  return {
    args,
    rawArgs: ['packages', ...args],
    cwd: '/tmp/myproject',
    frameworkRoot: '/opt/aiwg',
  };
}

describe('packagesHandler', () => {
  let mockList: ReturnType<typeof vi.fn>;
  let mockUninstall: ReturnType<typeof vi.fn>;
  let mockGetEntry: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const reg = await import('../../../../src/packages/registry.js');
    const pkgReg = await import('../../../../src/packages/package-registry.js');
    mockList = reg.listInstalledPackages as ReturnType<typeof vi.fn>;
    mockUninstall = reg.uninstallPackage as ReturnType<typeof vi.fn>;
    mockGetEntry = pkgReg.getPackageEntry as ReturnType<typeof vi.fn>;

    mockList.mockResolvedValue([]);
    mockUninstall.mockResolvedValue(false);
    mockGetEntry.mockResolvedValue(undefined);
  });

  describe('handler metadata', () => {
    it('has correct id and category', async () => {
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      expect(packagesHandler.id).toBe('packages');
      expect(packagesHandler.category).toBe('framework');
    });

    it('has pkg alias', async () => {
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      expect(packagesHandler.aliases).toContain('pkg');
    });
  });

  describe('list subcommand', () => {
    it('shows empty state when no packages installed', async () => {
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await packagesHandler.execute(makeCtx(['list']));

      expect(result.exitCode).toBe(0);
      expect(mockList).toHaveBeenCalled();
    });

    it('defaults to list when no subcommand given', async () => {
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await packagesHandler.execute(makeCtx([]));

      expect(result.exitCode).toBe(0);
      expect(mockList).toHaveBeenCalled();
    });

    it('renders package rows when packages are installed', async () => {
      mockList.mockResolvedValue([SAMPLE_PACKAGE_INFO]);
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      await packagesHandler.execute(makeCtx(['list']));

      const output = lines.join('\n');
      expect(output).toContain('roko/ring-methodology');
    });
  });

  describe('info subcommand', () => {
    it('returns exitCode 1 when no key provided', async () => {
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      const result = await packagesHandler.execute(makeCtx(['info']));

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('Package key required');
    });

    it('returns exitCode 1 when package not found', async () => {
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      const result = await packagesHandler.execute(makeCtx(['info', 'missing/package']));

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain("missing/package");
    });

    it('shows package details when entry is found', async () => {
      mockGetEntry.mockResolvedValue(SAMPLE_ENTRY);
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      const result = await packagesHandler.execute(makeCtx(['info', 'roko/ring-methodology']));

      expect(result.exitCode).toBe(0);
      const output = lines.join('\n');
      expect(output).toContain('2026.3.4');
      expect(output).toContain('framework');
    });

    it('shows deployments when present', async () => {
      mockGetEntry.mockResolvedValue({
        ...SAMPLE_ENTRY,
        deployedTo: [{ projectPath: '/p', provider: 'claude', deployedAt: '2026-03-27' }],
      });
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      await packagesHandler.execute(makeCtx(['info', 'roko/ring-methodology']));

      const output = lines.join('\n');
      expect(output).toContain('/p');
      expect(output).toContain('claude');
    });
  });

  describe('remove subcommand', () => {
    it('returns exitCode 1 when no key provided', async () => {
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      const result = await packagesHandler.execute(makeCtx(['remove']));

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('Package key required');
    });

    it('returns exitCode 1 when package not found in registry', async () => {
      mockUninstall.mockResolvedValue(false);
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      const result = await packagesHandler.execute(makeCtx(['remove', 'missing/package']));

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain("missing/package");
    });

    it('returns exitCode 0 when package is removed successfully', async () => {
      mockUninstall.mockResolvedValue(true);
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      const result = await packagesHandler.execute(makeCtx(['remove', 'roko/ring-methodology']));

      expect(result.exitCode).toBe(0);
      expect(mockUninstall).toHaveBeenCalledWith('roko/ring-methodology');
    });

    it('accepts "uninstall" as alias for "remove"', async () => {
      mockUninstall.mockResolvedValue(true);
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      const result = await packagesHandler.execute(makeCtx(['uninstall', 'roko/ring-methodology']));

      expect(result.exitCode).toBe(0);
    });
  });

  describe('unknown subcommand', () => {
    it('returns exitCode 1 with usage info', async () => {
      const { packagesHandler } = await import('../../../../src/cli/handlers/packages.js');
      const result = await packagesHandler.execute(makeCtx(['bogus']));

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain("bogus");
      expect(result.message).toContain('aiwg packages list');
    });
  });
});
