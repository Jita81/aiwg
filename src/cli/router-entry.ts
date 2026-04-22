#!/usr/bin/env npx tsx
/**
 * Router Entry Point
 *
 * Entry point for running the TypeScript router via tsx.
 * This file is executed by router-loader.mjs.
 *
 * @implements @.aiwg/architecture/decisions/ADR-001-unified-extension-system.md
 * @issue #48
 */

import { run } from './router.js';

const args = process.argv.slice(2);

// Force explicit exit after run() resolves. Without this, unawaited background
// work inside handlers (deferred promises, libuv worker handles, open keepalive
// sockets) keeps the event loop alive — the symptom is a command that prints
// its "Next steps" output and then sits for minutes before exiting. A CLI that
// has finished its work should release the shell immediately.
run(args, { cwd: process.cwd() })
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  });
