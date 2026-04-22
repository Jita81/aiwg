#!/usr/bin/env node

/**
 * AIWG CLI Entry Point
 *
 * Single entry point for the `aiwg` command. Dispatches directly to the
 * compiled router at `dist/src/cli/router.js` with no intermediate tsx fork
 * or facade layer — one Node process per invocation.
 *
 * Responsibilities:
 *   1. Handle channel-switching commands (--use-dev, --use-edge, --use-stable)
 *   2. Fire a non-blocking background update check
 *   3. Resolve the compiled router (installed path or dev-repo override)
 *   4. Dispatch to router.run(args), then process.exit() deterministically
 *
 * This file is intentionally minimal. All command logic lives in the router
 * and its handlers. If you find yourself adding business logic here, it
 * probably belongs in a handler instead.
 *
 * @module bin/aiwg
 * @implements #919
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync } from 'fs';
import { checkForUpdates } from '../src/update/checker.mjs';
import { loadConfig } from '../src/channel/manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

/**
 * Resolve the path to the compiled router.
 *
 * In dev mode (AIWG --use-dev set), point at the dev repo's `dist/`. In
 * stable/next/edge/nightly mode, use this installed package's `dist/`.
 *
 * If the compiled router is missing (fresh clone without `npm run build`),
 * emit a clear error and exit rather than falling back to a tsx fork.
 */
async function resolveRouterPath() {
  const config = await loadConfig();
  if (config.devMode && config.edgePath && config.edgePath !== packageRoot) {
    const devRouter = path.join(config.edgePath, 'dist', 'src', 'cli', 'router.js');
    if (!existsSync(devRouter)) {
      console.error(`Dev mode: compiled router not found at ${devRouter}`);
      console.error(`  Run: (cd ${config.edgePath} && npm run build)`);
      console.error(`  Or switch back: aiwg --use-stable`);
      process.exit(1);
    }
    return devRouter;
  }
  const installedRouter = path.join(packageRoot, 'dist', 'src', 'cli', 'router.js');
  if (!existsSync(installedRouter)) {
    console.error(`Compiled router not found at ${installedRouter}`);
    console.error(`  This is a packaging bug. Please report it at:`);
    console.error(`    https://git.integrolabs.net/roctinam/aiwg/issues`);
    process.exit(1);
  }
  return installedRouter;
}

async function main() {
  const args = process.argv.slice(2);

  // Channel-switching commands — handled before anything else so they work
  // even when the router can't load (e.g. fixing a broken dev-mode pointer).
  if (args[0] === '--use-main' || args[0] === '--use-edge') {
    const { switchToEdge } = await import('../src/channel/manager.mjs');
    await switchToEdge();
    return;
  }
  if (args[0] === '--use-dev') {
    const { switchToDev } = await import('../src/channel/manager.mjs');
    const devPath = args[1] || process.cwd();
    await switchToDev(devPath);
    return;
  }
  if (args[0] === '--use-stable' || args[0] === '--use-npm') {
    const { switchToStable } = await import('../src/channel/manager.mjs');
    await switchToStable();
    return;
  }

  // Fire-and-forget update check. Tracked so main() can optionally await
  // briefly at exit, but the command itself never blocks on it.
  const updateCheckPromise = checkForUpdates().catch(() => {
    // Silently ignore update check failures
  });

  // Direct in-process dispatch — no tsx fork, no facade, no router-loader.
  const routerPath = await resolveRouterPath();
  const { run } = await import('file://' + routerPath);
  await run(args, { cwd: process.cwd() });

  return { updateCheckPromise };
}

// Give the background update check a brief grace window before forcing exit.
// Without an explicit process.exit(), unawaited promises (HTTPS keepalive
// sockets, libuv worker handles, buffered readline from the update prompt)
// can keep the event loop alive for minutes on slow networks or detached
// terminals — the "30s command that hangs for 5 minutes" symptom we debugged
// in #924. 1500ms is plenty for a normal npm registry check; if the check
// is slower the user still gets their shell back promptly and the check
// runs again on the next invocation.
// Lazy-loaded structured error formatter. Imported on demand so a failing
// top-level catch doesn't itself throw by trying to load a missing dist/.
async function formatAndExit(error, fallbackCode = 1) {
  // Show stack trace when the user has opted in to verbose diagnostics.
  const verbose =
    process.env.AIWG_DEBUG === '1' ||
    process.env.AIWG_DEBUG?.toLowerCase() === 'true' ||
    process.env.DEBUG === '1' ||
    process.argv.includes('--verbose') ||
    process.argv.includes('-vv') ||
    process.argv.includes('-vvv');

  let exitCode = fallbackCode;
  try {
    const errorsMod = await import(
      'file://' + path.join(packageRoot, 'dist', 'src', 'cli', 'errors.js')
    );
    const { formatError, exitCodeFor } = errorsMod;
    const formatted = formatError(error, { verbose });
    // Strip ANSI colors when stderr isn't a TTY so piped output stays clean.
    process.stderr.write(formatted + '\n');
    exitCode = exitCodeFor(error);
  } catch {
    // Fallback path: dist/ missing or errors.js failed to load. Print a
    // minimal message so we never silently exit.
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`aiwg: error: ${msg}\n`);
    if (verbose && error instanceof Error && error.stack) {
      process.stderr.write(error.stack + '\n');
    }
  }
  process.exit(exitCode);
}

// Install process-level handlers for unhandled failures so the same
// structured formatter renders them instead of Node's default crash dump.
process.on('uncaughtException', (err) => {
  formatAndExit(err, 1).catch(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
  formatAndExit(reason, 1).catch(() => process.exit(1));
});

main()
  .then(async (result) => {
    const updateCheckPromise = result?.updateCheckPromise;
    if (updateCheckPromise) {
      const GRACE_MS = 1500;
      await Promise.race([
        updateCheckPromise,
        new Promise((resolve) => setTimeout(resolve, GRACE_MS).unref()),
      ]);
    }
    process.exit(0);
  })
  .catch((error) => formatAndExit(error, 1));
