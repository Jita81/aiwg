/**
 * Unit tests for aiwg marketplace handler
 *
 * Covers:
 *   - marketplace search <query>  fans out to all available adapters
 *   - Results carry source attribution
 *   - --source <id> filters to a single adapter
 *   - --json returns structured output on stdout
 *   - marketplace list returns installed packages
 *   - Unknown subcommand returns exitCode 1 with usage
 *
 * @source @src/cli/handlers/marketplace.ts
 * @implements #805
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HandlerContext } from '../../../../src/cli/handlers/types.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../../src/skills/registry.js', () => ({
  searchSkills: vi.fn(),
  listSkills: vi.fn(),
  getAllAdapters: vi.fn(),
}));

vi.mock('../../../../src/packages/registry.js', () => ({
  listInstalledPackages: vi.fn(),
}));

vi.mock('../../../../src/cli/ui.js', () => ({
  blank: vi.fn(() => console.log('')),
  rule: vi.fn(),
  info: vi.fn((s: string) => console.log(s)),
  success: vi.fn((s: string) => console.log(s)),
  warn: vi.fn((s: string) => console.log(s)),
  // dim routes through console.log so captured output includes empty-state messages
  dim: vi.fn((s: string) => console.log(s)),
  error: vi.fn((s: string) => console.log(s)),
  dimText: vi.fn((s: string) => s),
  bold: vi.fn((s: string) => s),
  accent: vi.fn((s: string) => s),
  brandMark: vi.fn(() => '◆'),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const SAMPLE_CLAWHUB_RESULT = {
  name: 'parallel-dispatch',
  description: 'Spawn parallel subagents for fanout search',
  source: 'clawhub',
  package: 'aiwg/rlm',
  platforms: ['claude'],
  installed: false,
};

const SAMPLE_OPENCLAW_RESULT = {
  name: 'project-awareness',
  description: 'Learn project structure at session start',
  source: 'openclaw',
  package: 'community/utils',
  platforms: ['claude', 'cursor'],
  installed: true,
};

const SAMPLE_LOCAL_RESULT = {
  name: 'induct-research',
  description: 'Bootstrap research workflow',
  source: 'local',
  package: 'aiwg/research-complete',
  platforms: ['claude'],
  installed: true,
};

const SAMPLE_PACKAGE = {
  key: 'roko/ring-methodology',
  name: 'ring-methodology',
  owner: 'roko',
  version: '2026.3.4',
  type: 'framework',
  source: 'https://git.integrolabs.net/roko/ring-methodology.git',
  installedAt: '2026-03-01T00:00:00.000Z',
  deployCount: 1,
};

const SAMPLE_ADAPTERS = [
  { id: 'local', name: 'Local' },
  { id: 'clawhub', name: 'ClawHub Registry' },
  { id: 'openclaw', name: 'OpenClaw Registry' },
];

function makeCtx(args: string[] = []): HandlerContext {
  return {
    args,
    rawArgs: ['marketplace', ...args],
    cwd: '/tmp/myproject',
    frameworkRoot: '/opt/aiwg',
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('marketplaceHandler', () => {
  let mockSearchSkills: ReturnType<typeof vi.fn>;
  let mockListSkills: ReturnType<typeof vi.fn>;
  let mockGetAllAdapters: ReturnType<typeof vi.fn>;
  let mockListPackages: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const registry = await import('../../../../src/skills/registry.js');
    const pkgRegistry = await import('../../../../src/packages/registry.js');

    mockSearchSkills = registry.searchSkills as ReturnType<typeof vi.fn>;
    mockListSkills = registry.listSkills as ReturnType<typeof vi.fn>;
    mockGetAllAdapters = registry.getAllAdapters as ReturnType<typeof vi.fn>;
    mockListPackages = pkgRegistry.listInstalledPackages as ReturnType<typeof vi.fn>;

    mockSearchSkills.mockResolvedValue([]);
    mockListSkills.mockResolvedValue([]);
    mockGetAllAdapters.mockReturnValue(SAMPLE_ADAPTERS);
    mockListPackages.mockResolvedValue([]);
  });

  // ── Handler Metadata ─────────────────────────────────────────────────────

  describe('handler metadata', () => {
    it('has id "marketplace"', async () => {
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');
      expect(marketplaceHandler.id).toBe('marketplace');
    });

    it('has category "framework"', async () => {
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');
      expect(marketplaceHandler.category).toBe('framework');
    });

    it('exports a CommandHandler-shaped object', async () => {
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');
      expect(typeof marketplaceHandler.execute).toBe('function');
      expect(Array.isArray(marketplaceHandler.aliases)).toBe(true);
    });
  });

  // ── marketplace search ───────────────────────────────────────────────────

  describe('search subcommand', () => {
    it('calls searchSkills with the query string', async () => {
      mockSearchSkills.mockResolvedValue([SAMPLE_CLAWHUB_RESULT]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await marketplaceHandler.execute(makeCtx(['search', 'parallel']));

      expect(result.exitCode).toBe(0);
      expect(mockSearchSkills).toHaveBeenCalledWith('parallel', undefined);
    });

    it('returns exitCode 1 when no query provided', async () => {
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');
      const result = await marketplaceHandler.execute(makeCtx(['search']));

      expect(result.exitCode).toBe(1);
      expect(result.message).toMatch(/query required/i);
    });

    it('renders source attribution in table output', async () => {
      mockSearchSkills.mockResolvedValue([SAMPLE_CLAWHUB_RESULT, SAMPLE_OPENCLAW_RESULT]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      await marketplaceHandler.execute(makeCtx(['search', 'dispatch']));

      const output = lines.join('\n');
      expect(output).toContain('clawhub');
      expect(output).toContain('openclaw');
    });

    it('renders result names in output', async () => {
      mockSearchSkills.mockResolvedValue([SAMPLE_CLAWHUB_RESULT]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      await marketplaceHandler.execute(makeCtx(['search', 'parallel']));

      expect(lines.join('\n')).toContain('parallel-dispatch');
    });

    it('shows empty-state message when no results found', async () => {
      mockSearchSkills.mockResolvedValue([]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      const result = await marketplaceHandler.execute(makeCtx(['search', 'nonexistent']));

      expect(result.exitCode).toBe(0);
      const output = lines.join('\n');
      expect(output.toLowerCase()).toMatch(/no results|nothing found|0 results/);
    });

    it('--source flag passes providerId to searchSkills', async () => {
      mockSearchSkills.mockResolvedValue([SAMPLE_CLAWHUB_RESULT]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      vi.spyOn(console, 'log').mockImplementation(() => {});
      await marketplaceHandler.execute(makeCtx(['search', 'parallel', '--source', 'clawhub']));

      expect(mockSearchSkills).toHaveBeenCalledWith('parallel', 'clawhub');
    });

    it('--json outputs parseable JSON array with source field', async () => {
      mockSearchSkills.mockResolvedValue([SAMPLE_CLAWHUB_RESULT, SAMPLE_OPENCLAW_RESULT]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      const result = await marketplaceHandler.execute(
        makeCtx(['search', 'parallel', '--json'])
      );

      expect(result.exitCode).toBe(0);
      const output = lines.join('\n');
      // Must be parseable JSON
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      // Each result must include source attribution
      expect(parsed[0].source).toBe('clawhub');
      expect(parsed[1].source).toBe('openclaw');
    });

    it('--json with --source limits results', async () => {
      mockSearchSkills.mockResolvedValue([SAMPLE_CLAWHUB_RESULT]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      await marketplaceHandler.execute(
        makeCtx(['search', 'parallel', '--source', 'clawhub', '--json'])
      );

      expect(mockSearchSkills).toHaveBeenCalledWith('parallel', 'clawhub');
      const parsed = JSON.parse(lines.join('\n'));
      expect(parsed).toHaveLength(1);
    });
  });

  // ── marketplace list ─────────────────────────────────────────────────────

  describe('list subcommand', () => {
    it('returns exitCode 0 and calls listInstalledPackages', async () => {
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await marketplaceHandler.execute(makeCtx(['list']));

      expect(result.exitCode).toBe(0);
      expect(mockListPackages).toHaveBeenCalled();
    });

    it('shows empty-state message when no packages installed', async () => {
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      await marketplaceHandler.execute(makeCtx(['list']));

      expect(lines.join('\n').toLowerCase()).toMatch(/no packages|nothing installed/);
    });

    it('renders installed package keys in output', async () => {
      mockListPackages.mockResolvedValue([SAMPLE_PACKAGE]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      await marketplaceHandler.execute(makeCtx(['list']));

      expect(lines.join('\n')).toContain('roko/ring-methodology');
    });

    it('--json returns parseable array of installed packages', async () => {
      mockListPackages.mockResolvedValue([SAMPLE_PACKAGE]);
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');

      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));

      const result = await marketplaceHandler.execute(makeCtx(['list', '--json']));

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(lines.join('\n'));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].key).toBe('roko/ring-methodology');
    });
  });

  // ── default (no subcommand) ───────────────────────────────────────────────

  describe('default / no subcommand', () => {
    it('shows usage when called with no arguments', async () => {
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');
      const result = await marketplaceHandler.execute(makeCtx([]));

      expect(result.exitCode).toBe(0);
      expect(result.message).toMatch(/marketplace search|marketplace list/i);
    });
  });

  // ── unknown subcommand ────────────────────────────────────────────────────

  describe('unknown subcommand', () => {
    it('returns exitCode 1 with usage text', async () => {
      const { marketplaceHandler } = await import('../../../../src/cli/handlers/marketplace.js');
      const result = await marketplaceHandler.execute(makeCtx(['bogus']));

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('bogus');
      expect(result.message).toMatch(/marketplace search|marketplace list/i);
    });
  });
});
