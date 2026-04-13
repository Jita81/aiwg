/**
 * Checksum Manifest Tests
 *
 * Tests for the stat-first change detection manifest used by index-builder.
 *
 * @source @src/artifacts/checksum-manifest.ts
 * @issue #794
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadManifest,
  writeManifest,
  statMatches,
  makeEntry,
  pruneManifest,
  type ChecksumManifest,
} from '../../../src/artifacts/checksum-manifest.js';

const TEST_DIR = join(tmpdir(), `aiwg-manifest-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('loadManifest', () => {
  it('returns empty manifest when file does not exist', () => {
    const m = loadManifest(TEST_DIR);
    expect(m.version).toBe(1);
    expect(m.entries).toEqual({});
  });

  it('loads a valid manifest file', () => {
    const manifest: ChecksumManifest = {
      version: 1,
      generated: '2026-04-13T00:00:00Z',
      entries: {
        'foo.md': { checksum: 'abc123', mtime: '2026-01-01T00:00:00Z', size: 100 },
      },
    };
    writeManifest(TEST_DIR, manifest);

    const loaded = loadManifest(TEST_DIR);
    expect(loaded.entries['foo.md']).toEqual(manifest.entries['foo.md']);
  });

  it('returns empty manifest when file is malformed JSON', () => {
    writeFileSync(join(TEST_DIR, 'checksum-manifest.json'), 'not json');
    const m = loadManifest(TEST_DIR);
    expect(m.entries).toEqual({});
  });

  it('returns empty manifest when version is wrong', () => {
    writeFileSync(
      join(TEST_DIR, 'checksum-manifest.json'),
      JSON.stringify({ version: 99, entries: {} })
    );
    const m = loadManifest(TEST_DIR);
    expect(m.entries).toEqual({});
  });
});

describe('writeManifest', () => {
  it('writes atomically via temp + rename', () => {
    const manifest: ChecksumManifest = {
      version: 1,
      generated: '2026-04-13T00:00:00Z',
      entries: { 'a.md': { checksum: 'xyz', mtime: '2026-01-01T00:00:00Z', size: 50 } },
    };
    writeManifest(TEST_DIR, manifest);

    const loaded = loadManifest(TEST_DIR);
    expect(loaded.entries['a.md'].checksum).toBe('xyz');
    expect(loaded.generated).toBeTruthy();
  });

  it('creates the index directory if missing', () => {
    const nested = join(TEST_DIR, 'does-not-exist-yet');
    writeManifest(nested, { version: 1, generated: '', entries: {} });
    const loaded = loadManifest(nested);
    expect(loaded.version).toBe(1);
  });
});

describe('statMatches', () => {
  it('returns true when mtime and size both match', () => {
    writeFileSync(join(TEST_DIR, 'file.md'), 'content');
    const stat = statSync(join(TEST_DIR, 'file.md'));
    const entry = {
      checksum: 'abc',
      mtime: stat.mtime.toISOString(),
      size: stat.size,
    };
    expect(statMatches(stat, entry)).toBe(true);
  });

  it('returns false when size differs', () => {
    writeFileSync(join(TEST_DIR, 'file.md'), 'content');
    const stat = statSync(join(TEST_DIR, 'file.md'));
    expect(
      statMatches(stat, {
        checksum: 'abc',
        mtime: stat.mtime.toISOString(),
        size: stat.size + 1,
      })
    ).toBe(false);
  });

  it('returns false when mtime differs', () => {
    writeFileSync(join(TEST_DIR, 'file.md'), 'content');
    const stat = statSync(join(TEST_DIR, 'file.md'));
    expect(
      statMatches(stat, {
        checksum: 'abc',
        mtime: '1970-01-01T00:00:00.000Z',
        size: stat.size,
      })
    ).toBe(false);
  });

  it('returns false when entry is undefined', () => {
    writeFileSync(join(TEST_DIR, 'file.md'), 'content');
    const stat = statSync(join(TEST_DIR, 'file.md'));
    expect(statMatches(stat, undefined)).toBe(false);
  });
});

describe('makeEntry', () => {
  it('creates an entry from checksum + stat', () => {
    writeFileSync(join(TEST_DIR, 'f.md'), 'hi');
    const stat = statSync(join(TEST_DIR, 'f.md'));
    const entry = makeEntry('deadbeef', stat);

    expect(entry.checksum).toBe('deadbeef');
    expect(entry.size).toBe(stat.size);
    expect(entry.mtime).toBe(stat.mtime.toISOString());
  });
});

describe('pruneManifest', () => {
  it('removes entries for files that no longer exist on disk', () => {
    writeFileSync(join(TEST_DIR, 'keep.md'), 'keep');
    // no gone.md file written

    const manifest: ChecksumManifest = {
      version: 1,
      generated: '',
      entries: {
        'keep.md': { checksum: 'a', mtime: '2026-01-01T00:00:00Z', size: 4 },
        'gone.md': { checksum: 'b', mtime: '2026-01-01T00:00:00Z', size: 0 },
      },
    };

    const removed = pruneManifest(manifest, TEST_DIR);
    expect(removed).toBe(1);
    expect(manifest.entries['keep.md']).toBeDefined();
    expect(manifest.entries['gone.md']).toBeUndefined();
  });

  it('returns 0 when all entries exist', () => {
    writeFileSync(join(TEST_DIR, 'a.md'), '');
    writeFileSync(join(TEST_DIR, 'b.md'), '');

    const manifest: ChecksumManifest = {
      version: 1,
      generated: '',
      entries: {
        'a.md': { checksum: 'x', mtime: '2026-01-01T00:00:00Z', size: 0 },
        'b.md': { checksum: 'y', mtime: '2026-01-01T00:00:00Z', size: 0 },
      },
    };

    const removed = pruneManifest(manifest, TEST_DIR);
    expect(removed).toBe(0);
  });
});
