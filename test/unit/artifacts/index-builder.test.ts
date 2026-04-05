/**
 * Artifact Index Builder Tests
 *
 * @source @src/artifacts/index-builder.ts
 * @implements #415
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseFrontmatter, extractMentions, buildIndex } from '../../../src/artifacts/index-builder.js';
import { INDEX_DIR, GRAPH_CONFIGS, loadUserGraphConfigs, normalizeEdge, normalizeEdges } from '../../../src/artifacts/types.js';
import type { TypedEdge, DependencyGraph } from '../../../src/artifacts/types.js';

describe('loadUserGraphConfigs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwg-graphs-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clean up any user-defined graphs added to GRAPH_CONFIGS
    for (const key of Object.keys(GRAPH_CONFIGS)) {
      if (!['framework', 'project', 'codebase'].includes(key)) {
        delete GRAPH_CONFIGS[key];
      }
    }
  });

  it('should load user-defined graphs from .aiwg/config.yaml', () => {
    const aiwgDir = path.join(tmpDir, '.aiwg');
    fs.mkdirSync(aiwgDir, { recursive: true });
    fs.writeFileSync(path.join(aiwgDir, 'config.yaml'), `
index:
  graphs:
    references:
      scanDirs:
        - documentation/references
      extensions:
        - .md
      defaultBuild: false
`);

    const loaded = loadUserGraphConfigs(tmpDir);

    expect(loaded).toContain('references');
    expect(GRAPH_CONFIGS['references']).toBeDefined();
    expect(GRAPH_CONFIGS['references'].scanDirs).toEqual(['documentation/references']);
    expect(GRAPH_CONFIGS['references'].extensions).toEqual(['.md']);
    expect(GRAPH_CONFIGS['references'].defaultBuild).toBe(false);
  });

  it('should not override built-in graph names', () => {
    const aiwgDir = path.join(tmpDir, '.aiwg');
    fs.mkdirSync(aiwgDir, { recursive: true });
    fs.writeFileSync(path.join(aiwgDir, 'config.yaml'), `
index:
  graphs:
    project:
      scanDirs:
        - custom-dir
`);

    loadUserGraphConfigs(tmpDir);

    // project should still point to .aiwg, not custom-dir
    expect(GRAPH_CONFIGS['project'].scanDirs).toEqual(['.aiwg']);
  });

  it('should return empty array when config.yaml does not exist', () => {
    const loaded = loadUserGraphConfigs(tmpDir);
    expect(loaded).toEqual([]);
  });
});

describe('Artifact Index Builder', () => {
  describe('parseFrontmatter', () => {
    it('should parse valid YAML frontmatter', () => {
      const content = `---
title: Test Document
type: use-case
tags:
  - auth
  - security
---
# Test

Body content here.`;
      const result = parseFrontmatter(content);
      expect(result.data.title).toBe('Test Document');
      expect(result.data.type).toBe('use-case');
      expect(result.data.tags).toEqual(['auth', 'security']);
      expect(result.body).toContain('# Test');
    });

    it('should return empty data for content without frontmatter', () => {
      const content = '# Just a heading\n\nSome content.';
      const result = parseFrontmatter(content);
      expect(result.data).toEqual({});
      expect(result.body).toBe(content);
    });

    it('should handle malformed YAML gracefully', () => {
      const content = `---
invalid: yaml: [broken
---
# Body`;
      const result = parseFrontmatter(content);
      expect(result.data).toEqual({});
    });

    it('should handle empty frontmatter', () => {
      const content = `---
---
# Body`;
      const result = parseFrontmatter(content);
      expect(result.data).toEqual({});
      expect(result.body).toContain('# Body');
    });
  });

  describe('extractMentions', () => {
    it('should extract @-mention file references', () => {
      const content = `
See @src/artifacts/types.ts for type definitions.
Also references @.aiwg/requirements/UC-001.md and @.aiwg/architecture/sad.md
`;
      const mentions = extractMentions(content);
      expect(mentions).toContain('src/artifacts/types.ts');
      expect(mentions).toContain('.aiwg/requirements/UC-001.md');
      expect(mentions).toContain('.aiwg/architecture/sad.md');
    });

    it('should deduplicate mentions', () => {
      const content = `
Ref @src/foo.ts and also @src/foo.ts again.
`;
      const mentions = extractMentions(content);
      const fooCount = mentions.filter(m => m === 'src/foo.ts').length;
      expect(fooCount).toBe(1);
    });

    it('should return empty array for content without mentions', () => {
      const content = 'No mentions here.';
      const mentions = extractMentions(content);
      expect(mentions).toEqual([]);
    });
  });

  describe('buildIndex', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwg-index-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should build index from .aiwg/ directory', async () => {
      // Create test artifacts
      const aiwgDir = path.join(tmpDir, '.aiwg', 'requirements');
      fs.mkdirSync(aiwgDir, { recursive: true });

      fs.writeFileSync(path.join(aiwgDir, 'UC-001.md'), `---
title: User Login
type: use-case
tags:
  - auth
  - security
---
# UC-001: User Login

Users can log in with email and password.
`);

      fs.writeFileSync(path.join(aiwgDir, 'UC-002.md'), `---
title: User Registration
type: use-case
tags:
  - auth
---
# UC-002: User Registration

New users can register.

@.aiwg/requirements/UC-001.md
`);

      // Suppress console output during build
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await buildIndex(tmpDir, { force: true });

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      // Check index files exist
      const indexDir = path.join(tmpDir, INDEX_DIR);
      expect(fs.existsSync(path.join(indexDir, 'metadata.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexDir, 'tags.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexDir, 'dependencies.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexDir, 'stats.json'))).toBe(true);

      // Check metadata content
      const metadata = JSON.parse(fs.readFileSync(path.join(indexDir, 'metadata.json'), 'utf-8'));
      expect(metadata.version).toBe('1.0.0');
      expect(Object.keys(metadata.entries)).toHaveLength(2);

      const uc001 = metadata.entries['.aiwg/requirements/UC-001.md'];
      expect(uc001).toBeDefined();
      expect(uc001.title).toBe('User Login');
      expect(uc001.type).toBe('use-case');
      expect(uc001.phase).toBe('requirements');
      expect(uc001.tags).toContain('auth');
      expect(uc001.checksum).toHaveLength(16);

      // Check tag index
      const tags = JSON.parse(fs.readFileSync(path.join(indexDir, 'tags.json'), 'utf-8'));
      expect(tags.auth).toHaveLength(2);
      expect(tags.security).toHaveLength(1);

      // Check stats
      const stats = JSON.parse(fs.readFileSync(path.join(indexDir, 'stats.json'), 'utf-8'));
      expect(stats.totalArtifacts).toBe(2);
      expect(stats.byPhase.requirements).toBe(2);
      expect(stats.byType['use-case']).toBe(2);
    });

    it('should handle incremental builds', async () => {
      // Create one artifact
      const aiwgDir = path.join(tmpDir, '.aiwg', 'requirements');
      fs.mkdirSync(aiwgDir, { recursive: true });

      fs.writeFileSync(path.join(aiwgDir, 'UC-001.md'), `---
title: User Login
type: use-case
---
# UC-001
`);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First build
      await buildIndex(tmpDir, { force: true });

      // Add another artifact
      fs.writeFileSync(path.join(aiwgDir, 'UC-002.md'), `---
title: User Registration
type: use-case
---
# UC-002
`);

      // Incremental build (force = false by default)
      await buildIndex(tmpDir, {});

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      const indexDir = path.join(tmpDir, INDEX_DIR);
      const metadata = JSON.parse(fs.readFileSync(path.join(indexDir, 'metadata.json'), 'utf-8'));
      expect(Object.keys(metadata.entries)).toHaveLength(2);
    });

    it('should infer type from filename patterns', async () => {
      const aiwgDir = path.join(tmpDir, '.aiwg', 'architecture');
      fs.mkdirSync(aiwgDir, { recursive: true });

      fs.writeFileSync(path.join(aiwgDir, 'adr-001-foo.md'), '# ADR-001\nSome decision.');
      fs.writeFileSync(path.join(aiwgDir, 'sad.md'), '# Software Architecture\nOverview.');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await buildIndex(tmpDir, { force: true });

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      const indexDir = path.join(tmpDir, INDEX_DIR);
      const metadata = JSON.parse(fs.readFileSync(path.join(indexDir, 'metadata.json'), 'utf-8'));

      const adr = metadata.entries['.aiwg/architecture/adr-001-foo.md'];
      expect(adr.type).toBe('adr');

      const sad = metadata.entries['.aiwg/architecture/sad.md'];
      expect(sad.type).toBe('architecture');
    });

    it('should exit with error when .aiwg/ does not exist', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });

      await expect(buildIndex(path.join(tmpDir, 'nonexistent'))).rejects.toThrow('process.exit');

      exitSpy.mockRestore();
      consoleSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('should skip gracefully when defaultBuild graph dirs do not exist (non-explicit)', async () => {
      // tmpDir has no src/test/tools — codebase graph should warn and return, not error
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });

      await expect(buildIndex(tmpDir, { graph: 'codebase', explicit: false })).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('codebase graph: scan directories not found'));
      expect(exitSpy).not.toHaveBeenCalled();

      exitSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should error when explicitly requested graph dirs do not exist', async () => {
      // explicit: true (--graph codebase) should still hard-error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });

      await expect(buildIndex(tmpDir, { graph: 'codebase', explicit: true })).rejects.toThrow('process.exit');

      exitSpy.mockRestore();
      consoleSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('should produce typed edges in dependency graph', async () => {
      const aiwgDir = path.join(tmpDir, '.aiwg', 'requirements');
      fs.mkdirSync(aiwgDir, { recursive: true });

      fs.writeFileSync(path.join(aiwgDir, 'UC-001.md'), `---
title: User Login
type: use-case
---
# UC-001: User Login

Users can log in.
`);

      fs.writeFileSync(path.join(aiwgDir, 'UC-002.md'), `---
title: User Registration
type: use-case
---
# UC-002: User Registration

Depends on @.aiwg/requirements/UC-001.md
`);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await buildIndex(tmpDir, { force: true });

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();

      const indexDir = path.join(tmpDir, INDEX_DIR);
      const deps: DependencyGraph = JSON.parse(
        fs.readFileSync(path.join(indexDir, 'dependencies.json'), 'utf-8')
      );

      // UC-002 should have UC-001 as upstream with type "depends-on"
      const uc002 = deps['.aiwg/requirements/UC-002.md'];
      expect(uc002).toBeDefined();
      expect(uc002.upstream).toHaveLength(1);
      expect(uc002.upstream[0]).toEqual({ path: '.aiwg/requirements/UC-001.md', type: 'depends-on' });

      // UC-001 should have UC-002 as downstream
      const uc001 = deps['.aiwg/requirements/UC-001.md'];
      expect(uc001).toBeDefined();
      expect(uc001.downstream).toHaveLength(1);
      expect(uc001.downstream[0]).toEqual({ path: '.aiwg/requirements/UC-002.md', type: 'depends-on' });
    });
  });

  describe('normalizeEdge / normalizeEdges', () => {
    it('should convert string to TypedEdge with depends-on type', () => {
      const edge = normalizeEdge('path/to/file.md');
      expect(edge).toEqual({ path: 'path/to/file.md', type: 'depends-on' });
    });

    it('should pass through TypedEdge unchanged', () => {
      const input: TypedEdge = { path: 'ref.md', type: 'cites' };
      expect(normalizeEdge(input)).toEqual(input);
    });

    it('should normalize mixed arrays', () => {
      const mixed: (string | TypedEdge)[] = [
        'old-string-edge.md',
        { path: 'new-typed.md', type: 'cites' },
      ];
      const result = normalizeEdges(mixed);
      expect(result).toEqual([
        { path: 'old-string-edge.md', type: 'depends-on' },
        { path: 'new-typed.md', type: 'cites' },
      ]);
    });
  });
});
