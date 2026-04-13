/**
 * Source Identifier Parser
 *
 * Parses marketplace source identifiers of the form `<source>:<package>[@<version>]`.
 *
 * @implements #787
 */

import type { MarketplaceSourceId, ParsedIdentifier } from './types.js';

const VALID_SOURCES: readonly MarketplaceSourceId[] = [
  'clawhub',
  'cursor',
  'codex',
  'claude',
  'git',
];

/**
 * Parse a marketplace source identifier.
 *
 * Examples:
 *   "clawhub:aiwg/sdlc"              → { source: 'clawhub', packageId: 'aiwg/sdlc' }
 *   "cursor:publisher.package"       → { source: 'cursor', packageId: 'publisher.package' }
 *   "codex:some-plugin@1.2.0"        → { source: 'codex', packageId: 'some-plugin', version: '1.2.0' }
 *   "claude:user/repo#plugin"        → { source: 'claude', packageId: 'user/repo#plugin' }
 *   "git:https://github.com/foo/bar" → { source: 'git', packageId: 'https://github.com/foo/bar' }
 *
 * @throws Error if the identifier is malformed or the source is unknown
 */
export function parseIdentifier(identifier: string): ParsedIdentifier {
  // Split on first colon; the rest is the package id (may contain colons for git URLs)
  const colonIdx = identifier.indexOf(':');
  if (colonIdx === -1) {
    throw new Error(
      `Invalid marketplace identifier '${identifier}'. Expected format: <source>:<package>[@<version>]`
    );
  }

  const source = identifier.slice(0, colonIdx).trim().toLowerCase();
  let packageId = identifier.slice(colonIdx + 1).trim();

  if (!VALID_SOURCES.includes(source as MarketplaceSourceId)) {
    throw new Error(
      `Unknown marketplace source '${source}'. Valid sources: ${VALID_SOURCES.join(', ')}`
    );
  }

  // Extract optional @version suffix (but not for git URLs which can contain @)
  let version: string | undefined;
  if (source !== 'git') {
    const atIdx = packageId.lastIndexOf('@');
    if (atIdx > 0) {
      version = packageId.slice(atIdx + 1).trim();
      packageId = packageId.slice(0, atIdx).trim();
    }
  }

  if (!packageId) {
    throw new Error(`Empty package id in identifier '${identifier}'`);
  }

  return {
    source: source as MarketplaceSourceId,
    packageId,
    version,
  };
}

/**
 * Format a parsed identifier back to string form
 */
export function formatIdentifier(parsed: ParsedIdentifier): string {
  const base = `${parsed.source}:${parsed.packageId}`;
  return parsed.version ? `${base}@${parsed.version}` : base;
}
