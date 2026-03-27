/**
 * GitHub Adapter
 *
 * Resolves "github:owner/name[@version]" shorthands against github.com.
 *
 * Authentication:
 *   - SSH clone: uses default SSH agent
 *   - HTTPS clone: reads token from GITHUB_TOKEN env or ~/.aiwg/credentials/github
 *
 * @implements #557
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { GitAdapter } from './git.js';
import type { PackageRef, PackageSource, FetchOptions } from '../types.js';

const GITHUB_HOST = 'github.com';

/**
 * Read GitHub token from standard locations
 */
async function readGitHubToken(): Promise<string | undefined> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  const tokenPaths = [
    join(homedir(), '.aiwg', 'credentials', 'github'),
  ];

  for (const p of tokenPaths) {
    if (existsSync(p)) {
      return (await readFile(p, 'utf-8')).trim();
    }
  }

  return undefined;
}

/**
 * GitHubAdapter
 *
 * Handles "github:owner/repo[@version]" shorthands.
 */
export class GitHubAdapter extends GitAdapter {
  override readonly id: string = 'github';
  override readonly name: string = 'GitHub (shorthand)';

  /**
   * Matches "github:owner/repo" and "github:owner/repo@version"
   */
  override canResolve(ref: string): boolean {
    return ref.startsWith('github:');
  }

  override async resolve(ref: PackageRef): Promise<PackageSource | null> {
    if (!ref.owner || !ref.name) return null;

    const token = await readGitHubToken();

    let gitUrl: string;
    if (token) {
      gitUrl = `https://${token}@${GITHUB_HOST}/${ref.owner}/${ref.name}.git`;
    } else {
      gitUrl = `git@${GITHUB_HOST}:${ref.owner}/${ref.name}.git`;
    }

    return {
      gitUrl,
      ref: ref.version,
      label: `github.com/${ref.owner}/${ref.name}${ref.version ? `@${ref.version}` : ''}`,
    };
  }

  override async fetch(source: PackageSource, options: FetchOptions = {}): Promise<string> {
    return super.fetch(source, options);
  }
}
