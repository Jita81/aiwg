/**
 * ClawHub Source Adapter
 *
 * Fetches plugins from the ClawHub registry. ClawHub is OpenClaw's central
 * package registry.
 *
 * Status: scaffold. Full implementation requires ClawHub API spec or CLI
 * integration.
 *
 * @implements #787
 */

import type {
  MarketplaceSource,
  PackageBundle,
  PackageSummary,
  SearchOptions,
  ValidationResult,
} from '../types.js';

export class ClawHubSource implements MarketplaceSource {
  readonly source = 'clawhub' as const;

  async fetch(packageId: string, _version?: string): Promise<PackageBundle> {
    // TODO: invoke ClawHub CLI or HTTP API to fetch the package tarball,
    // extract to a temp directory, parse clawhub.json, and return a
    // normalized PackageBundle. For now, throw with a clear message.
    throw new Error(
      `ClawHub source adapter is a scaffold. Full implementation pending. ` +
      `Tried to fetch: clawhub:${packageId}`
    );
  }

  async search(_query: string, _options?: SearchOptions): Promise<PackageSummary[]> {
    throw new Error('ClawHub search not yet implemented');
  }

  validate(manifest: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof manifest !== 'object' || manifest === null) {
      return { valid: false, errors: ['Manifest is not an object'], warnings };
    }

    const m = manifest as Record<string, unknown>;

    // Required fields per ClawHub spec
    if (typeof m.name !== 'string') errors.push('Missing required field: name');
    if (typeof m.version !== 'string') errors.push('Missing required field: version');
    if (typeof m.description !== 'string') errors.push('Missing required field: description');

    // Namespace collision check
    if (typeof m.name === 'string' && m.name.startsWith('aiwg-') && m.author !== 'AIWG Contributors') {
      warnings.push(
        `Package name '${m.name}' uses the aiwg- prefix but is not authored by AIWG. ` +
        `This may cause namespace collisions.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getVersions(_packageId: string): Promise<string[]> {
    throw new Error('ClawHub getVersions not yet implemented');
  }
}
