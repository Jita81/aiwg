/**
 * AIWG CLI Structured Logger
 *
 * Two public surfaces:
 *
 *   debug(scope, msg, ...args)   — cheap, env-gated, stderr-only diagnostic log.
 *                                   Unchanged from Phase 4 (#921). Use this for
 *                                   ad-hoc troubleshooting prints that no-op
 *                                   unless AIWG_DEBUG is set.
 *
 *   getLogger(scope)             — structured Logger (this file's main surface).
 *                                   Every record carries full provenance
 *                                   metadata (ts, invocation_id, command, user,
 *                                   cwd, aiwg_version, git_sha, channel, node,
 *                                   platform, tty, ci) and is written to both
 *                                   stderr (pretty) and ~/.aiwg/logs/aiwg-YYYY-
 *                                   MM-DD.jsonl (structured).
 *
 * Phase 4.5 of the CLI Stabilization Epic (#925) extends the Phase 4 debug()
 * helper into a full structured-logging stack.
 *
 * To enable debug-level output:
 *   AIWG_DEBUG=1 aiwg use all                    # enable everything (debug)
 *   AIWG_LOG_LEVEL=debug aiwg use all            # same
 *   AIWG_LOG_LEVEL=info aiwg use all             # info and above
 *   aiwg use all -v                              # info (verbose)
 *   aiwg use all -vv                             # debug
 *   aiwg use all --quiet                         # error only
 *   AIWG_LOG_FILE=/tmp/aiwg.jsonl aiwg use all   # override JSONL path
 *   AIWG_LOG_DISABLE=1 aiwg --version            # skip all logging
 *
 * Scope syntax (passed to both the debug() filter AND the Logger):
 *   'cli:*'                 — any cli:* scope
 *   'cli:use:*,net:*'       — multiple globs
 *   'cli:*,-cli:use:deploy' — include/exclude
 */

import { hostname, platform, arch, userInfo, homedir, release } from 'os';
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import path from 'path';

// ── Log levels ────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

function coerceLevel(raw: string | undefined): LogLevel | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'debug' || lower === 'info' || lower === 'warn' || lower === 'error' || lower === 'silent') {
    return lower as LogLevel;
  }
  if (lower === '1' || lower === 'true' || lower === 'all') return 'debug';
  if (lower === '0' || lower === 'false' || lower === 'off') return 'silent';
  return null;
}

// ── Scope filter (reused for debug() and Logger) ──────────────────────────────

interface ScopeFilter {
  includes: RegExp[];
  excludes: RegExp[];
  any: boolean;
}

function compileScopeFilter(raw: string | undefined): ScopeFilter {
  if (!raw || raw === '0' || raw.toLowerCase() === 'false') {
    return { includes: [], excludes: [], any: false };
  }
  if (raw === '1' || raw.toLowerCase() === 'true' || raw === '*') {
    return { includes: [/.*/], excludes: [], any: true };
  }
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const includes: RegExp[] = [];
  const excludes: RegExp[] = [];
  for (const part of parts) {
    const negated = part.startsWith('-');
    const pattern = negated ? part.slice(1) : part;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('^' + escaped.replace(/\*/g, '[^:]*') + '$');
    (negated ? excludes : includes).push(regex);
  }
  return { includes, excludes, any: includes.length > 0 };
}

function scopeMatches(filter: ScopeFilter, scope: string): boolean {
  if (!filter.any) return false;
  for (const ex of filter.excludes) {
    if (ex.test(scope)) return false;
  }
  for (const inc of filter.includes) {
    if (inc.test(scope)) return true;
  }
  return false;
}

// ── Provenance (stamped on every record) ──────────────────────────────────────

interface Provenance {
  pid: number;
  ppid: number;
  user: string;
  host: string;
  cwd: string;
  aiwg_version: string;
  git_sha?: string;
  channel: string;
  node_version: string;
  platform: string;
  arch: string;
  os_release: string;
  tty: boolean;
  ci: boolean;
  invocation_id: string;
}

let cachedProvenance: Provenance | null = null;
let invocationIdOverride: string | null = null;

/**
 * Override the invocation ID discovered by the logger. Called from the
 * top-level entry (bin/aiwg.mjs) once the ID has been minted or inherited
 * from `AIWG_INVOCATION_ID`. Safe to call before the logger is used.
 */
export function setInvocationId(id: string): void {
  invocationIdOverride = id;
  if (cachedProvenance) cachedProvenance.invocation_id = id;
}

export function getInvocationId(): string {
  if (invocationIdOverride) return invocationIdOverride;
  if (cachedProvenance) return cachedProvenance.invocation_id;
  // Fallback: a synthesized id if the entry never called setInvocationId
  // (typically only happens in unit tests that import the logger directly).
  return process.env['AIWG_INVOCATION_ID'] ?? 'unknown';
}

