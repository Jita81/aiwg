/**
 * AIWG CLI Debug Logger
 *
 * Lightweight, no-dependency `debug()` helper for internal troubleshooting.
 * Gated behind the `AIWG_DEBUG` env var. When disabled (the default), calls
 * are effectively no-ops — scope matching is still performed but the message
 * is never formatted or emitted.
 *
 * Usage:
 *   import { debug } from './log.js';
 *   debug('cli:use:deploy', 'starting framework deploy', { framework });
 *
 * To enable:
 *   AIWG_DEBUG=1 aiwg use all                  # enable everything
 *   AIWG_DEBUG='cli:*' aiwg use all            # enable a scope prefix
 *   AIWG_DEBUG='cli:use:*,net:*' aiwg use all  # multiple globs
 *   AIWG_DEBUG='cli:*,-cli:use:deploy' ...     # subtract a sub-scope
 *
 * Scope syntax is a comma-separated list of globs where `*` matches any
 * run of non-colon characters. A leading `-` on a glob excludes matching
 * scopes. An empty / unset `AIWG_DEBUG` disables the logger entirely.
 *
 * Phase 4 of the CLI Stabilization Epic (#921). Phase 4.5 (#925) extends
 * this into a full structured-logging stack with JSONL files and provenance.
 */

/**
 * Parsed scope filter — glob patterns plus negation support.
 * Cached at module load; if AIWG_DEBUG changes mid-process (unusual for a
 * CLI invocation) we accept the stale value.
 */
interface ScopeFilter {
  includes: RegExp[];
  excludes: RegExp[];
  /** True iff the filter allows anything. Lets us fast-path to no-op. */
  any: boolean;
}

function compileScopeFilter(raw: string | undefined): ScopeFilter {
  if (!raw || raw === '0' || raw.toLowerCase() === 'false') {
    return { includes: [], excludes: [], any: false };
  }
  // Special: `1` / `true` / `*` means include-all.
  if (raw === '1' || raw.toLowerCase() === 'true' || raw === '*') {
    return { includes: [/.*/], excludes: [], any: true };
  }
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const includes: RegExp[] = [];
  const excludes: RegExp[] = [];
  for (const part of parts) {
    const negated = part.startsWith('-');
    const pattern = negated ? part.slice(1) : part;
    // Escape regex metachars except * which we turn into a non-greedy
    // non-colon match (so `cli:*` matches `cli:use` but not `cli:use:deploy`
    // unless the user explicitly types `cli:*:*`).
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('^' + escaped.replace(/\*/g, '[^:]*') + '$');
    (negated ? excludes : includes).push(regex);
  }
  return { includes, excludes, any: includes.length > 0 };
}

const FILTER = compileScopeFilter(process.env['AIWG_DEBUG']);

function matchesScope(scope: string): boolean {
  if (!FILTER.any) return false;
  for (const ex of FILTER.excludes) {
    if (ex.test(scope)) return false;
  }
  for (const inc of FILTER.includes) {
    if (inc.test(scope)) return true;
  }
  return false;
}

/**
 * Emit a debug log record to stderr. No-op when AIWG_DEBUG is unset or
 * the scope does not match.
 *
 * The first argument is the scope (e.g. `cli:use:deploy`, `net:npm-registry`).
 * Subsequent arguments follow `console.error` semantics — strings are
 * concatenated, objects pretty-printed via util.inspect.
 */
export function debug(scope: string, ...args: unknown[]): void {
  if (!matchesScope(scope)) return;
  // Cheap ISO timestamp. Phase 4.5 (#925) adds full provenance fields and
  // JSONL output; this is the minimum needed for terminal troubleshooting.
  const ts = new Date().toISOString();
  // Use console.error so debug output goes to stderr and never pollutes
  // piped stdout (e.g. `aiwg version --json | jq`).
  // eslint-disable-next-line no-console
  console.error(`[${ts}] [${scope}]`, ...args);
}

/**
 * Returns true iff debug logging is enabled for the given scope. Use this
 * only when you need to gate expensive preparation (e.g. JSON-stringifying
 * a large object) before calling debug().
 */
export function isDebugEnabled(scope: string): boolean {
  return matchesScope(scope);
}
