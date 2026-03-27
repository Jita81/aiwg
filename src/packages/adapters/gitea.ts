/**
 * Gitea Adapter
 *
 * Resolves "owner/name[@version]" shorthands against the configured Gitea host.
 * Falls back to git.integrolabs.net (the default self-hosted instance).
 *
 * Resolution priority:
 *   1. AIWG_GITEA_HOST env var
 *   2. ~/.aiwg/config.yaml → defaults.giteaHost
 *   3. git.integrolabs.net (hardcoded fallback)
 *
 * Authentication:
 *   - SSH clone: uses default SSH agent (recommended for teams)
 *   - HTTPS clone: reads token from GITEA_TOKEN env or ~/.config/gitea/token
 *
 * @implements #557
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { GitAdapter } from './git.js';
import type { PackageRef, PackageSource, FetchOptions } from '../types.js';

/**
 * Regex for "owner/name" or "owner/name@version" (no scheme prefix)
 */
const GITEA_SHORTHAND = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(@[a-zA-Z0-9._/-]+)?$/;

/**
 * Read Gitea token from standard file path (same as global CLAUDE.md convention)
 */
async function readGiteaToken(): Promise<string | undefined> {
  if (process.env.GITEA_TOKEN) return process.env.GITEA_TOKEN;

  const tokenPaths = [
    join(homedir(), '.config', 'gitea', 'token'),
    join(homedir(), '.aiwg', 'credentials', 'gitea'),
  ];

  for (const p of tokenPaths) {
    if (existsSync(p)) {
      return (await readFile(p, 'utf-8')).trim();
    }
  }

  return undefined;
}

/**
 * Resolve the Gitea host
 */
function resolveGiteaHost(): string {
  if (process.env.AIWG_GITEA_HOST) return process.env.AIWG_GITEA_HOST;
  return 'git.integrolabs.net';
}

/**
 * GiteaAdapter
 *
 * Handles "owner/repo[@version]" shorthands for the configured Gitea host.
 */
export class GiteaAdapter extends GitAdapter {
  override readonly id: string = 'gitea';
  override readonly name: string = 'Gitea (shorthand)';

  /**
   * Matches "owner/repo" and "owner/repo@version" without a scheme prefix.
   * Does not match "github:owner/repo" (handled by GitHubAdapter).
   */
  override canResolve(ref: string): boolean {
    if (ref.includes(':')) return false; // has scheme prefix → not gitea shorthand
    return GITEA_SHORTHAND.test(ref);
  }

  override async resolve(ref: PackageRef): Promise<PackageSource | null> {
    if (!ref.owner || !ref.name) return null;

    const host = resolveGiteaHost();
    const token = await readGiteaToken();

    let gitUrl: string;
    if (token) {
      // HTTPS with token
      gitUrl = `https://${token}@${host}/${ref.owner}/${ref.name}.git`;
    } else {
      // SSH (relies on SSH agent)
      gitUrl = `git@${host}:${ref.owner}/${ref.name}.git`;
    }

    return {
      gitUrl,
      ref: ref.version,
      label: `${host}/${ref.owner}/${ref.name}${ref.version ? `@${ref.version}` : ''}`,
    };
  }

  override async fetch(source: PackageSource, options: FetchOptions = {}): Promise<string> {
    return super.fetch(source, options);
  }
}