function detectCI(): boolean {
  for (const k of ['CI', 'CONTINUOUS_INTEGRATION', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI', 'TRAVIS', 'BUILDKITE', 'JENKINS_URL', 'TF_BUILD', 'TEAMCITY_VERSION']) {
    const v = process.env[k];
    if (v && v !== '0' && v.toLowerCase() !== 'false') return true;
  }
  return false;
}

function detectVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const require = (0, eval)('require');
    const fs = require('fs');
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.name === 'aiwg') return pkg.version;
        } catch { /* keep walking */ }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch { /* fall through */ }
  return 'unknown';
}

function detectGitSha(): string | undefined {
  // Lightweight git detection: look for aiwg repo's .git/HEAD. No git CLI spawn.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const require = (0, eval)('require');
    const fs = require('fs');
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      const gitDir = path.join(dir, '.git');
      if (fs.existsSync(gitDir)) {
        const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf-8').trim();
        if (head.startsWith('ref:')) {
          const refPath = path.join(gitDir, head.slice(5).trim());
          if (fs.existsSync(refPath)) {
            return fs.readFileSync(refPath, 'utf-8').trim().slice(0, 8);
          }
        }
        return head.slice(0, 8);
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch { /* non-git installs are fine */ }
  return undefined;
}

function detectChannel(): string {
  // Minimal detection without loading the full channel manager (circular risk).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const require = (0, eval)('require');
    const fs = require('fs');
    const channelFile = path.join(homedir(), '.aiwg', 'channel.json');
    if (fs.existsSync(channelFile)) {
      const json = JSON.parse(fs.readFileSync(channelFile, 'utf-8'));
      if (json.devMode) return 'dev';
      if (json.channel) return json.channel;
    }
  } catch { /* ignore */ }
  return 'stable';
}

function getProvenance(): Provenance {
  if (cachedProvenance) return cachedProvenance;
  const id = invocationIdOverride ?? process.env['AIWG_INVOCATION_ID'] ?? 'unknown';
  cachedProvenance = {
    pid: process.pid,
    ppid: process.ppid,
    user: userInfo().username,
    host: hostname(),
    cwd: process.cwd(),
    aiwg_version: detectVersion(),
    git_sha: detectGitSha(),
    channel: detectChannel(),
    node_version: process.version,
    platform: platform(),
    arch: arch(),
    os_release: release(),
    tty: process.stderr.isTTY ?? false,
    ci: detectCI(),
    invocation_id: id,
  };
  return cachedProvenance;
}

// ── Config (resolved once, cached) ────────────────────────────────────────────

interface LoggerConfig {
  level: LogLevel;
  scopeFilter: ScopeFilter;
  logFile: string | null;
  disabled: boolean;
  retentionDays: number;
}

let cachedConfig: LoggerConfig | null = null;
let currentLevelOverride: LogLevel | null = null;

function resolveConfig(): LoggerConfig {
  if (cachedConfig) return cachedConfig;

  const disabled = process.env['AIWG_LOG_DISABLE'] === '1' ||
    process.env['AIWG_LOG_DISABLE']?.toLowerCase() === 'true';

  // Precedence: AIWG_LOG_LEVEL > AIWG_DEBUG (implies debug) > default info.
  // When AIWG_LOG_DISABLE is set, silent wins.
  let level: LogLevel = 'info';
  if (disabled) {
    level = 'silent';
  } else {
    const envLevel = coerceLevel(process.env['AIWG_LOG_LEVEL']);
    if (envLevel) level = envLevel;
    else if (process.env['AIWG_DEBUG']) level = 'debug';
  }

  // AIWG_LOG_LEVEL may carry either a bare level ('debug') or a scope filter
  // ('cli:use:*=debug,net:*=info'). The scope-level form is richer; keep both
  // paths for backward compat. Today the simple form is supported.
  const scopeFilter = compileScopeFilter(process.env['AIWG_DEBUG']);

  // Log file: env override wins; default is ~/.aiwg/logs/aiwg-YYYY-MM-DD.jsonl.
  let logFile: string | null = null;
  if (!disabled) {
    if (process.env['AIWG_LOG_FILE']) {
      logFile = process.env['AIWG_LOG_FILE'];
    } else {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      logFile = path.join(homedir(), '.aiwg', 'logs', `aiwg-${today}.jsonl`);
    }
  }

  const retentionDays = (() => {
    const raw = process.env['AIWG_LOG_RETENTION_DAYS'];
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 30;
  })();

  cachedConfig = { level, scopeFilter, logFile, disabled, retentionDays };
  return cachedConfig;
}

