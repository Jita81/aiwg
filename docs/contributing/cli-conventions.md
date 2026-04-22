# CLI Conventions

This document defines the conventions the AIWG CLI follows for error handling,
exit codes, debug logging, and structured errors. All new CLI code should
follow these conventions; existing code is migrated incrementally per the CLI
Stabilization Epic ([#924](https://git.integrolabs.net/roctinam/aiwg/issues/924)).

## Exit codes

Every CLI invocation exits with a well-defined code. Pragmatic subset of
[sysexits.h](https://man.freebsd.org/cgi/man.cgi?query=sysexits) — enough for
scripts and CI to branch on without full ceremony.

| Code | Constant | Meaning |
|------|----------|---------|
| `0` | `EXIT_CODES.OK` | Command completed successfully |
| `1` | `EXIT_CODES.GENERAL` | General / uncategorized failure |
| `2` | `EXIT_CODES.USAGE` | User error: unknown command, bad flag, missing required argument |
| `73` | `EXIT_CODES.CANT_CREATE` | Filesystem write failure: permission denied, disk full, read-only |
| `78` | `EXIT_CODES.CONFIG` | Config file missing, malformed, or unusable |
| `130` | `EXIT_CODES.INTERRUPTED` | Interrupted by SIGINT (Ctrl-C). 128 + 2 |
| `143` | `EXIT_CODES.TERMINATED` | Terminated by SIGTERM. 128 + 15 |

Named constants live in `src/cli/errors.ts` — always use them instead of magic
numbers.

## Structured errors

Every intentional error thrown from handler code should be an `AiwgError`:

```typescript
import { AiwgError, EXIT_CODES } from '../cli/errors.js';

throw new AiwgError({
  code: 'ERR_USAGE_UNKNOWN_PROVIDER',
  message: `Unknown provider: ${providerId}`,
  hint: `Known providers: ${knownList}`,
  exitCode: EXIT_CODES.USAGE,
});
```

### Required fields

- **`code`** — stable, grep-able identifier. Format: `ERR_CATEGORY_REASON` in
  `UPPER_SNAKE_CASE`. Once published, codes are part of the CLI's public
  contract; don't rename without a migration path.
- **`message`** — single-line user-facing description.
- **`exitCode`** — from `EXIT_CODES` above.

### Optional fields

- **`hint`** — one-line suggested next action. Printed on a second line as
  `  hint: <text>`. Often more useful than the error itself.
- **`cause`** — underlying error for chain preservation. Included in verbose
  output; omitted by default.

### Code category prefixes

| Prefix | Category |
|--------|----------|
| `ERR_USAGE_*` | User error: bad flag, unknown command, missing value |
| `ERR_CONFIG_*` | Problems reading/writing `.aiwg/aiwg.config` |
| `ERR_NETWORK_*` | Timeouts, unreachable services, HTTP errors |
| `ERR_FS_*` | Filesystem errors (permission, ENOENT outside config) |
| `ERR_SANDBOX_*` | Sandbox-specific failures |
| `ERR_DEPS_*` | Missing runtime dependencies |
| `ERR_EDITOR_*` | Editor spawn failures |
| `ERR_INTERNAL` | Unexpected bugs (last resort; prefer a specific code) |

## Error output format

The top-level formatter in `bin/aiwg.mjs` renders errors as:

```
aiwg: error: <message> (code: ERR_XXX)
  hint: <suggested action>
```

With `AIWG_DEBUG=1` or `--verbose`:

```
aiwg: error: <message> (code: ERR_XXX)
  hint: <suggested action>
<full stack trace>
  cause:
<underlying error, recursively>
```

ANSI color codes are **suppressed** when stderr is not a TTY so piped output
stays clean.

## Debug logging

All non-user-facing diagnostics go through `src/cli/log.ts`:

```typescript
import { debug } from '../log.js';

debug('cli:use:deploy', 'starting framework deploy', { framework, providers });
```

### Scope hierarchy

Scopes are hierarchical, colon-separated:

| Prefix | Meaning |
|--------|---------|
| `cli:<command>:<phase>` | CLI handler phases (e.g. `cli:use:deploy`) |
| `net:<system>` | Network operations (e.g. `net:npm-registry`, `net:sandbox`) |
| `fs:<op>` | Filesystem operations |
| `child:<name>` | Child processes |
| `signal:<sig>` | Signal handlers |
| `update:<phase>` | Update-checker phases |

### Enabling debug output

```bash
AIWG_DEBUG=1 aiwg use all                   # enable everything
AIWG_DEBUG='cli:*' aiwg use all             # just CLI handlers
AIWG_DEBUG='cli:use:*,net:*' aiwg use all   # multiple globs
AIWG_DEBUG='cli:*,-cli:use:deploy' ...      # subtract a sub-scope
```

Output is written to stderr so piped stdout stays clean. Default level is
effectively off — every `debug()` call is a cheap no-op when the env var is
unset.

### Guidelines

- **Never call `debug()` to replace user-facing output.** Users read stderr
  from the normal output layer (`ui.info`, `ui.warn`, etc.). Debug is for
  operators reproducing a bug.
- **Include structured context.** Second arg onwards is passed through
  `console.error`, so objects get pretty-printed. Prefer
  `debug('scope', 'what happened', { key: value })` over string interpolation.
- **Use explicit scopes.** Don't reuse another handler's scope; create a new
  one. Scopes are the grep handle when things go wrong.

## `catch {}` blocks

Silent catches are an anti-pattern that mask real failures. Every catch block
should either:

1. **Translate** the error (e.g. to an `AiwgError` with context), OR
2. **Re-throw** the error unchanged, OR
3. **Log** with `debug()` and a specific scope explaining what is being
   swallowed and why it's safe.

Only pattern (3) is acceptable for "recoverable" errors. The debug log line
makes the root cause visible during bug reproduction.

```typescript
// GOOD — recoverable, logged under a specific scope
try {
  const config = await readAiwgConfig(cwd);
  // ...
} catch (err) {
  debug('cli:feedback:config', 'config read failed, using defaults', err);
}

// GOOD — translated to AiwgError
try {
  await fs.writeFile(path, content);
} catch (err) {
  throw new AiwgError({
    code: 'ERR_FS_WRITE_DENIED',
    message: `Cannot write to ${path}`,
    hint: 'Check file permissions and disk space',
    exitCode: EXIT_CODES.CANT_CREATE,
    cause: err,
  });
}

// BAD — silent swallow
try {
  await fs.writeFile(path, content);
} catch {}
```

Exception: WebSocket close/send failures during connection teardown are
inherently racy and safe to swallow silently. Those are documented inline as
`/* ignore — normal close race */`.

## Signal handling

- **SIGINT** (Ctrl-C) → exit code 130 (128 + 2)
- **SIGTERM** → exit code 143 (128 + 15)

Long-running commands (`serve`, `watch`, `mc watch`) register signal handlers
for graceful shutdown, then install a 5-second `setTimeout(() => process.exit(143)).unref()`
hard deadline so a hung shutdown cannot wedge the CLI.

Child processes spawned by the CLI should have SIGINT/SIGTERM propagated to
them and a SIGKILL escalation deadline (typically 10s) so a non-responsive
child cannot outlive its parent.

## Tests

Unit tests should assert on error **codes**, not message strings. Codes are
stable across releases; messages may be improved without breaking tests:

```typescript
// GOOD
await expect(handler(ctx)).rejects.toMatchObject({ code: 'ERR_USAGE_MISSING_VALUE' });

// BAD (brittle)
await expect(handler(ctx)).rejects.toThrow('--provider requires a provider name');
```

## References

- Source: `src/cli/errors.ts`, `src/cli/log.ts`
- Parent epic: [#924](https://git.integrolabs.net/roctinam/aiwg/issues/924)
- Phase 4 issue: [#921](https://git.integrolabs.net/roctinam/aiwg/issues/921)
- FreeBSD sysexits(3): https://man.freebsd.org/cgi/man.cgi?query=sysexits
