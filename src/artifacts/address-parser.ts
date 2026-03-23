/**
 * Address Parser — parse hybrid addressing syntax into queries
 *
 * Syntaxes:
 *   @.aiwg/requirements/UC-001.md     → location
 *   @?"user authentication"            → semantic
 *   @.aiwg/requirements/?"auth"        → hybrid
 *   @#security,authentication           → tags
 *   @phase:requirements                 → phase
 *
 * @module artifacts/address-parser
 * @issue #187
 */

// ============================================================================
// Types
// ============================================================================

export interface HybridQuery {
  path?: string;
  semanticQuery?: string;
  tags?: string[];
  phase?: string;
  type?: string;
  updatedAfter?: string;
  limit?: number;
}

export type AddressType = 'location' | 'semantic' | 'hybrid' | 'tags' | 'phase';

export interface ParsedAddress {
  type: AddressType;
  query: HybridQuery;
  raw: string;
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse an address string into a HybridQuery.
 */
export function parseAddress(input: string): ParsedAddress {
  const raw = input.trim();

  // Remove leading @ if present
  const addr = raw.startsWith('@') ? raw.slice(1) : raw;

  // @#tag1,tag2 → tags
  if (addr.startsWith('#')) {
    const tags = addr.slice(1).split(',').map((t) => t.trim()).filter(Boolean);
    return { type: 'tags', query: { tags }, raw };
  }

  // @phase:requirements → phase
  if (addr.startsWith('phase:')) {
    const phase = addr.slice(6).trim();
    return { type: 'phase', query: { phase }, raw };
  }

  // @?"query" → semantic
  if (addr.startsWith('?"') || addr.startsWith('?\'')) {
    const semanticQuery = addr.slice(2, -1);
    return { type: 'semantic', query: { semanticQuery }, raw };
  }

  // @path/?"query" → hybrid
  const hybridMatch = addr.match(/^(.+?)\/\?"([^"]+)"$/);
  if (hybridMatch) {
    return {
      type: 'hybrid',
      query: { path: hybridMatch[1], semanticQuery: hybridMatch[2] },
      raw,
    };
  }

  const hybridMatchSingle = addr.match(/^(.+?)\/\?'([^']+)'$/);
  if (hybridMatchSingle) {
    return {
      type: 'hybrid',
      query: { path: hybridMatchSingle[1], semanticQuery: hybridMatchSingle[2] },
      raw,
    };
  }

  // Default: location (file path or glob)
  return { type: 'location', query: { path: addr }, raw };
}

/**
 * Build a HybridQuery from multiple criteria (CLI-style).
 */
export function buildQuery(options: {
  path?: string;
  query?: string;
  tags?: string;
  phase?: string;
  type?: string;
  since?: string;
  limit?: number;
}): HybridQuery {
  return {
    path: options.path,
    semanticQuery: options.query,
    tags: options.tags?.split(',').map((t) => t.trim()).filter(Boolean),
    phase: options.phase,
    type: options.type,
    updatedAfter: options.since,
    limit: options.limit,
  };
}
