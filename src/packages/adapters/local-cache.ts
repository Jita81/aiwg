/**
 * Local Cache Adapter
 *
 * Lists and resolves packages already present in the local package cache
 * (~/.cache/aiwg/packages/) and registered in ~/.aiwg/packages.yaml.
 *
 * Used by `aiwg use <name>` to check installed packages before falling back
 * to the bundled npm package.
 *
 * @implements #557
 */

import { existsSync } from 'fs';
import type { PackageRef, PackageSource, PackageRegistryAdapter, FetchOptions, PackageInfo } from '../types.js';
import { listPackages } from '../package-registry.js';

/**
 * LocalCacheAdapter
 *
 * Does not fetch — only resolves already-cached packages.
 */
export class LocalCacheAdapter implements PackageRegistryAdapter {
  readonly id = 'local-cache';
  readonly name = 'Local Package Cache';

  /**
   * Can resolve any ref that matches a key in the local registry.
   * This is checked by the registry coordinator after parsing the ref,
   * so canResolve is always false (resolution happens via list()).
   */
  canResolve(_ref: string): boolean {
    return false; // Only used via explicit lookup, not auto-resolution
  }

  async resolve(_ref: PackageRef): Promise<PackageSource | null> {
    return null;
  }

  /**
   * No-op — local cache adapter never fetches
   */
  async fetch(_source: PackageSource, _options?: FetchOptions): Promise<string> {
    throw new Error('LocalCacheAdapter does not support fetch — use GitAdapter instead');
  }

  /**
   * List all packages in the local registry
   */
  async list(): Promise<PackageInfo[]> {
    return listPackages();
  }

  /**
   * Look up a package by name (partial match on key or name component)
   * Returns the PackageInfo if found and the cache path still exists.
   */
  async lookupByName(name: string): Promise<PackageInfo | undefined> {
    const packages = await listPackages();

    // Exact key match first ("owner/name")
    const exactKey = packages.find((p) => p.key === name);
    if (exactKey) return exactKey;

    // Match by name component only
    const byName = packages.find((p) => p.name === name);
    if (byName) return byName;

    return undefined;
  }

  /**
   * Look up cache path for a package by name.
   * Returns the cache path if installed and present on disk.
   */
  async resolveCachePath(name: string): Promise<string | undefined> {
    const { getPackageEntry } = await import('../package-registry.js');
    const packages = await listPackages();

    let key: string | undefined;

    // Exact key match
    if (packages.some((p) => p.key === name)) {
      key = name;
    } else {
      // Match by name component
      const byName = packages.find((p) => p.name === name);
      if (byName) key = byName.key;
    }

    if (!key) return undefined;

    const entry = await getPackageEntry(key);
    if (!entry) return undefined;
    if (!existsSync(entry.cachePath)) return undefined;

    return entry.cachePath;
  }
}
