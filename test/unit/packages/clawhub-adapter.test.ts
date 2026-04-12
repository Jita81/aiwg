/**
 * Unit tests for ClawHubPackageAdapter and clawhub:/openclaw: parseRef support
 *
 * @source @src/packages/adapters/clawhub.ts
 * @source @src/packages/registry.ts
 * @implements #803
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseRef } from '../../../src/packages/registry.js';

// ── Mock fs/promises so fetch() doesn't touch disk ─────────────────────────

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(new Error('no manifest')),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  default: { existsSync: vi.fn().mockReturnValue(false) },
}));

// ── Mock global fetch for ClawHub API calls ─────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── parseRef: clawhub / openclaw scheme ────────────────────────────────────

describe('parseRef — clawhub: scheme', () => {
  it('parses clawhub:owner/name without version', () => {
    const ref = parseRef('clawhub:aiwg/sdlc');
    expect(ref.scheme).toBe('clawhub');
    expect(ref.owner).toBe('aiwg');
    expect(ref.name).toBe('sdlc');
    expect(ref.version).toBeUndefined();
  });

  it('parses clawhub:owner/name@version', () => {
    const ref = parseRef('clawhub:aiwg/sdlc@v2026.4.0');
    expect(ref.scheme).toBe('clawhub');
    expect(ref.owner).toBe('aiwg');
    expect(ref.name).toBe('sdlc');
    expect(ref.version).toBe('v2026.4.0');
  });

  it('parses openclaw: as an alias for clawhub:', () => {
    const ref = parseRef('openclaw:aiwg/sdlc');
    expect(ref.scheme).toBe('clawhub');
    expect(ref.owner).toBe('aiwg');
    expect(ref.name).toBe('sdlc');
  });

  it('parses openclaw:owner/name@version', () => {
    const ref = parseRef('openclaw:aiwg/sdlc@v1.0.0');
    expect(ref.scheme).toBe('clawhub');
    expect(ref.owner).toBe('aiwg');
    expect(ref.name).toBe('sdlc');
    expect(ref.version).toBe('v1.0.0');
  });

  it('preserves raw string on clawhub ref', () => {
    const raw = 'clawhub:aiwg/sdlc@v1.0.0';
    const ref = parseRef(raw);
    expect(ref.raw).toBe(raw);
  });

  it('does not affect existing github: parsing', () => {
    const ref = parseRef('github:jmagly/aiwg');
    expect(ref.scheme).toBe('github');
  });

  it('does not affect gitea shorthand parsing', () => {
    const ref = parseRef('roko/ring-methodology');
    expect(ref.scheme).toBe('gitea');
  });
});

// ── ClawHubPackageAdapter unit tests ───────────────────────────────────────

describe('ClawHubPackageAdapter', () => {
  let adapter: import('../../../src/packages/adapters/clawhub.js').ClawHubPackageAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../src/packages/adapters/clawhub.js');
    adapter = new mod.ClawHubPackageAdapter();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('canResolve', () => {
    it('returns true for clawhub: prefix', () => {
      expect(adapter.canResolve('clawhub:aiwg/sdlc')).toBe(true);
    });

    it('returns true for openclaw: prefix', () => {
      expect(adapter.canResolve('openclaw:aiwg/sdlc')).toBe(true);
    });

    it('returns false for github: prefix', () => {
      expect(adapter.canResolve('github:jmagly/aiwg')).toBe(false);
    });

    it('returns false for gitea shorthand', () => {
      expect(adapter.canResolve('roko/ring-methodology')).toBe(false);
    });

    it('returns false for https URL', () => {
      expect(adapter.canResolve('https://github.com/jmagly/aiwg')).toBe(false);
    });
  });

  describe('resolve', () => {
    it('returns a PackageSource with label for owner/name ref', async () => {
      const ref = parseRef('clawhub:aiwg/sdlc');
      const source = await adapter.resolve(ref);
      expect(source).not.toBeNull();
      expect(source!.label).toContain('clawhub.ai');
      expect(source!.label).toContain('aiwg');
      expect(source!.label).toContain('sdlc');
    });

    it('includes version in source.ref when provided', async () => {
      const ref = parseRef('clawhub:aiwg/sdlc@v2026.4.0');
      const source = await adapter.resolve(ref);
      expect(source!.ref).toBe('v2026.4.0');
    });

    it('returns null when owner or name is missing', async () => {
      const ref = parseRef('clawhub:aiwg/sdlc');
      ref.owner = undefined;
      const source = await adapter.resolve(ref);
      expect(source).toBeNull();
    });
  });

  describe('fetch', () => {
    it('downloads content from ClawHub API and writes to cache', async () => {
      const { mkdir, writeFile } = await import('fs/promises');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: '# SKILL\nThis is an sdlc skill.',
          version: 'v2026.4.0',
        }),
      });

      const ref = parseRef('clawhub:aiwg/sdlc');
      const source = await adapter.resolve(ref);
      const cachePath = await adapter.fetch(source!);

      expect(cachePath).toBeTruthy();
      expect(cachePath).toContain('aiwg');
      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });

    it('returns cached path without re-fetching when already cached', async () => {
      const { existsSync } = await import('fs');
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const ref = parseRef('clawhub:aiwg/sdlc');
      const source = await adapter.resolve(ref);
      const cachePath = await adapter.fetch(source!);

      // Should not have called the API since it's cached
      expect(mockFetch).not.toHaveBeenCalled();
      expect(cachePath).toBeTruthy();
    });

    it('re-fetches when refresh:true is passed even if cached', async () => {
      const { existsSync } = await import('fs');
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: '# SKILL\nRefreshed content.',
          version: 'latest',
        }),
      });

      const ref = parseRef('clawhub:aiwg/sdlc');
      const source = await adapter.resolve(ref);
      await adapter.fetch(source!, { refresh: true });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('throws when ClawHub API returns non-ok response', async () => {
      const { existsSync } = await import('fs');
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'not found' }),
      });

      const ref = parseRef('clawhub:aiwg/nonexistent-package');
      const source = await adapter.resolve(ref);
      await expect(adapter.fetch(source!)).rejects.toThrow();
    });

    it('throws when API response has no content field', async () => {
      const { existsSync } = await import('fs');
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ version: 'v1.0.0' }), // no `content`
      });

      const ref = parseRef('clawhub:aiwg/sdlc');
      const source = await adapter.resolve(ref);
      await expect(adapter.fetch(source!)).rejects.toThrow();
    });
  });
});

// ── Integration: resolveRef picks up ClawHubPackageAdapter ─────────────────

describe('resolveRef — clawhub: integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves clawhub: ref via ClawHubPackageAdapter', async () => {
    const { resolveRef } = await import('../../../src/packages/registry.js');
    const ref = parseRef('clawhub:aiwg/sdlc');

    const result = await resolveRef(ref);
    expect(result).not.toBeNull();
    expect(result!.adapter.id).toBe('clawhub');
  });

  it('resolves openclaw: ref via ClawHubPackageAdapter', async () => {
    const { resolveRef } = await import('../../../src/packages/registry.js');
    const ref = parseRef('openclaw:aiwg/sdlc');

    const result = await resolveRef(ref);
    expect(result).not.toBeNull();
    expect(result!.adapter.id).toBe('clawhub');
  });
});
