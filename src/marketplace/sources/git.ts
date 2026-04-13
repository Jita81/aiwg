/**
 * Git (generic) Source Adapter
 *
 * Fetches plugins from any Git URL. Detects the manifest format automatically
 * (looks for .claude-plugin/, .codex-plugin/, .cursor-plugin/, .factory-plugin/,
 * clawhub.json in that order).
 *
 * Status: scaffold. Full implementation requires git-clone integration.
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

export class GitSource implements MarketplaceSource {
  readonly source = 'git' as const;

  async fetch(packageId: string, _version?: string): Promise<PackageBundle> {
    // TODO: git clone into a temp dir, detect manifest format, normalize
    throw new Error(
      `Git source adapter is a scaffold. Full implementation pending. ` +
      `Tried to fetch: git:${packageId}`
    );
  }

  async search(_query: string, _options?: SearchOptions): Promise<PackageSummary[]> {
    // Git doesn't have a searchable registry — this is a no-op
    return [];
  }

  validate(manifest: unknown): ValidationResult {
    // Generic git manifest validation — accepts any of the known formats
    if (typeof manifest !== 'object' || manifest === null) {
      return { valid: false, errors: ['Manifest is not an object'], warnings: [] };
    }
    const m = manifest as Record<string, unknown>;
    const errors: string[] = [];

    if (typeof m.name !== 'string') errors.push('Missing required field: name');
    if (typeof m.version !== 'string') errors.push('Missing required field: version');

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  async getVersions(_packageId: string): Promise<string[]> {
    // Git "versions" would be tags or SHA references — requires git ls-remote
    throw new Error('Git getVersions not yet implemented');
  }
}