/**
 * Override the log level from code (typically from bin/aiwg.mjs after
 * parsing -v / -vv / --quiet flags). Must be called before the first
 * Logger method to affect records.
 */
export function setLogLevel(level: LogLevel): void {
  currentLevelOverride = level;
  if (cachedConfig) cachedConfig.level = level;
}

function effectiveLevel(): LogLevel {
  if (currentLevelOverride) return currentLevelOverride;
  return resolveConfig().level;
}

// ── JSONL sink ────────────────────────────────────────────────────────────────

let logFileEnsured = false;

function ensureLogDir(logFile: string): void {
  if (logFileEnsured) return;
  try {
    mkdirSync(path.dirname(logFile), { recursive: true });
    logFileEnsured = true;
  } catch {
    // Disk full / permission denied — downgrade to stderr-only silently.
    logFileEnsured = true; // don't retry per-record
  }
}

/**
 * Prune daily log files older than `retentionDays`. Run once at startup
 * (bounded work: one directory listing). Silent on failure.
 */
export function pruneOldLogs(): void {
  const cfg = resolveConfig();
  if (cfg.disabled || !cfg.logFile) return;
  const dir = path.dirname(cfg.logFile);
  if (!existsSync(dir)) return;
  const cutoff = Date.now() - cfg.retentionDays * 24 * 60 * 60 * 1000;
  try {
    const entries = readdirSync(dir);
    for (const name of entries) {
      if (!/^aiwg-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
      const full = path.join(dir, name);
      try {
        const s = statSync(full);
        if (s.mtimeMs < cutoff) unlinkSync(full);
      } catch { /* ignore per-file errors */ }
    }
  } catch { /* ignore listing errors */ }
}

function writeJsonl(record: object): void {
  const cfg = resolveConfig();
  if (cfg.disabled || !cfg.logFile) return;
  try {
    ensureLogDir(cfg.logFile);
    // Sync append — cheap for typical record sizes, simpler than backpressure
    // management. Can move to async append with a tiny queue if we see perf
    // impact on hot paths.
    appendFileSync(cfg.logFile, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    // Never fail the command because logging failed.
  }
}

// ── Span support ──────────────────────────────────────────────────────────────

function shortSpanId(): string {
  // 6 base32 chars = ~30 bits of entropy — enough for per-invocation uniqueness.
  const buf = new Uint8Array(4);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < 4; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  const base32 = '0123456789abcdefghjkmnpqrstvwxyz';
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const byte of buf) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += base32[(acc >> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  return out.slice(0, 6);
}

export interface Span {
  /** Close the span and emit a duration record. */
  end(msg?: string, fields?: Record<string, unknown>): void;
  /** Record a debug/info event within the span. */
  info(msg: string, fields?: Record<string, unknown>): void;
  debug(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

// ── Logger ────────────────────────────────────────────────────────────────────

export interface Logger {
  /** Log at debug level. */
  debug(msg: string, fields?: Record<string, unknown>): void;
  /** Log at info level. */
  info(msg: string, fields?: Record<string, unknown>): void;
  /** Log at warn level. */
  warn(msg: string, fields?: Record<string, unknown>): void;
  /** Log at error level. */
  error(msg: string, fields?: Record<string, unknown>): void;
  /** Spawn a child logger with a nested scope and merged extra fields. */
  child(opts: { scope?: string; fields?: Record<string, unknown> }): Logger;
  /** Start a named span. Call span.end() to emit duration_ms. */
  span(name: string, fields?: Record<string, unknown>): Span;
}

interface LoggerContext {
  scope: string;
  parentSpanId: string;
  fields: Record<string, unknown>;
}

function shouldLog(level: LogLevel, scope: string): boolean {
  const cfg = resolveConfig();
  if (cfg.disabled) return false;
  if (LEVEL_ORDER[level] < LEVEL_ORDER[effectiveLevel()]) return false;
  // AIWG_DEBUG scope filter, when set, acts as an allow-list for debug-level
  // records only. Higher levels always pass.
  if (level === 'debug' && cfg.scopeFilter.any) {
    return scopeMatches(cfg.scopeFilter, scope);
  }
  return true;
}

function emit(
  level: LogLevel,
  scope: string,
  msg: string,
  ctx: LoggerContext,
  spanId: string,
  extraFields?: Record<string, unknown>,
): void {
  if (!shouldLog(level, scope)) return;

  const now = new Date();
  const prov = getProvenance();

  const record: Record<string, unknown> = {
    ts: now.toISOString(),
    ts_unix_ms: now.getTime(),
    invocation_id: prov.invocation_id,
    span_id: spanId,
    parent_span_id: ctx.parentSpanId,
    scope,
    level,
    msg,
    pid: prov.pid,
    ppid: prov.ppid,
    user: prov.user,
    host: prov.host,
    cwd: prov.cwd,
    aiwg_version: prov.aiwg_version,
    channel: prov.channel,
    node_version: prov.node_version,
    platform: prov.platform,
    arch: prov.arch,
    os_release: prov.os_release,
    tty: prov.tty,
    ci: prov.ci,
    ...(prov.git_sha ? { git_sha: prov.git_sha } : {}),
    ...ctx.fields,
    ...(extraFields ?? {}),
  };

  // Pretty output to stderr (human-readable). Gated by effective level.
  // File records always carry full provenance; terminal output is condensed
  // so operators aren't drowned in metadata.
  const colorReset = '\x1b[0m';
  const color = level === 'error' ? '\x1b[31m' :
                level === 'warn'  ? '\x1b[33m' :
                level === 'info'  ? '\x1b[36m' :
                                    '\x1b[2m';
  const useColor = prov.tty && !process.env['NO_COLOR'];
  const prefix = useColor ? `${color}[${level}]${colorReset}` : `[${level}]`;
  const line = `${prefix} ${scope ? scope + ' ' : ''}${msg}`;

  // eslint-disable-next-line no-console
  console.error(line);

  // JSONL sink (structured, always full provenance).
  writeJsonl(record);
}

export function getLogger(scope: string = 'cli', extraFields: Record<string, unknown> = {}): Logger {
  return makeLogger({ scope, parentSpanId: '0', fields: extraFields });
}

function makeLogger(ctx: LoggerContext): Logger {
  const currentSpanId = ctx.parentSpanId === '0' ? '0' : ctx.parentSpanId;
  return {
    debug(msg, fields) { emit('debug', ctx.scope, msg, ctx, currentSpanId, fields); },
    info(msg, fields)  { emit('info',  ctx.scope, msg, ctx, currentSpanId, fields); },
    warn(msg, fields)  { emit('warn',  ctx.scope, msg, ctx, currentSpanId, fields); },
    error(msg, fields) { emit('error', ctx.scope, msg, ctx, currentSpanId, fields); },
    child(opts) {
      return makeLogger({
        scope: opts.scope ?? ctx.scope,
        parentSpanId: ctx.parentSpanId,
        fields: { ...ctx.fields, ...(opts.fields ?? {}) },
      });
    },
    span(name, fields) {
      const spanId = shortSpanId();
      const started = Date.now();
      const spanCtx: LoggerContext = {
        scope: ctx.scope,
        parentSpanId: spanId,
        fields: { ...ctx.fields, ...(fields ?? {}) },
      };
      emit('debug', ctx.scope, `span:begin:${name}`, spanCtx, spanId, { span_name: name });
      return {
        end(endMsg, endFields) {
          const duration_ms = Date.now() - started;
          emit('debug', ctx.scope, endMsg ?? `span:end:${name}`, spanCtx, spanId, {
            span_name: name,
            duration_ms,
            ...(endFields ?? {}),
          });
        },
        debug(msg, f) { emit('debug', ctx.scope, msg, spanCtx, spanId, f); },
        info(msg, f)  { emit('info',  ctx.scope, msg, spanCtx, spanId, f); },
        warn(msg, f)  { emit('warn',  ctx.scope, msg, spanCtx, spanId, f); },
        error(msg, f) { emit('error', ctx.scope, msg, spanCtx, spanId, f); },
      };
    },
  };
}

// ── Phase 4 debug() helper (unchanged, kept for backward compat) ──────────────

const DEBUG_FILTER = compileScopeFilter(process.env['AIWG_DEBUG']);

/**
 * Emit a debug log record to stderr. No-op when AIWG_DEBUG is unset or
 * the scope does not match.
 *
 * Backward-compatible with the Phase 4 API. New code should prefer
 * getLogger(scope).debug() which also writes to the JSONL sink.
 */
export function debug(scope: string, ...args: unknown[]): void {
  if (!scopeMatches(DEBUG_FILTER, scope)) return;
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.error(`[${ts}] [${scope}]`, ...args);
}

export function isDebugEnabled(scope: string): boolean {
  return scopeMatches(DEBUG_FILTER, scope);
}

// ── Diagnostic helpers for 'aiwg diagnose' ────────────────────────────────────

/**
 * Return the effective logger configuration — used by `aiwg version --verbose`
 * and `aiwg diagnose` to surface where logs go and what level is in effect.
 */
export function getLoggerInfo(): {
  level: LogLevel;
  disabled: boolean;
  logFile: string | null;
  retentionDays: number;
  provenance: Provenance;
} {
  const cfg = resolveConfig();
  return {
    level: effectiveLevel(),
    disabled: cfg.disabled,
    logFile: cfg.logFile,
    retentionDays: cfg.retentionDays,
    provenance: getProvenance(),
  };
}
