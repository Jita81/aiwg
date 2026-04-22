/**
 * Test helper: construct a mock HandlerContext for unit-testing CLI handlers.
 *
 * Usage:
 *   import { makeMockContext } from '../../helpers/mock-handler-context.js';
 *   const ctx = makeMockContext({ args: ['--json'], cwd: tmpDir });
 *   const result = await myHandler.execute(ctx);
 *
 * Phase 5 (#922) — gives every unit test a consistent way to build a context
 * without each test re-deriving the HandlerContext shape.
 */

import type { HandlerContext } from '../../src/cli/handlers/types.js';

export interface MockContextOptions {
  /** Command args after the command name. Default: []. */
  args?: string[];
  /** Raw argv including the command name. Default: ['<cmd>', ...args]. */
  rawArgs?: string[];
  /** Working directory. Default: process.cwd(). */
  cwd?: string;
  /** Framework root. Default: process.cwd() — handlers rarely need this in tests. */
  frameworkRoot?: string;
  /** Dry-run flag. Default: false. */
  dryRun?: boolean;
  /**
   * AbortSignal for cancellation tests. If omitted, handlers see `undefined`
   * (the optional field from Phase 3 #920 lets them safely ignore it).
   */
  signal?: AbortSignal;
}

export function makeMockContext(opts: MockContextOptions = {}): HandlerContext {
  const args = opts.args ?? [];
  const ctx: HandlerContext = {
    args,
    rawArgs: opts.rawArgs ?? ['<test-cmd>', ...args],
    cwd: opts.cwd ?? process.cwd(),
    frameworkRoot: opts.frameworkRoot ?? process.cwd(),
    dryRun: opts.dryRun ?? false,
  };
  if (opts.signal) ctx.signal = opts.signal;
  return ctx;
}

/**
 * Shorthand for a cancelled context — useful for signal-path tests.
 */
export function makeCancelledContext(reason: string = 'test-cancel'): HandlerContext {
  const controller = new AbortController();
  controller.abort(reason);
  return makeMockContext({ signal: controller.signal });
}

/**
 * Create a context and a companion AbortController so the test can abort
 * the handler mid-execution. Returns both for test ergonomics.
 */
export function makeCancellableContext(
  opts: Omit<MockContextOptions, 'signal'> = {},
): { ctx: HandlerContext; controller: AbortController } {
  const controller = new AbortController();
  const ctx = makeMockContext({ ...opts, signal: controller.signal });
  return { ctx, controller };
}
