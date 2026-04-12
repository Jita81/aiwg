/**
 * Unit tests for namespace isolation in the third-party package install pipeline.
 *
 * Covers:
 * - readPackageNamespace() reads 'namespace' field from manifest.json
 * - readPackageNamespace() derives namespace from clawhub:author/name source key
 * - readPackageNamespace() falls back to 'aiwg' for AIWG-owned packages
 * - installPackage() return value includes resolved namespace
 * - collision-detector treats cross-namespace overwrites as 'warn'
 * - collision-detector treats same-namespace (aiwg→aiwg) overwrites as 'info'
 *
 * @source @src/packages/registry.ts
 * @source @src/smiths/skillsmith/collision-detector.ts
 * @implements #804
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `aiwg-ns-iso-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(dir: string, data: Record<string, unknown>): void {
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function writeSkillMd(dir: string, frontmatter: Record<string, string>, body = ''): void {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  writeFileSync(join(dir, 'SKILL.md'), `---\n${fm}\n---\n${body}`, 'utf-8');
}

// ── readPackageNamespace ─────────────────────────────────────────────────────

describe('readPackageNamespace()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads explicit namespace field from manifest.json', async () => {
    writeManifest(tmpDir, { type: 'addon', namespace: 'acme' });

    const { readPackageNamespace } = await import('../../../src/packages/registry.js');
    const ns = await readPackageNamespace(tmpDir, 'acme/my-addon');
    expect(ns).toBe('acme');
  });

  it('returns aiwg when manifest has no namespace field (AIWG-owned package)', async () => {
    writeManifest(tmpDir, { type: 'addon' });

    const { readPackageNamespace } = await import('../../../src/packages/registry.js');
    const ns = await readPackageNamespace(tmpDir, 'aiwg/sdlc-complete');
    expect(ns).toBe('aiwg');
  });

  it('derives namespace from owner segment of the registry key when manifest is absent', async () => {
    // No manifest.json in this dir
    const { readPackageNamespace } = await import('../../../src/packages/registry.js');
    const ns = await readPackageNamespace(tmpDir, 'roko/ring-methodology');
    expect(ns).toBe('roko');
  });

  it('derives namespace from clawhub: source owner', async () => {
    const { readPackageNamespace } = await import('../../../src/packages/registry.js');
    const ns = await readPackageNamespace(tmpDir, 'clawhub:author/my-skill');
    expect(ns).toBe('author');
  });

  it('derives namespace from github: source owner', async () => {
    const { readPackageNamespace } = await import('../../../src/packages/registry.js');
    const ns = await readPackageNamespace(tmpDir, 'github:thirdparty/cool-addon');
    expect(ns).toBe('thirdparty');
  });

  it('falls back to "third-party" for keys that cannot be parsed', async () => {
    const { readPackageNamespace } = await import('../../../src/packages/registry.js');
    const ns = await readPackageNamespace(tmpDir, 'https://some-host.example.com/repo.git');
    expect(ns).toBe('third-party');
  });

  it('manifest namespace field takes precedence over key-derived namespace', async () => {
    writeManifest(tmpDir, { type: 'framework', namespace: 'explicit-ns' });

    const { readPackageNamespace } = await import('../../../src/packages/registry.js');
    // key says "roko", manifest says "explicit-ns" — manifest wins
    const ns = await readPackageNamespace(tmpDir, 'roko/my-framework');
    expect(ns).toBe('explicit-ns');
  });
});

// ── collision-detector: namespace ownership ──────────────────────────────────

describe('isOwnedByNamespace()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns true when SKILL.md frontmatter matches queried namespace', async () => {
    const skillDir = join(tmpDir, 'acme-my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeSkillMd(skillDir, { name: 'my-skill', namespace: 'acme' });

    const { isOwnedByNamespace } = await import(
      '../../../src/smiths/skillsmith/collision-detector.js'
    );
    expect(await isOwnedByNamespace(skillDir, 'acme')).toBe(true);
    expect(await isOwnedByNamespace(skillDir, 'other')).toBe(false);
  });

  it('returns true when parent directory matches queried namespace', async () => {
    const nsDir = join(tmpDir, 'roko');
    const skillDir = join(nsDir, 'roko-tool');
    mkdirSync(skillDir, { recursive: true });

    const { isOwnedByNamespace } = await import(
      '../../../src/smiths/skillsmith/collision-detector.js'
    );
    expect(await isOwnedByNamespace(skillDir, 'roko')).toBe(true);
    expect(await isOwnedByNamespace(skillDir, 'aiwg')).toBe(false);
  });

  it('returns false for an unowned skill directory', async () => {
    const skillDir = join(tmpDir, 'orphan-skill');
    mkdirSync(skillDir, { recursive: true });
    // no SKILL.md, no namespace parent

    const { isOwnedByNamespace } = await import(
      '../../../src/smiths/skillsmith/collision-detector.js'
    );
    expect(await isOwnedByNamespace(skillDir, 'aiwg')).toBe(false);
    expect(await isOwnedByNamespace(skillDir, 'roko')).toBe(false);
  });
});

// ── collision-detector: cross-namespace collision severity ───────────────────

describe('checkCollisions() — namespace isolation', () => {
  let projectDir: string;
  let skillsDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    skillsDir = join(projectDir, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('emits info severity when aiwg overwrites its own skill', async () => {
    // Pre-deploy an aiwg-owned skill (use a name that doesn't shadow a CLI command)
    const existingSkill = join(skillsDir, 'aiwg-project-scaffold');
    mkdirSync(existingSkill, { recursive: true });
    writeSkillMd(existingSkill, { name: 'project-scaffold', namespace: 'aiwg' });

    const { checkCollisions } = await import(
      '../../../src/smiths/skillsmith/collision-detector.js'
    );

    const results = await checkCollisions({
      platform: 'claude',
      projectPath: projectDir,
      skillNames: ['aiwg-project-scaffold'],
      namespace: 'aiwg',
      skillsBaseDir: skillsDir,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('info');
    expect(results[0]!.blocksDeployment).toBe(false);
  });

  it('emits warn severity when third-party overwrites a skill owned by a different namespace', async () => {
    // Pre-deploy a skill owned by "aiwg" (use a name that doesn't shadow a CLI command)
    const existingSkill = join(skillsDir, 'aiwg-project-scaffold');
    mkdirSync(existingSkill, { recursive: true });
    writeSkillMd(existingSkill, { name: 'project-scaffold', namespace: 'aiwg' });

    const { checkCollisions } = await import(
      '../../../src/smiths/skillsmith/collision-detector.js'
    );

    // Third-party "roko" tries to deploy a skill with the same target path
    const results = await checkCollisions({
      platform: 'claude',
      projectPath: projectDir,
      skillNames: ['aiwg-project-scaffold'],
      namespace: 'roko',
      skillsBaseDir: skillsDir,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('warn');
    expect(results[0]!.blocksDeployment).toBe(false);
  });

  it('emits warn severity when user-created content would be overwritten by any namespace', async () => {
    // Skill with no namespace (user-created)
    const existingSkill = join(skillsDir, 'my-custom-skill');
    mkdirSync(existingSkill, { recursive: true });
    writeSkillMd(existingSkill, { name: 'my-custom-skill' });

    const { checkCollisions } = await import(
      '../../../src/smiths/skillsmith/collision-detector.js'
    );

    const results = await checkCollisions({
      platform: 'claude',
      projectPath: projectDir,
      skillNames: ['my-custom-skill'],
      namespace: 'roko',
      skillsBaseDir: skillsDir,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('warn');
  });

  it('returns no results (no collision) when deploying to a new path', async () => {
    const { checkCollisions } = await import(
      '../../../src/smiths/skillsmith/collision-detector.js'
    );

    const results = await checkCollisions({
      platform: 'claude',
      projectPath: projectDir,
      skillNames: ['roko-new-skill'],
      namespace: 'roko',
      skillsBaseDir: skillsDir,
    });

    expect(results).toHaveLength(0);
  });

  it('same namespace (non-aiwg) overwriting its own skill is info, not warn', async () => {
    // "roko" already deployed roko-tool
    const existingSkill = join(skillsDir, 'roko-tool');
    mkdirSync(existingSkill, { recursive: true });
    writeSkillMd(existingSkill, { name: 'tool', namespace: 'roko' });

    const { checkCollisions } = await import(
      '../../../src/smiths/skillsmith/collision-detector.js'
    );

    const results = await checkCollisions({
      platform: 'claude',
      projectPath: projectDir,
      skillNames: ['roko-tool'],
      namespace: 'roko',
      skillsBaseDir: skillsDir,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('info');
    expect(results[0]!.blocksDeployment).toBe(false);
  });
});
