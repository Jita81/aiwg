/**
 * Embedding Index Tests
 *
 * Tests for the semantic embedding index. Full pipeline tests (build/query)
 * require @xenova/transformers and hnswlib-node and will skip if not installed.
 * Change detection and manifest logic tests run without optional deps.
 *
 * @source @src/artifacts/embedding-index.ts
 * @implements #730
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMS,
  loadEmbeddingManifest,
  detectEmbeddingChanges,
  checkEmbeddingDeps,
} from '../../../src/artifacts/embedding-index.js';
import type { EmbeddingManifest, MetadataEntry } from '../../../src/artifacts/embedding-index.js';

// Helper to create a stub MetadataEntry
function makeEntry(overrides: Partial<MetadataEntry> = {}): MetadataEntry {
  return {
    path: 'test.md',
    type: 'document',
    phase: 'other',
    title: 'Test',
    tags: [],
    created: '2026-01-01',
    updated: '2026-01-01',
    checksum: 'abc123',
    summary: 'A test document',
    dependencies: [],
    dependents: [],
    ...overrides,
  };
}

describe('Embedding Index Constants', () => {
  it('exports default model and dimensions', () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe('Xenova/all-MiniLM-L6-v2');
    expect(DEFAULT_EMBEDDING_DIMS).toBe(384);
  });
});

describe('checkEmbeddingDeps', () => {
  it('returns availability status', async () => {
    const result = await checkEmbeddingDeps();
    expect(result).toHaveProperty('available');
    expect(result).toHaveProperty('missing');
    expect(Array.isArray(result.missing)).toBe(true);
  });
});

describe('loadEmbeddingManifest', () => {
  let tmpDir: string;

  it('returns null when no manifest exists', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwg-embed-test-'));
    const result = loadEmbeddingManifest(tmpDir);
    expect(result).toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid manifest', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwg-embed-test-'));
    const embDir = path.join(tmpDir, 'embeddings');
    fs.mkdirSync(embDir, { recursive: true });

    const manifest: EmbeddingManifest = {
      model: 'Xenova/all-MiniLM-L6-v2',
      dims: 384,
      nodeIds: ['A', 'B', 'C'],
      builtAt: '2026-01-01T00:00:00Z',
      checksums: { A: 'aaa', B: 'bbb', C: 'ccc' },
    };
    fs.writeFileSync(path.join(embDir, 'manifest.json'), JSON.stringify(manifest));

    const loaded = loadEmbeddingManifest(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.model).toBe('Xenova/all-MiniLM-L6-v2');
    expect(loaded!.dims).toBe(384);
    expect(loaded!.nodeIds).toEqual(['A', 'B', 'C']);
    expect(loaded!.checksums).toEqual({ A: 'aaa', B: 'bbb', C: 'ccc' });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for corrupt manifest', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwg-embed-test-'));
    const embDir = path.join(tmpDir, 'embeddings');
    fs.mkdirSync(embDir, { recursive: true });
    fs.writeFileSync(path.join(embDir, 'manifest.json'), 'not json');

    const result = loadEmbeddingManifest(tmpDir);
    expect(result).toBeNull();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('detectEmbeddingChanges', () => {
  const manifest: EmbeddingManifest = {
    model: 'Xenova/all-MiniLM-L6-v2',
    dims: 384,
    nodeIds: ['A', 'B', 'C'],
    builtAt: '2026-01-01T00:00:00Z',
    checksums: { A: 'aaa', B: 'bbb', C: 'ccc' },
  };

  it('detects no changes when checksums match', () => {
    const entries = {
      A: makeEntry({ path: 'A', checksum: 'aaa' }),
      B: makeEntry({ path: 'B', checksum: 'bbb' }),
      C: makeEntry({ path: 'C', checksum: 'ccc' }),
    };
    const result = detectEmbeddingChanges(entries, manifest);
    expect(result.changed).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('detects changed entries', () => {
    const entries = {
      A: makeEntry({ path: 'A', checksum: 'aaa-new' }),
      B: makeEntry({ path: 'B', checksum: 'bbb' }),
      C: makeEntry({ path: 'C', checksum: 'ccc' }),
    };
    const result = detectEmbeddingChanges(entries, manifest);
    expect(result.changed).toEqual(['A']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('detects added entries', () => {
    const entries = {
      A: makeEntry({ path: 'A', checksum: 'aaa' }),
      B: makeEntry({ path: 'B', checksum: 'bbb' }),
      C: makeEntry({ path: 'C', checksum: 'ccc' }),
      D: makeEntry({ path: 'D', checksum: 'ddd' }),
    };
    const result = detectEmbeddingChanges(entries, manifest);
    expect(result.added).toEqual(['D']);
  });

  it('detects removed entries', () => {
    const entries = {
      A: makeEntry({ path: 'A', checksum: 'aaa' }),
      B: makeEntry({ path: 'B', checksum: 'bbb' }),
    };
    const result = detectEmbeddingChanges(entries, manifest);
    expect(result.removed).toEqual(['C']);
  });

  it('detects all change types simultaneously', () => {
    const entries = {
      A: makeEntry({ path: 'A', checksum: 'aaa-new' }),
      B: makeEntry({ path: 'B', checksum: 'bbb' }),
      D: makeEntry({ path: 'D', checksum: 'ddd' }),
    };
    const result = detectEmbeddingChanges(entries, manifest);
    expect(result.changed).toEqual(['A']);
    expect(result.added).toEqual(['D']);
    expect(result.removed).toEqual(['C']);
  });
});
