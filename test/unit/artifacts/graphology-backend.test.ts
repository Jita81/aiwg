/**
 * Graphology Backend Tests
 *
 * @source @src/artifacts/backends/graphology-backend.ts
 * @implements #728
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { GraphBackend } from '../../../src/artifacts/graph-backend.js';
import type { DependencyGraph } from '../../../src/artifacts/types.js';
import { GraphologyBackend } from '../../../src/artifacts/backends/graphology-backend.js';

describe('GraphologyBackend', () => {
  let g: GraphBackend;

  beforeEach(async () => {
    g = await GraphologyBackend.create();
  });

  describe('addNode / hasNode', () => {
    it('adds and detects nodes', () => {
      expect(g.hasNode('A')).toBe(false);
      g.addNode('A');
      expect(g.hasNode('A')).toBe(true);
      expect(g.nodeCount()).toBe(1);
    });

    it('stores and retrieves node attributes', () => {
      g.addNode('A', { type: 'paper', year: 2024 });
      const attrs = g.getNodeAttrs('A');
      expect(attrs).toMatchObject({ type: 'paper', year: 2024 });
    });

    it('merges attributes on duplicate addNode', () => {
      g.addNode('A', { type: 'paper' });
      g.addNode('A', { year: 2024 });
      const attrs = g.getNodeAttrs('A');
      expect(attrs).toMatchObject({ type: 'paper', year: 2024 });
    });
  });

  describe('addEdge / hasEdge', () => {
    it('creates directed edges and auto-creates nodes', () => {
      g.addEdge('A', 'B', 'cites');
      expect(g.hasNode('A')).toBe(true);
      expect(g.hasNode('B')).toBe(true);
      expect(g.hasEdge('A', 'B')).toBe(true);
      expect(g.hasEdge('A', 'B', 'cites')).toBe(true);
      expect(g.edgeCount()).toBe(1);
    });

    it('filters hasEdge by type', () => {
      g.addEdge('A', 'B', 'cites');
      expect(g.hasEdge('A', 'B', 'depends-on')).toBe(false);
      expect(g.hasEdge('A', 'B', 'cites')).toBe(true);
    });

    it('supports multi-edges (same pair, different types)', () => {
      g.addEdge('A', 'B', 'cites');
      g.addEdge('A', 'B', 'depends-on');
      expect(g.edgeCount()).toBe(2);
      expect(g.hasEdge('A', 'B', 'cites')).toBe(true);
      expect(g.hasEdge('A', 'B', 'depends-on')).toBe(true);
    });
  });

  describe('neighbors', () => {
    it('returns outbound neighbors', () => {
      g.addEdge('A', 'B', 'cites');
      g.addEdge('A', 'C', 'cites');
      g.addEdge('D', 'A', 'cites');

      const out = g.neighbors('A', 'out');
      expect(out).toEqual(expect.arrayContaining(['B', 'C']));
      expect(out).toHaveLength(2);
    });

    it('returns inbound neighbors', () => {
      g.addEdge('A', 'B', 'cites');
      g.addEdge('C', 'B', 'depends-on');

      expect(g.neighbors('B', 'in')).toEqual(expect.arrayContaining(['A', 'C']));
    });

    it('filters by edge type', () => {
      g.addEdge('A', 'B', 'cites');
      g.addEdge('A', 'C', 'depends-on');

      expect(g.neighbors('A', 'out', 'cites')).toEqual(['B']);
      expect(g.neighbors('A', 'out', 'depends-on')).toEqual(['C']);
    });

    it('returns empty for missing node', () => {
      expect(g.neighbors('missing', 'both')).toEqual([]);
    });
  });

  describe('set operations', () => {
    it('computes intersection', () => {
      expect(g.intersection(['A', 'B', 'C'], ['B', 'C', 'D'])).toEqual(['B', 'C']);
    });

    it('computes difference', () => {
      expect(g.difference(['A', 'B', 'C'], ['B', 'C', 'D'])).toEqual(['A']);
    });

    it('computes union', () => {
      const result = g.union(['A', 'B'], ['B', 'C']);
      expect(result).toEqual(expect.arrayContaining(['A', 'B', 'C']));
      expect(result).toHaveLength(3);
    });
  });

  describe('serialize / deserialize', () => {
    it('round-trips through DependencyGraph format', async () => {
      g.addEdge('A', 'B', 'cites');
      g.addEdge('A', 'C', 'depends-on');
      g.addEdge('D', 'A', 'cited-by');

      const serialized = g.serialize();

      const g2 = await GraphologyBackend!.create();
      g2.deserialize(serialized);

      expect(g2.hasNode('A')).toBe(true);
      expect(g2.hasNode('B')).toBe(true);
      expect(g2.nodeCount()).toBe(g.nodeCount());
      expect(g2.edgeCount()).toBe(g.edgeCount());
    });

    it('deserializes a DependencyGraph from JSON backend', async () => {
      const data: DependencyGraph = {
        'A': {
          upstream: [{ path: 'B', type: 'cites' }],
          downstream: [{ path: 'C', type: 'depends-on' }],
        },
        'B': { upstream: [], downstream: [{ path: 'A', type: 'cites' }] },
        'C': { upstream: [{ path: 'A', type: 'depends-on' }], downstream: [] },
      };

      g.deserialize(data);

      expect(g.hasNode('A')).toBe(true);
      expect(g.hasNode('B')).toBe(true);
      expect(g.hasNode('C')).toBe(true);
      expect(g.neighbors('A', 'in')).toContain('B');
      expect(g.neighbors('A', 'out')).toContain('C');
    });
  });

  describe('nodes()', () => {
    it('lists all node IDs', () => {
      g.addNode('X');
      g.addEdge('A', 'B');
      const nodeList = g.nodes();
      expect(nodeList).toEqual(expect.arrayContaining(['X', 'A', 'B']));
      expect(nodeList).toHaveLength(3);
    });
  });
});
