/**
 * Package Registry Coordinator
 *
 * Orchestrates resolution and fetching across all PackageRegistryAdapters.
 * Priority order: local-cache lookup → gitea shorthand → github shorthand → git URL
 *
 * @implements #557
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  PackageRef,
  PackageSource,
  PackageRegistryAdapter,
  FetchOptions,
  PackageInfo,
} from './types.js';
import { GitAdapter, detectManifestType } from './adapters/git.js';
import { GiteaAdapter } from './adapters/gitea.js';
import { GitHubAdapter } from './adapters/github.js';
import { ClawHubPackageAdapter } from './adapters/clawhub.js';
import { LocalCacheAdapter } from './adapters/local-cache.js';
import {
  setPackageEntry,
  listPackages as listFromRegistry,
  removePackageEntry,
} from './package-registry.js';

/**
 * All adapters in resolution priority order
 * (Scheme-prefixed adapters first so explicit prefixes are matched before
 *  Gitea/GitHub shorthands and the generic Git fallback)
 */
const ALL_ADAPTERS: PackageRegistryAdapter[] = [
  new ClawHubPackageAdapter(),
  new GiteaAdapter(),
  new GitHubAdapter(),
  new GitAdapter(),
];

const CACHE_ADAPTER = new LocalCacheAdapter();

/**
 * Parse a raw reference string into a PackageRef
 *
 * Supported formats:
 *   owner/name                 → gitea shorthand
 *   owner/name@v1.2.0          → gitea shorthand with version
 *   github:owner/name          → github shorthand
 *   github:owner/name@v1.2.0   → github shorthand with version
 *   https://...                → direct git URL
 *   git@host:owner/name.git    → direct SSH URL
 */
export function parseRef(raw: string): PackageRef {
  const ref: PackageRef = { raw, scheme: 'unknown' };

  // Scheme-prefixed: "github:owner/name[@version]"
  if (raw.startsWith('github:')) {
    const body = raw.slice('github:'.length);
    const [repoAndOwner, version] = body.split('@');
    const parts = (repoAndOwner ?? '').split('/');
    ref.scheme = 'github';
    ref.owner = parts[0];
    ref.name = parts.slice(1).join('/') || undefined;
    ref.version = version;
    return ref;
  }

  // Scheme-prefixed: "clawhub:owner/name[@version]" and "openclaw:owner/name[@version]"
  if (raw.startsWith('clawhub:') || raw.startsWith('openclaw:')) {
    const prefix = raw.startsWith('clawhub:') ? 'clawhub:' : 'openclaw:';
    const body = raw.slice(prefix.length);
    const [repoAndOwner, version] = body.split('@');
    const parts = (repoAndOwner ?? '').split('/');
    ref.scheme = 'clawhub';
    ref.owner = parts[0];
    ref.name = parts.slice(1).join('/') || undefined;
    ref.version = version;
    return ref;
  }

  // Direct URL
  if (raw.startsWith('https://') || raw.startsWith('http://') || raw.startsWith('git@') || raw.startsWith('ssh://')) {
    ref.scheme = raw.startsWith('git@') ? 'ssh' : 'https';
    // Strip optional @version suffix from URL (non-standard but convenient)
    const atIdx = raw.lastIndexOf('@');
    if (atIdx > raw.indexOf('://') + 3 || raw.startsWith('git@')) {
      // Only treat trailing @version if it looks like a version tag
      const tail = raw.slice(atIdx + 1);
      if (/^[vV]?\d|^main$|^master$|^HEAD/.test(tail) && atIdx > 20) {
        ref.rawUrl = raw.slice(0, atIdx);
        ref.version = tail;
        return ref;
      }
    }
    ref.rawUrl = raw;
    return ref;
  }

  // Gitea shorthand: "owner/name[@version]"
  const atIdx = raw.indexOf('@');
  const body = atIdx >= 0 ? raw.slice(0, atIdx) : raw;
  const parts = body.split('/');
  ref.scheme = 'gitea';
  ref.owner = parts[0];
  ref.name = parts.slice(1).join('/') || undefined;
  ref.version = atIdx >= 0 ? raw.slice(atIdx + 1) : undefined;

  return ref;
}

/**
 * Resolve a ref to a PackageSource using the appropriate adapter
 */
export async function resolveRef(ref: PackageRef): Promise<{ source: PackageSource; adapter: PackageRegistryAdapter } | null> {
  for (const adapter of ALL_ADAPTERS) {
    if (!adapter.canResolve(ref.raw)) continue;
    const source = await adapter.resolve(ref);
    if (source) return { source, adapter };
  }
  return null;
}

