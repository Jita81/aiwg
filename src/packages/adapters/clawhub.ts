/**
 * ClawHub Package Adapter
 *
 * Implements PackageRegistryAdapter for the `clawhub:` and `openclaw:` URI
 * schemes, routing `aiwg install clawhub:<owner>/<name>` through the
 * ClawHub REST API at clawhub.ai.
 *
 * The adapter fetches the package manifest and skill content via the API,
 * writes the result into the standard AIWG cache layout, and returns the
 * local cache path — matching the contract of all other adapters.
 *
 * Cache layout (shared with GitAdapter):
 *   ~/.cache/aiwg/packages/<owner>/<name>@<version>/
 *
 * @implements #803
 * @see https://clawhub.ai
 * @see https://docs.openclaw.ai/tools/clawhub
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type {
  PackageRef,
  PackageSource,
  PackageRegistryAdapter,
  FetchOptions,
  PackageInfo,
} from '../types.js';
import { buildCachePath } from './git.js';

const CLAWHUB_API_BASE = 'https://clawhub.ai/api/v1';

/**
 * Attempt a ClawHub API request, returning parsed JSON or null on failure.
 */
async function clawHubFetch(endpoint: string): Promise<any | null> {
  try {
    const response = await fetch(`${CLAWHUB_API_BASE}${endpoint}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * ClawHubPackageAdapter
 *
 * Handles "clawhub:owner/name[@version]" and "openclaw:owner/name[@version]"
 * references in the install pipeline.
 */
export class ClawHubPackageAdapter implements PackageRegistryAdapter {
  readonly id = 'clawhub';
  readonly name = 'ClawHub Registry';

  /**
   * Matches the `clawhub:` and `openclaw:` URI schemes.
   */
  canResolve(ref: string): boolean {
    return ref.startsWith('clawhub:') || ref.startsWith('openclaw:');
  }

  /**
   * Resolve a parsed PackageRef to a PackageSource.
   *
   * The `gitUrl` field is a canonical API URL (not a git remote) so the
   * caller can store it in packages.yaml for display and re-install.
   */
  async resolve(ref: PackageRef): Promise<PackageSource | null> {
    if (!ref.owner || !ref.name) return null;

    const apiUrl = `${CLAWHUB_API_BASE}/skills/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;

    return {
      gitUrl: apiUrl,
      ref: ref.version,
      label: `clawhub.ai/${ref.owner}/${ref.name}${ref.version ? `@${ref.version}` : ''}`,
    };
  }

  /**
   * Fetch the package from ClawHub and write it to the local cache.
   *
   * Skips the network request if the cache directory already exists and
   * `options.refresh` is not set.
   */
  async fetch(source: PackageSource, options: FetchOptions = {}): Promise<string> {
    // Extract owner/name from the API URL stored in source.gitUrl
    const urlMatch = source.gitUrl.match(/\/skills\/([^/]+)\/([^/]+)$/);
    const owner = urlMatch ? decodeURIComponent(urlMatch[1]!) : 'clawhub';
    const name = urlMatch ? decodeURIComponent(urlMatch[2]!) : 'package';
    const version = source.ref ?? 'latest';

    const cachePath = buildCachePath(owner, name, version);

    // Return cached version unless refresh is requested
    if (!options.refresh && existsSync(cachePath)) {
      return cachePath;
    }

    // Fetch package content from ClawHub API
    const downloadEndpoint = `/skills/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/download`;
    const apiResult = await clawHubFetch(downloadEndpoint);

    if (!apiResult || !apiResult.content) {
      throw new Error(
        `Could not fetch '${owner}/${name}' from ClawHub. ` +
        `Ensure the package exists at https://clawhub.ai and the API is reachable. ` +
        `(URL: ${CLAWHUB_API_BASE}${downloadEndpoint})`
      );
    }

    // Write content to cache
    await mkdir(cachePath, { recursive: true });
    const skillMdPath = join(cachePath, 'SKILL.md');
    await writeFile(skillMdPath, apiResult.content as string, 'utf-8');

    // Write a minimal manifest so detectManifestType can classify it
    if (apiResult.manifest) {
      const manifestPath = join(cachePath, 'manifest.json');
      await writeFile(
        manifestPath,
        JSON.stringify(apiResult.manifest, null, 2) + '\n',
        'utf-8'
      );
    }

    return cachePath;
  }

  /** ClawHubPackageAdapter does not enumerate packages */
  async list(): Promise<PackageInfo[]> {
    return [];
  }
}
