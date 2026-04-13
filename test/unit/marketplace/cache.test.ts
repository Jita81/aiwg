/**
 * Marketplace Cache Tests
 *
 * @source @src/marketplace/cache.ts
 * @issue #787
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getCacheRoot,
  getPackagePath,
  isCached,
  cachePackage,
  listCachedPackages,
  uncachePackage,
} from '../../../src/marketplace/cache.js';
import type { PackageBundle } from '../../../src/marketplace/types.js';

const TEST_CACHE = join(tmpdir(), `aiwg-marketplace-cache-test-${Date.now()}`);

beforeEach(() => {
  process.env.AIWG_CACHE_DIR = TEST_CACHE;
  mkdirSync(TEST_CACHE, { recursive: true });
});

afterEach(() => {
  delete process.env.AIWG_CACHE_DIR;
  rmSync(TEST_CACHE, { recursive: true, force: true });
});

describe('getCacheRoot', () => {
  it('respects AIWG_CACHE_DIR env var', () => {
    expect(getCacheRoot()).toBe(TEST_CACHE);
  });
});

describe('getPackagePath', () => {
  it('sanitizes slashes in package ID', () => {
    const p = getPackagePath('clawhub', 'aiwg/sdlc', '1.0.0');
    expect(p).toContain('clawhub');
    expect(p).toContain('aiwg__sdlc');
    expect(p).toContain('1.0.0');
    expect(p).not.toContain('aiwg/sdlc');
  });
});

describe('isCached / cachePackage', () => {
  it('returns false for uncached package', () => {
    expect(isCached('clawhub', 'aiwg/sdlc', '1.0.0')).toBe(false);
  });

  it('returns true after caching', () => {
    const bundle: PackageBundle = {
      metadata: {
        name: 'aiwg/sdlc',
        version: '1.0.0',
        namespace: 'aiwg',
        source: 'clawhub',
        description: 'Test',
        license: 'MIT',
      },
      artifacts: {},
      localPath: '/tmp/foo',
      rawManifest: { name: 'aiwg-sdlc', version: '1.0.0' },
    };

    cachePackage(bundle);
    expect(isCached('clawhub', 'aiwg/sdlc', '1.0.0')).toBe(true);
  });
});

describe('listCachedPackages', () => {
  it('returns empty array when cache is empty', () => {
    expect(listCachedPackages()).toEqual([]);
  });

  it('lists cached packages', () => {
    const bundle: PackageBundle = {
      metadata: {
        name: 'test-plugin',
        version: '2.0.0',
        namespace: 'acme',
        source: 'clawhub',
        description: 'Test plugin',
        license: 'MIT',
      },
      artifacts: {},
      localPath: '/tmp/foo',
      rawManifest: {},
    };

    cachePackage(bundle);

    const entries = listCachedPackages();
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('clawhub');
    expect(entries[0].packageId).toBe('test-plugin');
    expect(entries[0].version).toBe('2.0.0');
    expect(entries[0].metadata.description).toBe('Test plugin');
  });
});

describe('uncachePackage', () => {
  it('returns false for non-existent package', () => {
    expect(uncachePackage('clawhub', 'nonexistent', '1.0.0')).toBe(false);
  });

  it('removes a specific version', () => {
    const bundle: PackageBundle = {
      metadata: {
        name: 'plugin-a',
        version: '1.0.0',
        namespace: 'test',
        source: 'clawhub',
        description: 'Test',
        license: 'MIT',
      },
      artifacts: {},
      localPath: '/tmp/foo',
      rawManifest: {},
    };

    cachePackage(bundle);
    expect(isCached('clawhub', 'plugin-a', '1.0.0')).toBe(true);

    expect(uncachePackage('clawhub', 'plugin-a', '1.0.0')).toBe(true);
    expect(isCached('clawhub', 'plugin-a', '1.0.0')).toBe(false);
  });

  it('removes all versions when no version specified', () => {
    const bundle1: PackageBundle = {
      metadata: {
        name: 'plugin-b',
        version: '1.0.0',
        namespace: 'test',
        source: 'clawhub',
        description: 'Test',
        license: 'MIT',
      },
      artifacts: {},
      localPath: '/tmp/foo',
      rawManifest: {},
    };
    const bundle2 = { ...bundle1, metadata: { ...bundle1.metadata, version: '2.0.0' } };

    cachePackage(bundle1);
    cachePackage(bundle2);

    expect(uncachePackage('clawhub', 'plugin-b')).toBe(true);
    expect(isCached('clawhub', 'plugin-b', '1.0.0')).toBe(false);
    expect(isCached('clawhub', 'plugin-b', '2.0.0')).toBe(false);
  });
});
