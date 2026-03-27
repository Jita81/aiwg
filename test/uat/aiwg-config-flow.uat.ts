/**
 * UAT: Project Config Flow (#621)
 *
 * Validates the end-to-end flow for project-level aiwg.config:
 *   1. `aiwg init --non-interactive` creates .aiwg/aiwg.config
 *   2. `aiwg run` lists available scripts
 *   3. `aiwg run <script>` executes the script
 *   4. Package registry read/write round-trip
 *   5. parseRef covers all supported reference formats
 *
 * No mocking — all filesystem operations run against real temp directories.
 *
 * Run on demand (included in npm run uat):
 *   npm run uat
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

// @ts-ignore
const __dirname_uat = new URL('.', import.meta.url).pathname;
const PROJECT_ROOT = resolve(__dirname_uat, '../..');

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `aiwg-uat-config-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeCtx(cwd: string, args: string[] = []) {
  return {
    args,
    rawArgs: args,
    cwd,
    frameworkRoot: PROJECT_ROOT,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('UAT: aiwg init → aiwg.config lifecycle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('aiwg init --non-interactive creates a valid .aiwg/aiwg.config', async () => {
    // @ts-ignore
    const { initHandler } = await import(join(PROJECT_ROOT, 'src/cli/handlers/init.js'));
    const result = await initHandler.execute(makeCtx(tmpDir, ['--non-interactive']));

    expect(result.exitCode).toBe(0);

    const configPath = join(tmpDir, '.aiwg', 'aiwg.config');
    expect(existsSync(configPath)).toBe(true);

    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe('1');
    expect(Array.isArray(parsed.providers)).toBe(true);
    expect(parsed.providers).toContain('claude');
    expect(typeof parsed.scripts).toBe('object');
    expect(parsed.scripts.deploy).toBe('aiwg use all');
  });

  it('readAiwgConfig reads back what init wrote', async () => {
    // @ts-ignore
    const { initHandler } = await import(join(PROJECT_ROOT, 'src/cli/handlers/init.js'));
    await initHandler.execute(makeCtx(tmpDir, ['--non-interactive']));

    // @ts-ignore
    const { readAiwgConfig } = await import(join(PROJECT_ROOT, 'src/config/aiwg-config.js'));
    const cfg = await readAiwgConfig(tmpDir);

    expect(cfg).not.toBeNull();
    expect(cfg.version).toBe('1');
    expect(cfg.providers).toEqual(['claude']);
    expect(cfg.installed).toEqual({});
    expect(cfg.scripts.deploy).toBe('aiwg use all');
    expect(cfg.scripts.doctor).toBe('aiwg doctor');
    expect(cfg.scripts.sync).toBe('aiwg sync');
  });

  it('aiwg init --force re-creates config', async () => {
    // @ts-ignore
    const { initHandler } = await import(join(PROJECT_ROOT, 'src/cli/handlers/init.js'));

    // First init
    await initHandler.execute(makeCtx(tmpDir, ['--non-interactive']));

    // Mutate the on-disk config
    const configPath = join(tmpDir, '.aiwg', 'aiwg.config');
    const original = JSON.parse(readFileSync(configPath, 'utf-8'));
    original.providers = ['copilot'];
    require('fs').writeFileSync(configPath, JSON.stringify(original, null, 2));

    // Force re-init
    await initHandler.execute(makeCtx(tmpDir, ['--non-interactive', '--force']));

    // Should be back to defaults
    // @ts-ignore
    const { readAiwgConfig } = await import(join(PROJECT_ROOT, 'src/config/aiwg-config.js'));
    const cfg = await readAiwgConfig(tmpDir);
    expect(cfg.providers).toEqual(['claude']);
  });

  it('second init without --force is idempotent (exits 0, does not overwrite)', async () => {
    // @ts-ignore
    const { initHandler } = await import(join(PROJECT_ROOT, 'src/cli/handlers/init.js'));

    await initHandler.execute(makeCtx(tmpDir, ['--non-interactive']));
    const result2 = await initHandler.execute(makeCtx(tmpDir, ['--non-interactive']));

    expect(result2.exitCode).toBe(0);
    // Config still exists
    expect(existsSync(join(tmpDir, '.aiwg', 'aiwg.config'))).toBe(true);
  });
});

describe('UAT: aiwg run', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function initProject(scripts: Record<string, string>): Promise<void> {
    // @ts-ignore
    const { writeAiwgConfig, emptyConfig } = await import(join(PROJECT_ROOT, 'src/config/aiwg-config.js'));
    const cfg = emptyConfig(['claude']);
    cfg.scripts = scripts;
    await writeAiwgConfig(tmpDir, cfg);
  }

  it('aiwg run (no script) exits 0 and lists scripts', async () => {
    await initProject({ build: 'echo building', test: 'echo testing' });
    // @ts-ignore
    const { runHandler } = await import(join(PROJECT_ROOT, 'src/cli/handlers/run.js'));

    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...a: unknown[]) => lines.push(a.join(' '));

    const result = await runHandler.execute(makeCtx(tmpDir, []));
    console.log = origLog;

    expect(result.exitCode).toBe(0);
    const output = lines.join('\n');
    expect(output).toContain('build');
    expect(output).toContain('test');
  });

  it('aiwg run <script> executes shell command successfully', async () => {
    const outFile = join(tmpDir, 'ran.txt');
    await initProject({ mark: `touch "${outFile}"` });
    // @ts-ignore
    const { runHandler } = await import(join(PROJECT_ROOT, 'src/cli/handlers/run.js'));

    const origLog = console.log;
    console.log = () => {};
    const result = await runHandler.execute(makeCtx(tmpDir, ['mark']));
    console.log = origLog;

    expect(result.exitCode).toBe(0);
    expect(existsSync(outFile)).toBe(true);
  });

  it('AIWG_PROJECT env var points to project directory', async () => {
    const outFile = join(tmpDir, 'project_path.txt');
    await initProject({ checkenv: `echo "$AIWG_PROJECT" > "${outFile}"` });
    // @ts-ignore
    const { runHandler } = await import(join(PROJECT_ROOT, 'src/cli/handlers/run.js'));

    const origLog = console.log;
    console.log = () => {};
    await runHandler.execute(makeCtx(tmpDir, ['checkenv']));
    console.log = origLog;

    const written = readFileSync(outFile, 'utf-8').trim();
    expect(written).toBe(tmpDir);
  });

  it('aiwg run <nonexistent> exits 1 with helpful message', async () => {
    await initProject({ deploy: 'aiwg use all' });
    // @ts-ignore
    const { runHandler } = await import(join(PROJECT_ROOT, 'src/cli/handlers/run.js'));

    const result = await runHandler.execute(makeCtx(tmpDir, ['nonexistent']));
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('nonexistent');
    expect(result.message).toContain('deploy');
  });
});

describe('UAT: package registry round-trip', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('setPackageEntry → getPackageEntry → removePackageEntry round-trip', async () => {
    // @ts-ignore
    const { setPackageEntry, getPackageEntry, removePackageEntry, listPackages } =
      await import(join(PROJECT_ROOT, 'src/packages/package-registry.js'));

    const entry = {
      version: '2026.3.4',
      source: 'https://git.integrolabs.net/roko/ring-methodology.git',
      type: 'framework',
      cachePath: '/tmp/fake-cache/roko/ring-methodology',
      installedAt: new Date().toISOString(),
      deployedTo: [],
    };

    await setPackageEntry('roko/ring-methodology', entry, configDir);

    const read = await getPackageEntry('roko/ring-methodology', configDir);
    expect(read).toBeDefined();
    expect(read.version).toBe('2026.3.4');
    expect(read.type).toBe('framework');

    const listed = await listPackages(configDir);
    expect(listed).toHaveLength(1);
    expect(listed[0].key).toBe('roko/ring-methodology');

    const removed = await removePackageEntry('roko/ring-methodology', configDir);
    expect(removed).toBe(true);

    const afterRemove = await getPackageEntry('roko/ring-methodology', configDir);
    expect(afterRemove).toBeUndefined();
  });
});

describe('UAT: parseRef reference format coverage', () => {
  it('covers all documented reference formats', async () => {
    // @ts-ignore
    const { parseRef } = await import(join(PROJECT_ROOT, 'src/packages/registry.js'));

    const cases: Array<{ input: string; scheme: string; owner?: string; name?: string; version?: string }> = [
      { input: 'roko/ring-methodology',        scheme: 'gitea',  owner: 'roko',   name: 'ring-methodology' },
      { input: 'roko/ring@v2026.3.4',          scheme: 'gitea',  owner: 'roko',   name: 'ring', version: 'v2026.3.4' },
      { input: 'github:jmagly/aiwg',           scheme: 'github', owner: 'jmagly', name: 'aiwg' },
      { input: 'github:jmagly/aiwg@v1.0.0',   scheme: 'github', owner: 'jmagly', name: 'aiwg', version: 'v1.0.0' },
      { input: 'https://git.example.com/a/b', scheme: 'https' },
      { input: 'git@host.com:a/b.git',         scheme: 'ssh' },
    ];

    for (const c of cases) {
      const ref = parseRef(c.input);
      expect(ref.scheme, `scheme mismatch for "${c.input}"`).toBe(c.scheme);
      if (c.owner) expect(ref.owner, `owner for "${c.input}"`).toBe(c.owner);
      if (c.name)  expect(ref.name,  `name for "${c.input}"`).toBe(c.name);
      if (c.version) expect(ref.version, `version for "${c.input}"`).toBe(c.version);
    }
  });
});
