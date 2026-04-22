/**
 * AIWG Structured Errors
 *
 * Every intentional error thrown by CLI code should be an `AiwgError` with:
 *   - `code`   — stable UPPER_SNAKE_CASE identifier (ERR_CATEGORY_REASON)
 *   - `exitCode` — process exit code (see EXIT_CODES table below)
 *   - `hint`   — optional one-line user-facing hint with a suggested next action
 *   - `cause`  — optional underlying error for chain preservation (ES2022)
 *
 * The top-level formatter in `bin/aiwg.mjs` prints a single-line message and
 * only reveals stack traces when `AIWG_DEBUG=1` or `--verbose` is set.
 *
 * Code naming: category-prefixed uppercase snake_case.
 *   ERR_CONFIG_*     — problems reading/writing .aiwg/aiwg.config
 *   ERR_NETWORK_*    — timeouts, unreachable services, HTTP errors
 *   ERR_USAGE_*      — bad flags, unknown commands, missing required args
 *   ERR_FS_*         — filesystem errors (permission, ENOENT outside config)
 *   ERR_SANDBOX_*    — sandbox-specific failures
 *   ERR_INTERNAL     — unexpected bugs (last resort; prefer a specific code)
 *
 * Phase 4 of the CLI Stabilization Epic (#921).
 */

/**
 * Process exit codes used by the CLI. Pragmatic subset of sysexits.h —
 * enough categorization for scripts to branch on without full sysexits
 * ceremony.
 */
export const EXIT_CODES = {
  /** Command completed successfully. */
  OK: 0,
  /** General / uncategorized failure. */
  GENERAL: 1,
  /** User error: unknown command, bad flag, missing required argument. */
  USAGE: 2,
  /** Filesystem write failure: permission denied, disk full, read-only. */
  CANT_CREATE: 73,
  /** Config file missing, malformed, or otherwise unusable. */
  CONFIG: 78,
  /** Interrupted by SIGINT (Ctrl-C). 128 + 2. */
  INTERRUPTED: 130,
  /** Terminated by SIGTERM. 128 + 15. */
  TERMINATED: 143,
} as const;

export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES];

export interface AiwgErrorInit {
  /** Stable UPPER_SNAKE_CASE error code (ERR_CATEGORY_REASON). */
  code: string;
  /** Human-readable single-line message. */
  message: string;
  /** Process exit code. Defaults to EXIT_CODES.GENERAL (1). */
  exitCode?: number;
  /** Optional next-action hint printed after the error line. */
  hint?: string;
  /** Optional underlying cause for chain preservation. */
  cause?: unknown;
}

/**
 * Structured CLI error with a stable code and a prescribed exit code.
 *
 * Always throw these from handler code instead of bare `Error` so the
 * top-level formatter can render consistent output and so tests can assert
 * on the error code rather than brittle message strings.
 */
export class AiwgError extends Error {
  public readonly code: string;
  public readonly exitCode: number;
  public readonly hint?: string;

  constructor(init: AiwgErrorInit) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = 'AiwgError';
    this.code = init.code;
    this.exitCode = init.exitCode ?? EXIT_CODES.GENERAL;
    if (init.hint !== undefined) this.hint = init.hint;
    // Stabilize stack trace capture across engines.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AiwgError);
    }
  }
}

/**
 * Convenience checker — ts-narrows an unknown to AiwgError. Avoids importing
 * the class just for a typeof-like check at catch sites.
 */
export function isAiwgError(err: unknown): err is AiwgError {
  return err instanceof AiwgError;
}

/**
 * Format an error for terminal output. Always returns a single-line primary
 * message; `hint` (if present) is returned as a second line; `stack` and the
 * `cause` chain are included only when verbose is true.
 *
 * Does NOT color the output — caller chooses whether to apply ui.red() etc.
 * so non-TTY stderr paths stay ANSI-clean.
 */
export function formatError(err: unknown, opts: { verbose?: boolean } = {}): string {
  const lines: string[] = [];
  if (isAiwgError(err)) {
    lines.push(`aiwg: error: ${err.message} (code: ${err.code})`);
    if (err.hint) lines.push(`  hint: ${err.hint}`);
    if (opts.verbose) {
      if (err.stack) lines.push(err.stack);
      if (err.cause) {
        lines.push('  cause:');
        lines.push(formatError(err.cause, { verbose: true }));
      }
    }
  } else if (err instanceof Error) {
    lines.push(`aiwg: error: ${err.message}`);
    if (opts.verbose && err.stack) lines.push(err.stack);
  } else {
    lines.push(`aiwg: error: ${String(err)}`);
  }
  return lines.join('\n');
}

/**
 * Resolve the exit code to use for an error. Non-AiwgError throws and plain
 * strings map to EXIT_CODES.GENERAL.
 */
export function exitCodeFor(err: unknown): number {
  if (isAiwgError(err)) return err.exitCode;
  return EXIT_CODES.GENERAL;
}

/**
 * Convert any thrown value into a uniform HandlerResult shape, preserving
 * AiwgError's semantic fields (code, exitCode, hint) where present.
 *
 * This is the bridge between the in-handler `try { ... } catch (err) { ... }`
 * pattern and the HandlerResult contract the router expects. Use it in every
 * handler's top-level catch:
 *
 *   try {
 *     await doWork(ctx);
 *     return { exitCode: 0 };
 *   } catch (err) {
 *     return handlerResultFromError(err);
 *   }
 *
 * Non-AiwgError throws map to `{ exitCode: 1, message, error }`. AiwgError
 * throws carry their `exitCode` (USAGE=2, CONFIG=78, CANT_CREATE=73, etc.)
 * plus the `hint` merged into the message for single-line output.
 *
 * Phase 5 of the CLI Stabilization Epic (#922) — unblocks the exit-code
 * propagation from Phase 4 (#921) that was previously flattened to 1.
 */
export function handlerResultFromError(err: unknown): {
  exitCode: number;
  message: string;
  error: Error;
} {
  if (isAiwgError(err)) {
    const message = err.hint ? `${err.message} — hint: ${err.hint}` : err.message;
    return { exitCode: err.exitCode, message, error: err };
  }
  if (err instanceof Error) {
    return { exitCode: EXIT_CODES.GENERAL, message: err.message, error: err };
  }
  const message = String(err);
  return { exitCode: EXIT_CODES.GENERAL, message, error: new Error(message) };
}
