/**
 * Citation Sidecar Parser Tests
 *
 * @source @src/artifacts/citation-parser.ts
 * @implements #722
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  extractRefsFromTable,
  parseCitationSidecar,
  citationResultToEdges,
  buildRefToPathMap,
} from '../../../src/artifacts/citation-parser.js';
import { buildIndex } from '../../../src/artifacts/index-builder.js';
import type { DependencyGraph } from '../../../src/artifacts/types.js';
import { GRAPH_CONFIGS, INDEX_DIR } from '../../../src/artifacts/types.js';

describe('Citation Sidecar Parser', () => {
  describe('extractRefsFromTable', () => {
    it('should extract REF-XXX from a markdown table column', () => {
      const table = `
| # | Title | Authors | Year | DOI/URL | Inducted REF |
|---|-------|---------|------|---------|--------------|
| 7 | Dense passage retrieval | Karpukhin et al. | 2020 | arXiv:2004.04906 | REF-029 |
| 26 | Neural Turing machines | Graves et al. | 2014 | arXiv:1410.5401 | REF-009 |
| 31 | Some other paper | Smith | 2021 | doi:10.1234 | — |
`;
      const refs = extractRefsFromTable(table, 'Inducted REF');
      expect(refs).toEqual(['REF-029', 'REF-009']);
    });

    it('should handle case-insensitive column matching', () => {
      const table = `
| REF | Title | Relationship |
|-----|-------|-------------|
| REF-015 | Self-Refine | Cites RAG baseline |
| REF-042 | Another paper | Some relationship |
`;
      const refs = extractRefsFromTable(table, 'ref');
      expect(refs).toEqual(['REF-015', 'REF-042']);
    });

    it('should skip dash and em-dash values', () => {
      const table = `
| # | Title | Inducted REF |
|---|-------|--------------|
| 1 | Paper A | REF-001 |
| 2 | Paper B | — |
| 3 | Paper C | - |
| 4 | Paper D | – |
| 5 | Paper E | REF-005 |
`;
      const refs = extractRefsFromTable(table, 'Inducted REF');
      expect(refs).toEqual(['REF-001', 'REF-005']);
    });

    it('should return empty array for table without the target column', () => {
      const table = `
| # | Title | Authors |
|---|-------|---------|
| 1 | Paper A | Smith |
`;
      const refs = extractRefsFromTable(table, 'Inducted REF');
      expect(refs).toEqual([]);
    });

    it('should return empty array for insufficient table rows', () => {
      const table = `
| # | Title | Inducted REF |
`;
      const refs = extractRefsFromTable(table, 'Inducted REF');
      expect(refs).toEqual([]);
    });

    it('should handle multiple REF values in a single cell', () => {
      const table = `
| # | Title | Inducted REF |
|---|-------|--------------|
| 1 | Paper | REF-001, REF-002 |
`;
      const refs = extractRefsFromTable(table, 'Inducted REF');
      expect(refs).toEqual(['REF-001', 'REF-002']);
    });
  });

  describe('parseCitationSidecar', () => {
    it('should parse a complete citation sidecar file', () => {
      const content = `---
ref: REF-008
title: "Retrieval-Augmented Generation"
type: citations
---

## Outgoing: Papers This Work Cites

| # | Title | Authors | Year | DOI/URL | Inducted REF |
|---|-------|---------|------|---------|--------------|
| 7 | Dense passage retrieval | Karpukhin et al. | 2020 | arXiv:2004.04906 | REF-029 |
| 26 | Neural Turing machines | Graves et al. | 2014 | arXiv:1410.5401 | REF-009 |
| 31 | Attention is all you need | Vaswani et al. | 2017 | arXiv:1706.03762 | — |

## Incoming: Papers That Cite This Work

### Corpus Cross-References (Internal)

| REF | Title | Relationship |
|-----|-------|-------------|
| REF-015 | Self-Refine | Cites RAG as retrieval augmentation baseline |
| REF-042 | Chain of Thought | References retrieval augmentation |
`;

      const result = parseCitationSidecar(content);
      expect(result).not.toBeNull();
      expect(result!.ref).toBe('REF-008');
      expect(result!.cites).toEqual(['REF-029', 'REF-009']);
      expect(result!.citedBy).toEqual(['REF-015', 'REF-042']);
    });

    it('should return null for content without ref frontmatter', () => {
      const content = `---
title: Not a sidecar
---

# Regular document
`;
      expect(parseCitationSidecar(content)).toBeNull();
    });

    it('should return null for invalid ref format', () => {
      const content = `---
ref: INVALID-FORMAT
---

## Outgoing: Papers This Work Cites
`;
      expect(parseCitationSidecar(content)).toBeNull();
    });

    it('should handle sidecar with only outgoing section', () => {
      const content = `---
ref: REF-050
title: "New Paper"
---

## Outgoing: Papers This Work Cites

| # | Title | Inducted REF |
|---|-------|--------------|
| 1 | Paper A | REF-001 |
`;
      const result = parseCitationSidecar(content);
      expect(result).not.toBeNull();
      expect(result!.cites).toEqual(['REF-001']);
      expect(result!.citedBy).toEqual([]);
    });

    it('should handle sidecar with only incoming section', () => {
      const content = `---
ref: REF-001
title: "Foundational Paper"
---

## Incoming: Papers That Cite This Work

| REF | Title | Relationship |
|-----|-------|-------------|
| REF-010 | Follow-up | Extends the model |
`;
      const result = parseCitationSidecar(content);
      expect(result).not.toBeNull();
      expect(result!.cites).toEqual([]);
      expect(result!.citedBy).toEqual(['REF-010']);
    });

    it('should handle sidecar with empty tables', () => {
      const content = `---
ref: REF-099
title: "Isolated Paper"
---

## Outgoing: Papers This Work Cites

No inducted references yet.

## Incoming: Papers That Cite This Work

No citations found.
`;
      const result = parseCitationSidecar(content);
      expect(result).not.toBeNull();
      expect(result!.cites).toEqual([]);
      expect(result!.citedBy).toEqual([]);
    });
  });

  describe('citationResultToEdges', () => {
    it('should convert cites to upstream edges and citedBy to downstream edges', () => {
      const refToPath = new Map([
        ['REF-029', 'citations/REF-029-citations.md'],
        ['REF-009', 'citations/REF-009-citations.md'],
        ['REF-015', 'citations/REF-015-citations.md'],
      ]);

      const result = {
        ref: 'REF-008',
        cites: ['REF-029', 'REF-009'],
        citedBy: ['REF-015'],
      };

      const edges = citationResultToEdges(result, refToPath);

      expect(edges.upstream).toEqual([
        { path: 'citations/REF-029-citations.md', type: 'cites' },
        { path: 'citations/REF-009-citations.md', type: 'cites' },
      ]);
      expect(edges.downstream).toEqual([
        { path: 'citations/REF-015-citations.md', type: 'cited-by' },
      ]);
    });

    it('should skip refs not in the path map', () => {
      const refToPath = new Map([
        ['REF-001', 'citations/REF-001-citations.md'],
      ]);

      const result = {
        ref: 'REF-008',
        cites: ['REF-001', 'REF-999'], // REF-999 not in index
        citedBy: ['REF-888'],           // REF-888 not in index
      };

      const edges = citationResultToEdges(result, refToPath);
      expect(edges.upstream).toHaveLength(1);
      expect(edges.downstream).toHaveLength(0);
    });
  });

  describe('buildRefToPathMap', () => {
    it('should build map from entries with ref frontmatter', () => {
      const entries = new Map<string, Record<string, unknown>>([
        ['citations/REF-008-citations.md', { ref: 'REF-008', title: 'Paper A' }],
        ['citations/REF-029-citations.md', { ref: 'REF-029', title: 'Paper B' }],
        ['other/document.md', { title: 'No ref' }],
      ]);

      const map = buildRefToPathMap(entries);
      expect(map.size).toBe(2);
      expect(map.get('REF-008')).toBe('citations/REF-008-citations.md');
      expect(map.get('REF-029')).toBe('citations/REF-029-citations.md');
    });

    it('should skip entries with invalid ref format', () => {
      const entries = new Map<string, Record<string, unknown>>([
        ['a.md', { ref: 'INVALID' }],
        ['b.md', { ref: 123 }],
        ['c.md', { ref: 'REF-001' }],
      ]);

      const map = buildRefToPathMap(entries);
      expect(map.size).toBe(1);
    });
  });

  describe('buildIndex integration with citation-sidecar parser', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwg-citation-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      // Clean up any user-defined graphs
      for (const key of Object.keys(GRAPH_CONFIGS)) {
        if (!['framework', 'project', 'codebase'].includes(key)) {
          delete GRAPH_CONFIGS[key];
        }
      }
    });

    it('should extract citation edges when edgeExtraction is configured', async () => {
      // Setup: .aiwg/config.yaml with citation-network graph
      const aiwgDir = path.join(tmpDir, '.aiwg');
      const citationsDir = path.join(tmpDir, 'documentation', 'citations');
      fs.mkdirSync(aiwgDir, { recursive: true });
      fs.mkdirSync(citationsDir, { recursive: true });

      fs.writeFileSync(path.join(aiwgDir, 'config.yaml'), `
index:
  graphs:
    citation-network:
      scanDirs:
        - documentation/citations
      extensions:
        - .md
      defaultBuild: false
      edgeExtraction:
        parser: citation-sidecar
        edges:
          - type: cites
            source: frontmatter.ref
            target: outgoing-table.inducted-ref
            skipEmpty: true
          - type: cited-by
            source: frontmatter.ref
            target: incoming-table.inducted-ref
            skipEmpty: true
`);

      // Create citation sidecar files
      fs.writeFileSync(path.join(citationsDir, 'REF-008-citations.md'), `---
ref: REF-008
title: "Retrieval-Augmented Generation"
type: citations
---

## Outgoing: Papers This Work Cites

| # | Title | Authors | Year | DOI/URL | Inducted REF |
|---|-------|---------|------|---------|--------------|
| 7 | Dense passage retrieval | Karpukhin et al. | 2020 | arXiv:2004.04906 | REF-029 |
| 26 | Neural Turing machines | Graves et al. | 2014 | arXiv:1410.5401 | REF-009 |

## Incoming: Papers That Cite This Work

### Corpus Cross-References (Internal)

| REF | Title | Relationship |
|-----|-------|-------------|
| REF-015 | Self-Refine | Cites RAG as retrieval augmentation baseline |
`);

      fs.writeFileSync(path.join(citationsDir, 'REF-029-citations.md'), `---
ref: REF-029
title: "Dense Passage Retrieval"
type: citations
---

## Outgoing: Papers This Work Cites

No inducted references.

## Incoming: Papers That Cite This Work

### Corpus Cross-References (Internal)

| REF | Title | Relationship |
|-----|-------|-------------|
| REF-008 | RAG | Uses DPR for retrieval |
`);

      fs.writeFileSync(path.join(citationsDir, 'REF-009-citations.md'), `---
ref: REF-009
title: "Neural Turing Machines"
type: citations
---

## Outgoing: Papers This Work Cites

No inducted references.

## Incoming: Papers That Cite This Work

### Corpus Cross-References (Internal)

| REF | Title | Relationship |
|-----|-------|-------------|
| REF-008 | RAG | References memory mechanisms |
`);

      fs.writeFileSync(path.join(citationsDir, 'REF-015-citations.md'), `---
ref: REF-015
title: "Self-Refine"
type: citations
---

## Outgoing: Papers This Work Cites

| # | Title | Inducted REF |
|---|-------|--------------|
| 1 | RAG | REF-008 |

## Incoming: Papers That Cite This Work

No corpus citations.
`);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await buildIndex(tmpDir, { force: true, graph: 'citation-network', explicit: true });

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      // Read the dependency graph
      const indexDir = path.join(tmpDir, '.aiwg', '.index', 'citation-network');
      const deps: DependencyGraph = JSON.parse(
        fs.readFileSync(path.join(indexDir, 'dependencies.json'), 'utf-8')
      );

      // REF-008 should have cites edges to REF-029 and REF-009
      const ref008 = deps['documentation/citations/REF-008-citations.md'];
      expect(ref008).toBeDefined();
      const citesEdges = ref008.upstream.filter(e => e.type === 'cites');
      expect(citesEdges).toHaveLength(2);
      const citesPaths = citesEdges.map(e => e.path).sort();
      expect(citesPaths).toEqual([
        'documentation/citations/REF-009-citations.md',
        'documentation/citations/REF-029-citations.md',
      ]);

      // REF-008 should have cited-by edge from REF-015
      const citedByEdges = ref008.downstream.filter(e => e.type === 'cited-by');
      expect(citedByEdges).toHaveLength(1);
      expect(citedByEdges[0].path).toBe('documentation/citations/REF-015-citations.md');

      // REF-015 should have a cites edge to REF-008
      const ref015 = deps['documentation/citations/REF-015-citations.md'];
      expect(ref015).toBeDefined();
      const ref015Cites = ref015.upstream.filter(e => e.type === 'cites');
      expect(ref015Cites).toHaveLength(1);
      expect(ref015Cites[0].path).toBe('documentation/citations/REF-008-citations.md');
    });
  });
});
