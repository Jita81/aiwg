import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for live provider UAT tests (invokes real claude/codex).
 *
 * NOT included in CI — run on demand only:
 *   npm run uat:claude   (claude provider only)
 *   npm run uat:codex    (codex provider only)
 *   npm run uat:live     (both)
 *
 * Requirements:
 *   - claude: ANTHROPIC_API_KEY set, claude CLI authenticated
 *   - codex:  OPENAI_API_KEY set, codex CLI installed
 */
export default defineConfig({
  root: path.resolve(__dirname, '..'),
  test: {
    include: ['test/uat/ralph-live-*.uat.ts'],
    environment: 'node',
    globals: false,
    clearMocks: false,
    mockReset: false,
    restoreMocks: false,
    testTimeout: 360000,  // 6 min per test (agent sessions can be slow)
    hookTimeout: 30000,
    reporters: ['verbose'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,  // Run live tests sequentially to avoid API rate limits
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
    extensions: ['.ts', '.js', '.json'],
  },
});
