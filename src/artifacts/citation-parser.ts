/**
 * Citation Sidecar Edge Extraction
 *
 * Parses markdown citation sidecar files into typed graph edges.
 * Each sidecar has YAML frontmatter with `ref: REF-XXX` and two markdown tables:
 *
 * - **Outgoing**: papers this work cites (column: "Inducted REF") → `cites` edges
 * - **Incoming**: corpus papers that cite this work (column: "REF") → `cited-by` edges
 *
 * @implements #722
 * @source @src/artifacts/types.ts
 * @tests @test/unit/artifacts/citation-parser.test.ts
 */

import type { TypedEdge } from './types.js';
import { parseFrontmatter } from './index-builder.js';

/**
 * Result of parsing a single citation sidecar file
 */
export interface CitationParseResult {
  /** Source node identifier (e.g., "REF-008") */
  ref: string;

  /** Outgoing "cites" edges — REF IDs this paper references */
  cites: string[];

  /** Incoming "cited-by" edges — REF IDs of papers that cite this one */
  citedBy: string[];
}

/**
 * Extract REF-XXX identifiers from a markdown table column.
 *
 * Scans table rows for a column matching `columnName` (case-insensitive)
 * and extracts REF-XXX values, skipping empty/dash values.
 *
 * @param tableText - Markdown table text (header + separator + rows)
 * @param columnName - Column header to extract from (e.g., "Inducted REF")
 * @returns Array of REF-XXX identifiers found
 */
export function extractRefsFromTable(tableText: string, columnName: string): string[] {
  const lines = tableText.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return []; // Need header + separator + at least one row

  // Parse header to find column index
  const headerCells = lines[0].split('|').map(c => c.trim()).filter(Boolean);
  const colIndex = headerCells.findIndex(
    h => h.toLowerCase() === columnName.toLowerCase()
  );
  if (colIndex === -1) return [];

  // Skip header (line 0) and separator (line 1), parse data rows
  const refs: string[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map(c => c.trim()).filter(Boolean);
    if (colIndex >= cells.length) continue;

    const value = cells[colIndex].trim();
    // Skip empty, dash, or em-dash values
    if (!value || value === '—' || value === '-' || value === '–') continue;

    // Extract REF-XXX pattern(s) from the cell
    const refMatches = value.match(/REF-\d+/g);
    if (refMatches) {
      refs.push(...refMatches);
    }
  }

  return refs;
}

/**
 * Parse a citation sidecar markdown file into structured edges.
 *
 * @param content - Full markdown content of the sidecar file
 * @returns Parse result with ref ID and edge arrays, or null if not a valid sidecar
 */
export function parseCitationSidecar(content: string): CitationParseResult | null {
  const { data, body } = parseFrontmatter(content);

  // Must have a ref identifier in frontmatter
  const ref = typeof data.ref === 'string' ? data.ref : null;
  if (!ref || !ref.match(/^REF-\d+$/)) return null;

  // Split body into sections by ## headings
  const sections = body.split(/^## /m).filter(Boolean);

  let cites: string[] = [];
  let citedBy: string[] = [];

  for (const section of sections) {
    const sectionLower = section.toLowerCase();

    if (sectionLower.startsWith('outgoing')) {
      // Outgoing table: extract from "Inducted REF" column
      cites = extractRefsFromTable(section, 'Inducted REF');
    } else if (sectionLower.startsWith('incoming')) {
      // Incoming table: extract from "REF" column
      // The incoming section may have subsections (### Corpus Cross-References)
      // Look for tables anywhere in this section
      citedBy = extractRefsFromTable(section, 'REF');
    }
  }

  return { ref, cites, citedBy };
}

/**
 * Convert a CitationParseResult into TypedEdge arrays for the dependency graph.
 *
 * @param result - Parsed citation sidecar
 * @param refToPath - Map from REF-XXX to file path in the index
 * @returns Object with upstream (cites) and downstream (cited-by) typed edges
 */
export function citationResultToEdges(
  result: CitationParseResult,
  refToPath: Map<string, string>
): { upstream: TypedEdge[]; downstream: TypedEdge[] } {
  const upstream: TypedEdge[] = [];
  const downstream: TypedEdge[] = [];

  // Outgoing citations → upstream "cites" edges
  for (const citedRef of result.cites) {
    const targetPath = refToPath.get(citedRef);
    if (targetPath) {
      upstream.push({ path: targetPath, type: 'cites' });
    }
  }

  // Incoming citations → downstream "cited-by" edges
  for (const citingRef of result.citedBy) {
    const sourcePath = refToPath.get(citingRef);
    if (sourcePath) {
      downstream.push({ path: sourcePath, type: 'cited-by' });
    }
  }

  return { upstream, downstream };
}

/**
 * Build a REF-XXX → file path mapping from indexed entries.
 *
 * Scans entry frontmatter for `ref` fields matching REF-XXX pattern.
 *
 * @param entries - Map of path → parsed frontmatter data
 * @returns Map from REF-XXX to file path
 */
export function buildRefToPathMap(
  entries: Map<string, Record<string, unknown>>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [filePath, data] of entries) {
    const ref = typeof data.ref === 'string' ? data.ref : null;
    if (ref && ref.match(/^REF-\d+$/)) {
      map.set(ref, filePath);
    }
  }
  return map;
}
