# CLI UI Modernization Plan

This document tracks the work to modernize AIWG's CLI output from ad-hoc
`console.log()` calls to a consistent, professional terminal UI using the
libraries already available (chalk, ora, listr2, cli-table3).

## Status

| Area | Issue | Status |
|------|-------|--------|
| `aiwg use` quiet mode (root bug) | #460 | Open |
| Shared UI utility module | #461 | Open |
| `aiwg version` | #462 | Open |
| `aiwg help` | #463 | Open |
| `aiwg doctor` | #464 | Open |
| `aiwg status` | #465 | Open |
| Router error/exit output | #466 | Open |

## Root Cause: deploy-agents.mjs stdio passthrough

`script-runner.ts` spawns deployment scripts with `stdio: 'inherit'`, meaning
subprocess output goes directly to the terminal unconditionally. Issue #428
(v2026.3.3) added quiet-mode logic to `use.ts` but never added a `--quiet`
flag to `deploy-agents.mjs`, so the per-file deployment log still prints in
default mode.

**Fix path (issue #460):**
1. Add `--quiet` to `deploy-agents.mjs` — show only phase headers and final
   count when set
2. `use.ts` passes `--quiet` when `--verbose` is absent
3. Optionally: change `script-runner.ts` to capture output in quiet mode and
   surface only on error

## Shared UI Module (issue #461)

All CLI output should route through `src/cli/ui.ts`. Available libraries:

| Library | Version | Current Usage |
|---------|---------|---------------|
| chalk | ^4.1.2 | Only validate-metadata.mjs |
| ora | ^5.4.1 | Unused |
| listr2 | ^8.2.5 | Unused |
| cli-table3 | ^0.6.5 (dev) | Only nfr-dashboard.mjs |

The shared module should expose:
- `ui.success/error/warn/info` — styled one-liners
- `ui.spinner(msg)` — ora wrapper, noop when `!isTTY`
- `ui.table(headers, rows)` — cli-table3 wrapper
- `ui.section(title, items)` — labeled block
- `ui.isTTY` / `ui.isCI` — environment flags for fallback behavior

## Design Principles

1. **Default = clean** — minimal output, artifact counts, next steps
2. **`--verbose` = full detail** — per-file list, timings, registration steps
3. **CI/non-TTY = plain** — no ANSI, no spinners, only text lines
4. **Errors always visible** — never swallowed regardless of verbosity

## Example Target Output

```
$ aiwg use sdlc

  Installing SDLC framework for Claude Code...

  ✓ Agents      101 deployed
  ✓ Commands    129 deployed
  ✓ Skills       72 deployed
  ✓ Rules        14 deployed

  Next steps:
    aiwg sdlc-accelerate "Your project idea"
    aiwg doctor
    aiwg help
```

vs verbose:

```
$ aiwg use sdlc --verbose

=== AIWG Agent Deployment ===
Provider: claude
...
deployed requirements-analyst.md -> .claude/agents/ (new)
...
=== Deployment complete ===
```
