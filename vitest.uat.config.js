import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for UAT tests.
 *
 * Run on demand:
 *   npm run uat
 *   npx vitest run --config vitest.uat.config.js
 *
 * UAT tests exercise real code paths with stub providers — they are not
 * included in CI (test:ci) or the default test run (npm test).
 */
export default defineConfig({
  test: {
    include: ['test/uat/**/*.uat.ts', 'test/uat/**/*.test.ts'],
    environment: 'node',
    globals: false,
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    testTimeout: 120000,
    hookTimeout: 30000,
    reporters: ['verbose'],
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.ts', '.js', '.json'],
  },
});
