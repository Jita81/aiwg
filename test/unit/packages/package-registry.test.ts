/**
 * Unit tests for package-registry.ts
 *
 * @source @src/packages/package-registry.ts
 * @implements #557
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getPackagesFilePath,
  readPackageRegistry,
  writePackageRegistry,
  getPackageEntry,
  setPackageEntry,
  removePackageEntry,
  recordDeployment,
  listPackages,
} from '../../../src/packages/package-registry.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `aiwg-pkg-reg-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const SAMPLE_ENTRY = {
  version: '2026.3.4',
  source: 'https://git.integrolabs.net/roko/ring-methodology.git',
  type: 'framework',
  cachePath: '/home/user/.cache/aiwg/packages/roko/ring-methodology@2026.3.4',
  installedAt: '2026-03-01T00:00:00.000Z',
  deployedTo: [],
};

describe('package-registry', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  // ── getPackagesFilePath ────────────────────────────────────────────────────

  describe('getPackagesFilePath', () => {
    it('returns packages.yaml inside the provided configDir', () => {
      const p = getPackagesFilePath('/some/dir');
      expect(p).toMatch(/packages\.yaml$/);
      expect(p).toContain('/some/dir');
    });
  });

  // ── readPackageRegistry ────────────────────────────────────────────────────

  describe('readPackageRegistry', () => {
    it('returns an empty registry when file does not exist', async () => {
      const reg = await readPackageRegistry(configDir);
      expect(reg.packages).toEqual({});
      expect(reg.kind).toBe('PackageRegistry');
      expect(reg.apiVersion).toBe('aiwg.io/v1');
    });

    it('reads a previously written registry', async () => {
      const reg = { apiVersion: 'aiwg.io/v1' as const, kind: 'PackageRegistry' as const, packages: {} };
      await writePackageRegistry(reg, configDir);

      const read = await readPackageRegistry(configDir);
      expect(read.packages).toEqual({});
    });
  });

  // ── setPackageEntry / getPackageEntry ──────────────────────────────────────

  describe('setPackageEntry / getPackageEntry', () => {
    it('stores and retrieves an entry by key', async () => {
      await setPackageEntry('roko/ring-methodology', SAMPLE_ENTRY, configDir);

      const entry = await getPackageEntry('roko/ring-methodology', configDir);
      expect(entry).toBeDefined();
      expect(entry!.version).toBe('2026.3.4');
      expect(entry!.type).toBe('framework');
    });

    it('returns undefined for an unknown key', async () => {
      const entry = await getPackageEntry('nonexistent/package', configDir);
      expect(entry).toBeUndefined();
    });

    it('overwrites existing entry on upsert', async () => {
      await setPackageEntry('roko/ring-methodology', SAMPLE_ENTRY, configDir);
      await setPackageEntry('roko/ring-methodology', { ...SAMPLE_ENTRY, version: '2026.4.0' }, configDir);

      const entry = await getPackageEntry('roko/ring-methodology', configDir);
      expect(entry!.version).toBe('2026.4.0');
    });

    it('stores multiple entries independently', async () => {
      await setPackageEntry('owner/pkg-a', { ...SAMPLE_ENTRY, type: 'addon' }, configDir);
      await setPackageEntry('owner/pkg-b', { ...SAMPLE_ENTRY, type: 'framework' }, configDir);

      const a = await getPackageEntry('owner/pkg-a', configDir);
      const b = await getPackageEntry('owner/pkg-b', configDir);
      expect(a!.type).toBe('addon');
      expect(b!.type).toBe('framework');
    });
  });

  // ── removePackageEntry ────────────────────────────────────────────────────

  describe('removePackageEntry', () => {
    it('removes an existing entry and returns true', async () => {
      await setPackageEntry('roko/ring-methodology', SAMPLE_ENTRY, configDir);

      const removed = await removePackageEntry('roko/ring-methodology', configDir);
      expect(removed).toBe(true);

      const entry = await getPackageEntry('roko/ring-methodology', configDir);
      expect(entry).toBeUndefined();
    });

    it('returns false when key does not exist', async () => {
      const removed = await removePackageEntry('nonexistent/package', configDir);
      expect(removed).toBe(false);
    });

    it('does not affect other entries', async () => {
      await setPackageEntry('owner/pkg-a', SAMPLE_ENTRY, configDir);
      await setPackageEntry('owner/pkg-b', SAMPLE_ENTRY, configDir);

      await removePackageEntry('owner/pkg-a', configDir);

      const b = await getPackageEntry('owner/pkg-b', configDir);
      expect(b).toBeDefined();
    });
  });

  // ── recordDeployment ──────────────────────────────────────────────────────

  describe('recordDeployment', () => {
    it('adds a deployment record to an existing package', async () => {
      await setPackageEntry('owner/pkg', SAMPLE_ENTRY, configDir);

      await recordDeployment('owner/pkg', {
        projectPath: '/home/user/myproject',
        provider: 'claude',
        deployedAt: '2026-03-27T00:00:00.000Z',
      }, configDir);

      const entry = await getPackageEntry('owner/pkg', configDir);
      expect(entry!.deployedTo).toHaveLength(1);
      expect(entry!.deployedTo[0].provider).toBe('claude');
    });

    it('replaces an existing record for the same project + provider', async () => {
      await setPackageEntry('owner/pkg', SAMPLE_ENTRY, configDir);

      await recordDeployment('owner/pkg', {
        projectPath: '/home/user/myproject',
        provider: 'claude',
        deployedAt: '2026-03-01T00:00:00.000Z',
      }, configDir);

      await recordDeployment('owner/pkg', {
        projectPath: '/home/user/myproject',
        provider: 'claude',
        deployedAt: '2026-03-27T00:00:00.000Z',
      }, configDir);

      const entry = await getPackageEntry('owner/pkg', configDir);
      expect(entry!.deployedTo).toHaveLength(1);
      expect(entry!.deployedTo[0].deployedAt).toBe('2026-03-27T00:00:00.000Z');
    });

    it('adds distinct records for different providers', async () => {
      await setPackageEntry('owner/pkg', SAMPLE_ENTRY, configDir);

      await recordDeployment('owner/pkg', { projectPath: '/p', provider: 'claude', deployedAt: 'X' }, configDir);
      await recordDeployment('owner/pkg', { projectPath: '/p', provider: 'copilot', deployedAt: 'Y' }, configDir);

      const entry = await getPackageEntry('owner/pkg', configDir);
      expect(entry!.deployedTo).toHaveLength(2);
    });

    it('does nothing for an unknown key', async () => {
      // Should not throw
      await expect(
        recordDeployment('nonexistent/pkg', { projectPath: '/p', provider: 'claude', deployedAt: 'X' }, configDir)
      ).resolves.toBeUndefined();
    });
  });

  // ── listPackages ──────────────────────────────────────────────────────────

  describe('listPackages', () => {
    it('returns empty array when no packages are registered', async () => {
      const packages = await listPackages(configDir);
      expect(packages).toEqual([]);
    });

    it('returns a summary entry for each registered package', async () => {
      await setPackageEntry('roko/ring-methodology', SAMPLE_ENTRY, configDir);
      await setPackageEntry('owner/addon', { ...SAMPLE_ENTRY, type: 'addon' }, configDir);

      const packages = await listPackages(configDir);
      expect(packages).toHaveLength(2);

      const keys = packages.map((p) => p.key);
      expect(keys).toContain('roko/ring-methodology');
      expect(keys).toContain('owner/addon');
    });

    it('parses owner and name from key correctly', async () => {
      await setPackageEntry('roko/ring-methodology', SAMPLE_ENTRY, configDir);

      const packages = await listPackages(configDir);
      const pkg = packages[0];
      expect(pkg.owner).toBe('roko');
      expect(pkg.name).toBe('ring-methodology');
    });

    it('handles keys without a slash', async () => {
      await setPackageEntry('standalone', SAMPLE_ENTRY, configDir);

      const packages = await listPackages(configDir);
      const pkg = packages[0];
      expect(pkg.name).toBe('standalone');
      expect(pkg.owner).toBeUndefined();
    });

    it('includes deploy count', async () => {
      await setPackageEntry('owner/pkg', {
        ...SAMPLE_ENTRY,
        deployedTo: [
          { projectPath: '/p', provider: 'claude', deployedAt: 'X' },
          { projectPath: '/p', provider: 'copilot', deployedAt: 'Y' },
        ],
      }, configDir);

      const packages = await listPackages(configDir);
      expect(packages[0].deployCount).toBe(2);
    });
  });
});