/**
 * Read the namespace for a cached package.
 *
 * Resolution order:
 * 1. `namespace` field in `manifest.json` (explicit — highest priority)
 * 2. Owner segment parsed from `registryKey` (e.g. `roko/ring-methodology` → `roko`)
 *    Also handles scheme-prefixed keys: `clawhub:author/name` → `author`,
 *    `github:thirdparty/repo` → `thirdparty`.
 * 3. `"third-party"` — safe fallback when the key cannot be parsed.
 *
 * AIWG-owned packages (owner = `aiwg`) return `"aiwg"` which is the default
 * namespace used by the AIWG deploy pipeline.
 *
 * @param cachePath   - Absolute path to the cloned/cached package directory
 * @param registryKey - The key stored in packages.yaml, e.g. `"owner/name"` or
 *                      `"github:owner/name"` or `"clawhub:owner/name"`
 */
export async function readPackageNamespace(
  cachePath: string,
  registryKey: string
): Promise<string> {
  // 1. Prefer explicit manifest.json namespace field
  try {
    const manifestContent = await readFile(join(cachePath, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestContent) as { namespace?: string };
    if (typeof manifest.namespace === 'string' && manifest.namespace.trim()) {
      return manifest.namespace.trim();
    }
  } catch {
    // manifest missing or unreadable — fall through to key-based derivation
  }

  // 2. Derive from registry key owner segment
  // Strip leading scheme prefix: "github:", "clawhub:", "openclaw:"
  const schemeMatch = registryKey.match(/^(?:github|clawhub|openclaw):(.+)$/);
  const keyBody = schemeMatch ? schemeMatch[1]! : registryKey;

  // Handle direct URLs — cannot derive meaningful owner
  if (
    keyBody.startsWith('https://') ||
    keyBody.startsWith('http://') ||
    keyBody.startsWith('git@') ||
    keyBody.startsWith('ssh://')
  ) {
    return 'third-party';
  }

  // owner/name format
  const slashIdx = keyBody.indexOf('/');
  if (slashIdx > 0) {
    const owner = keyBody.slice(0, slashIdx).trim();
    if (owner) return owner;
  }

  // 3. Fallback
  return 'third-party';
}

/**
 * Install a package from a ref string
 *
 * 1. Parse ref
 * 2. Resolve to PackageSource via adapters
 * 3. Fetch (clone/pull) to local cache
 * 4. Register in ~/.aiwg/packages.yaml
 *
 * Returns the cache path and resolved namespace.
 */
export async function installPackage(
  rawRef: string,
  options: FetchOptions & { configDir?: string } = {}
): Promise<{ cachePath: string; key: string; type: string; namespace: string }> {
  const ref = parseRef(rawRef);

  const resolved = await resolveRef(ref);
  if (!resolved) {
    throw new Error(
      `Cannot resolve package reference: '${rawRef}'\n` +
      `Supported formats:\n` +
      `  owner/name              (Gitea shorthand)\n` +
      `  github:owner/name       (GitHub shorthand)\n` +
      `  clawhub:owner/name      (ClawHub / OpenClaw registry)\n` +
      `  openclaw:owner/name     (ClawHub / OpenClaw registry alias)\n` +
      `  https://...             (direct Git URL)\n` +
      `  git@host:owner/name.git (SSH URL)`
    );
  }

  const { source, adapter } = resolved;
  const cachePath = await adapter.fetch(source, { refresh: options.refresh });

  // Detect type from manifest.json
  const type = await detectManifestType(cachePath);

  // Build registry key
  const key = ref.owner && ref.name
    ? `${ref.owner}/${ref.name}`
    : source.label.replace(/https?:\/\/[^/]+\//, '').replace(/\.git$/, '');

  const version = ref.version ?? source.ref ?? 'latest';

  // Resolve namespace for artifact deployment isolation (#804)
  const namespace = await readPackageNamespace(cachePath, rawRef);

  // Register in packages.yaml
  await setPackageEntry(key, {
    version,
    source: source.gitUrl,
    type,
    cachePath,
    installedAt: new Date().toISOString(),
    deployedTo: [],
  }, options.configDir);

  return { cachePath, key, type, namespace };
}

/**
 * Refresh all registered remote packages (used by `aiwg sync`)
 */
export async function refreshAllPackages(options: { configDir?: string } = {}): Promise<string[]> {
  const packages = await listFromRegistry(options.configDir);
  const refreshed: string[] = [];

  for (const pkg of packages) {
    try {
      await installPackage(
        pkg.source.startsWith('git@') || pkg.source.startsWith('https://')
          ? pkg.source
          : pkg.source,
        { refresh: true, configDir: options.configDir }
      );
      refreshed.push(pkg.key);
    } catch {
      // Non-fatal — continue with other packages
    }
  }

  return refreshed;
}

/**
 * List all installed packages
 */
export async function listInstalledPackages(configDir?: string): Promise<PackageInfo[]> {
  return listFromRegistry(configDir);
}

/**
 * Remove a package from the registry (does not delete cache)
 */
export async function uninstallPackage(key: string, configDir?: string): Promise<boolean> {
  return removePackageEntry(key, configDir);
}

/**
 * Look up the cache path for an installed package by name
 * (used by `aiwg use` to resolve local packages before bundled npm)
 */
export async function resolveInstalledPackage(name: string): Promise<string | undefined> {
  return CACHE_ADAPTER.resolveCachePath(name);
}
