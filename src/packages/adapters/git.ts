/**
 * Git Adapter
 *
 * Base adapter for fetching packages from any Git URL.
 * Handles clone to cache, pull for refresh, and version tag checkout.
 *
 * Cache layout:
 *   ~/.cache/aiwg/packages/<owner>/<name>@<version>/
 *
 * @implements #557
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { PackageRef, PackageSource, PackageRegistryAdapter, FetchOptions, PackageInfo } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Default cache root
 */
function getCacheRoot(): string {
  const xdgCache = process.env.XDG_CACHE_HOME;
  const base = xdgCache ? xdgCache : join(homedir(), '.cache');
  return join(base, 'aiwg', 'packages');
}

/**
 * Build cache path for a package at a specific version
 */
export function buildCachePath(owner: string, name: string, version: string): string {
  const safe = version.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(getCacheRoot(), owner, `${name}@${safe}`);
}

/**
 * Run a git command, returning stdout
 */
async function git(args: string[], cwd?: string): Promise<string> {
  const env: Record<string, string> = { ...process.env as Record<string, string> };

  // Suppress interactive prompts
  env.GIT_TERMINAL_PROMPT = '0';

  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env,
    timeout: 120_000,
  });
  return stdout.trim();
}

/**
 * Detect the manifest type from a cloned package directory
 */
async function detectManifestType(
  cachePath: string
): Promise<'framework' | 'addon' | 'extension' | 'unknown'> {
  const manifestPath = join(cachePath, 'manifest.json');
  try {
    const content = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as { type?: string };
    const t = manifest.type?.toLowerCase() ?? '';
    if (t === 'framework') return 'framework';
    if (t === 'addon') return 'addon';
    if (t === 'extension') return 'extension';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Resolve the latest tag from a remote git repo
 */
async function resolveLatestTag(gitUrl: string): Promise<string> {
  try {
    const output = await git(['ls-remote', '--tags', '--sort=-v:refname', gitUrl]);
    const firstLine = output.split('\n')[0] ?? '';
    const match = firstLine.match(/refs\/tags\/(.+)/);
    if (match && match[1]) return match[1].replace(/\^{}$/, '');
  } catch {
    // fall through
  }
  return 'latest';
}

/**
 * GitAdapter
 *
 * Handles any https:// or git@... URL directly.
 * Also serves as the base class for Gitea/GitHub shorthand adapters.
 */
export class GitAdapter implements PackageRegistryAdapter {
  readonly id: string = 'git';
  readonly name: string = 'Git (direct URL)';

  /**
   * Returns true for https:// or git@/ssh:// URLs, or git+https:// URLs
   */
  canResolve(ref: string): boolean {
    return (
      ref.startsWith('https://') ||
      ref.startsWith('http://') ||
      ref.startsWith('git@') ||
      ref.startsWith('ssh://') ||
      ref.startsWith('git+https://')
    );
  }

  async resolve(ref: PackageRef): Promise<PackageSource | null> {
    if (!ref.rawUrl) return null;
    return {
      gitUrl: ref.rawUrl,
      ref: ref.version,
      label: ref.rawUrl,
    };
  }

  async fetch(source: PackageSource, options: FetchOptions = {}): Promise<string> {
    // Determine version
    let version = source.ref;
    if (!version) {
      version = await resolveLatestTag(source.gitUrl);
    }

    // Build cache key from URL
    const urlKey = source.gitUrl
      .replace(/^https?:\/\//, '')
      .replace(/^git@/, '')
      .replace(/\.git$/, '')
      .replace(/[:/]/g, '_');
    const parts = urlKey.split('_');
    const name = parts[parts.length - 1] ?? 'package';
    const owner = parts[parts.length - 2] ?? 'unknown';

    const cachePath = buildCachePath(owner, name, version);

    if (!options.refresh && existsSync(cachePath)) {
      return cachePath;
    }

    await mkdir(cachePath, { recursive: true });

    if (existsSync(join(cachePath, '.git'))) {
      // Update existing clone
      await git(['fetch', '--tags', '--prune'], cachePath);
    } else {
      // Fresh clone (no --depth to get tags)
      await git(['clone', source.gitUrl, cachePath]);
    }

    // Checkout requested ref
    if (version && version !== 'latest') {
      await git(['checkout', version], cachePath);
    }

    return cachePath;
  }

  /** GitAdapter does not list packages */
  async list(): Promise<PackageInfo[]> {
    return [];
  }
}

export { detectManifestType };
