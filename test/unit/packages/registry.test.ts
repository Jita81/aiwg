/**
 * Unit tests for package registry coordinator (parseRef + resolveRef)
 *
 * @source @src/packages/registry.ts
 * @implements #557
 */

import { describe, it, expect } from 'vitest';
import { parseRef } from '../../../src/packages/registry.js';

describe('parseRef', () => {
  describe('gitea shorthand (owner/name)', () => {
    it('parses owner/name without version', () => {
      const ref = parseRef('roko/ring-methodology');
      expect(ref.scheme).toBe('gitea');
      expect(ref.owner).toBe('roko');
      expect(ref.name).toBe('ring-methodology');
      expect(ref.version).toBeUndefined();
    });

    it('parses owner/name@version', () => {
      const ref = parseRef('roko/ring-methodology@v2026.3.4');
      expect(ref.scheme).toBe('gitea');
      expect(ref.owner).toBe('roko');
      expect(ref.name).toBe('ring-methodology');
      expect(ref.version).toBe('v2026.3.4');
    });

    it('preserves raw string', () => {
      const raw = 'owner/name@v1.0';
      const ref = parseRef(raw);
      expect(ref.raw).toBe(raw);
    });
  });

  describe('github shorthand', () => {
    it('parses github:owner/name', () => {
      const ref = parseRef('github:jmagly/aiwg');
      expect(ref.scheme).toBe('github');
      expect(ref.owner).toBe('jmagly');
      expect(ref.name).toBe('aiwg');
      expect(ref.version).toBeUndefined();
    });

    it('parses github:owner/name@version', () => {
      const ref = parseRef('github:jmagly/aiwg@v2026.3.0');
      expect(ref.scheme).toBe('github');
      expect(ref.owner).toBe('jmagly');
      expect(ref.name).toBe('aiwg');
      expect(ref.version).toBe('v2026.3.0');
    });
  });

  describe('HTTPS URL', () => {
    it('parses bare HTTPS URL without version', () => {
      const ref = parseRef('https://git.integrolabs.net/roko/ring-methodology.git');
      expect(ref.scheme).toBe('https');
      expect(ref.rawUrl).toBe('https://git.integrolabs.net/roko/ring-methodology.git');
      expect(ref.version).toBeUndefined();
    });

    it('parses HTTPS URL with @version suffix', () => {
      const ref = parseRef('https://git.integrolabs.net/roko/ring.git@v2026.1.0');
      expect(ref.scheme).toBe('https');
      expect(ref.rawUrl).toBe('https://git.integrolabs.net/roko/ring.git');
      expect(ref.version).toBe('v2026.1.0');
    });

    it('parses HTTPS URL with @main branch', () => {
      const ref = parseRef('https://git.example.com/owner/repo.git@main');
      expect(ref.rawUrl).toBe('https://git.example.com/owner/repo.git');
      expect(ref.version).toBe('main');
    });
  });

  describe('SSH URL', () => {
    it('parses git@ SSH URL', () => {
      const ref = parseRef('git@git.integrolabs.net:roko/ring-methodology.git');
      expect(ref.scheme).toBe('ssh');
      expect(ref.rawUrl).toBe('git@git.integrolabs.net:roko/ring-methodology.git');
    });
  });

  describe('HTTP URL', () => {
    it('parses http:// URL', () => {
      const ref = parseRef('http://localhost:3000/owner/repo.git');
      expect(ref.scheme).toBe('https'); // same branch as https
      expect(ref.rawUrl).toBe('http://localhost:3000/owner/repo.git');
    });
  });
});
