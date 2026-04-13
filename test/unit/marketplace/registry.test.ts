/**
 * Marketplace Registry Tests
 *
 * @source @src/marketplace/registry.ts
 * @issue #787
 */

import { describe, it, expect } from 'vitest';
import { getSource, listRegisteredSources } from '../../../src/marketplace/registry.js';

describe('registry', () => {
  it('registers clawhub and git by default', () => {
    const sources = listRegisteredSources();
    expect(sources).toContain('clawhub');
    expect(sources).toContain('git');
  });

  it('returns the clawhub adapter', () => {
    const adapter = getSource('clawhub');
    expect(adapter.source).toBe('clawhub');
  });

  it('returns the git adapter', () => {
    const adapter = getSource('git');
    expect(adapter.source).toBe('git');
  });

  it('clawhub validator accepts valid manifest', () => {
    const adapter = getSource('clawhub');
    const result = adapter.validate({
      name: 'test-plugin',
      version: '1.0.0',
      description: 'A test plugin',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('clawhub validator rejects missing fields', () => {
    const adapter = getSource('clawhub');
    const result = adapter.validate({ name: 'test' }); // missing version + description
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('clawhub validator warns on aiwg- prefix by non-AIWG author', () => {
    const adapter = getSource('clawhub');
    const result = adapter.validate({
      name: 'aiwg-suspicious',
      version: '1.0.0',
      description: 'not ours',
      author: 'Someone Else',
    });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('namespace collision');
  });

  it('git validator accepts any manifest with name and version', () => {
    const adapter = getSource('git');
    const result = adapter.validate({ name: 'x', version: '1' });
    expect(result.valid).toBe(true);
  });
});
