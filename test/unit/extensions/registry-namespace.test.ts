/**
 * Registry Qualified-Name Indexing Tests
 *
 * Tests for namespace-aware qualified name lookup added in #696.
 *
 * @implements #696
 * @source @src/extensions/registry.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRegistry } from '../../../src/extensions/registry.js';
import type { Extension, SkillMetadata } from '../../../src/extensions/types.js';

function makeSkill(id: string, namespace?: string): Extension {
  return {
    id,
    type: 'skill',
    name: id,
    description: `Test skill ${id}`,
    version: '1.0.0',
    capabilities: [],
    keywords: [],
    category: 'test',
    platforms: { claude: 'full' },
    deployment: { pathTemplate: '.claude/skills/{id}/SKILL.md' },
    metadata: {
      type: 'skill',
      namespace,
      triggerPhrases: [`use ${id}`],
    } satisfies SkillMetadata,
  };
}

describe('ExtensionRegistry — qualified name indexing', () => {
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
  });

  it('resolves qualified name for a namespaced skill', () => {
    registry.register(makeSkill('sync', 'aiwg'));
    const id = registry.resolveQualifiedName('aiwg-sync');
    expect(id).toBe('sync');
  });

  it('returns undefined for unknown qualified name', () => {
    registry.register(makeSkill('sync', 'aiwg'));
    expect(registry.resolveQualifiedName('aiwg-unknown')).toBeUndefined();
  });

  it('resolves bare id via resolveQualifiedName fallback', () => {
    registry.register(makeSkill('sync', 'aiwg'));
    const id = registry.resolveQualifiedName('sync');
    expect(id).toBe('sync');
  });

  it('does not double-prefix a skill already named aiwg-*', () => {
    // 'aiwg-sync' with namespace 'aiwg' — qualified name should still be 'aiwg-sync'
    registry.register(makeSkill('aiwg-sync', 'aiwg'));
    const id = registry.resolveQualifiedName('aiwg-sync');
    expect(id).toBe('aiwg-sync');
    // must NOT register 'aiwg-aiwg-sync'
    expect(registry.resolveQualifiedName('aiwg-aiwg-sync')).toBeUndefined();
  });

  it('does not index skill without namespace', () => {
    registry.register(makeSkill('sync'));
    expect(registry.resolveQualifiedName('aiwg-sync')).toBeUndefined();
  });

  it('clears qualified name index on clear()', () => {
    registry.register(makeSkill('sync', 'aiwg'));
    registry.clear();
    expect(registry.resolveQualifiedName('aiwg-sync')).toBeUndefined();
  });

  it('replaces qualified name index when skill is re-registered', () => {
    registry.register(makeSkill('sync', 'aiwg'));
    registry.register(makeSkill('sync', 'aiwg')); // re-register same
    const id = registry.resolveQualifiedName('aiwg-sync');
    expect(id).toBe('sync');
  });
});
