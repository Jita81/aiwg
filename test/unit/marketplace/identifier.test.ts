/**
 * Marketplace Identifier Parser Tests
 *
 * @source @src/marketplace/identifier.ts
 * @issue #787
 */

import { describe, it, expect } from 'vitest';
import { parseIdentifier, formatIdentifier } from '../../../src/marketplace/identifier.js';

describe('parseIdentifier', () => {
  it('parses a simple clawhub identifier', () => {
    const result = parseIdentifier('clawhub:aiwg/sdlc');
    expect(result.source).toBe('clawhub');
    expect(result.packageId).toBe('aiwg/sdlc');
    expect(result.version).toBeUndefined();
  });

  it('parses a cursor identifier with publisher.package format', () => {
    const result = parseIdentifier('cursor:publisher.package');
    expect(result.source).toBe('cursor');
    expect(result.packageId).toBe('publisher.package');
  });

  it('parses a codex identifier with version', () => {
    const result = parseIdentifier('codex:some-plugin@1.2.0');
    expect(result.source).toBe('codex');
    expect(result.packageId).toBe('some-plugin');
    expect(result.version).toBe('1.2.0');
  });

  it('parses a claude identifier with plugin name fragment', () => {
    const result = parseIdentifier('claude:user/repo#plugin');
    expect(result.source).toBe('claude');
    expect(result.packageId).toBe('user/repo#plugin');
  });

  it('parses a git URL preserving @ symbols', () => {
    const result = parseIdentifier('git:https://github.com/foo/bar.git');
    expect(result.source).toBe('git');
    expect(result.packageId).toBe('https://github.com/foo/bar.git');
    expect(result.version).toBeUndefined();
  });

  it('parses a git URL with SSH format (has @)', () => {
    // SSH URLs contain @ but git source does not treat it as version separator
    const result = parseIdentifier('git:git@github.com:foo/bar.git');
    expect(result.source).toBe('git');
    expect(result.packageId).toBe('git@github.com:foo/bar.git');
    expect(result.version).toBeUndefined();
  });

  it('throws on missing colon', () => {
    expect(() => parseIdentifier('clawhub-aiwg-sdlc')).toThrow(/Expected format/);
  });

  it('throws on unknown source', () => {
    expect(() => parseIdentifier('unknown:some/package')).toThrow(/Unknown marketplace source/);
  });

  it('throws on empty package id', () => {
    expect(() => parseIdentifier('clawhub:')).toThrow(/Empty package id/);
  });

  it('normalizes source case', () => {
    const result = parseIdentifier('CLAWHUB:aiwg/sdlc');
    expect(result.source).toBe('clawhub');
  });
});

describe('formatIdentifier', () => {
  it('round-trips without version', () => {
    const id = 'clawhub:aiwg/sdlc';
    expect(formatIdentifier(parseIdentifier(id))).toBe(id);
  });

  it('round-trips with version', () => {
    const id = 'codex:plugin@1.0.0';
    expect(formatIdentifier(parseIdentifier(id))).toBe(id);
  });

  it('formats with version suffix', () => {
    expect(
      formatIdentifier({ source: 'clawhub', packageId: 'aiwg/sdlc', version: '2.0.0' })
    ).toBe('clawhub:aiwg/sdlc@2.0.0');
  });
});
