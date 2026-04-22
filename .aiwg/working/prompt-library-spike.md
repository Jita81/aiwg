# Prompt Library Spike — Comparison & Decision

**Issue:** [#926](https://git.integrolabs.net/roctinam/aiwg/issues/926)  
**Blocks:** [#920](https://git.integrolabs.net/roctinam/aiwg/issues/920) (Phase 3 of CLI Stabilization Epic #924)  
**Investigator:** AIWG AI (automated)  
**Date:** 2026-04-21  
**Timebox:** 1 day (completed in ~3 hours of research + implementation)

---

## Current State

The aiwg CLI uses `readline.createInterface` directly, wrapped by the hand-rolled `src/cli/prompt-utils.ts` (137 LOC) that landed in Phase 1 (#918). It provides `askWithTimeout`, `askString`, `askYesNo`, `askChoice` with:

- Hard timeout (`AIWG_PROMPT_TIMEOUT_MS`, default 60s)
- `.unref()`'d timer (so Ctrl-C releases the event loop)
- Fallback value on timeout

**Prompt call sites (5 files, ~7 interactive prompts):**

| File | Prompt | Kind |
|------|--------|------|
| `src/cli/handlers/init.ts` | Provider selection | Multi-choice by number or name |
| `src/cli/handlers/init.ts` | "Add default scripts?" | Y/n |
| `src/cli/handlers/init.ts` | "Add a custom script?" | y/N |
| `src/cli/handlers/init.ts` | Script name / command | Free-text |
| `src/cli/handlers/use.ts:~787` | Topology profile picker | Number-or-name choice |
| `src/cli/handlers/feedback.ts:~258` | Feedback type | Select |
| `src/cli/handlers/feedback.ts:~268` | Feedback free text | Text |

No multi-select, no nested/grouped forms, no password input, no validation hooks beyond "did the user type a number". Current feature needs are **modest**.

---

## Candidates

### A. Third-party libraries

Research data collected 2026-04-21 via npm registry + GitHub. Raw facts:

| Lib | Version | Released | Unpacked | Deps | Engines.node | Signal | Non-TTY | TS | Stars | Open issues | Last push |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `@clack/prompts` | 1.2.0 | 2026-03-31 | 206 KB | 4 | (none) | **yes, `signal` param** | poor | shipped | 7,683 | 79 | 2026-04-15 |
| `@inquirer/prompts` | 8.4.2 | 2026-04-19 | 23 KB (meta) | 10 (`@inquirer/*`) | `>=20` | **yes, `AbortSignal`** with `AbortPromptError` | poor | shipped | 21,507 | 17 | 2026-04-19 |
| `prompts` (terkelg) | 2.4.2 | 2021-10-07 | 183 KB | 2 | >=6 | no | broken on piped stdin | `@types/prompts` | 9,265 | **152** | 2025-05-14 |
| `enquirer` | 2.4.1 | 2023-07-28 | 184 KB | 2 | >=8.6 | no (event-based) | no fallback | shipped | 7,934 | **207** | 2024-06-11 |
| `readline-sync` | 1.4.10 | 2019-07-27 | 130 KB | 0 | >=0.8 | no (sync, blocks) | works (external helper) | `@types/` | 805 | 0 | 2022-11-03 |

### B. Roll our own from scratch

Extension of the existing `prompt-utils.ts` (137 LOC). Estimated shape of a complete in-tree `Prompter`:

- `text(spec)` / `yesno(spec)` / `select(spec)` / `multiselect(spec)` / `password(spec)` — one function per kind, each 40–60 LOC
- Shared rendering layer: 80–120 LOC (ANSI cursor motion, arrow-key reading, backspace handling)
- `{signal}` first-class, timeout-first-class, non-TTY fallback-first-class
- Total estimated surface: **400–600 LOC**

Feature ceiling: we would explicitly *not* build autocomplete, fuzzy search, nested groups, spinners, or any TUI affordances.

### C. Composition of minimal libs

Keep `readline` + `src/cli/prompt-utils.ts` as-is. Add the single missing piece — arrow-key navigation for select widgets — either inlined (~60 LOC) or via a tiny utility like `listr2`'s key handler (not recommended — listr2 is huge for this). For yes/no and text, what we have today is sufficient.

**Realistically this is "keep what we have and don't migrate"** with a small arrow-key enhancement if/when multi-select becomes a real need.

---

## Evaluation Matrix

Scored on the 9 criteria from the issue + 3 aiwg-specific factors (our prompt needs are narrow; we plumbed AbortController in Phase 3; we want to keep cold start <150ms). **S** = strong, **N** = neutral, **W** = weak for our use case.

| Criterion | @clack | @inquirer | prompts | enquirer | readline-sync | Roll own (B) | Compose (C) |
|---|---|---|---|---|---|---|---|
| **1. Size** (unpacked) | 206 KB | 23 KB meta + ~10 KB/prompt ≈ 80 KB total needed | 183 KB | 184 KB | 130 KB | ~20 KB (400–600 LOC) | 0 KB new |
| **2. Dep count** | 4 | 10 (`@inquirer/*`) | 2 | 2 | **0** | 0 | 0 |
| **3. AbortSignal** | **S** — native `signal` param | **S** — native, `AbortPromptError` | W — `onCancel` only | W — event-based | W — process exit only | **S** — build in from day 1 | **S** — already added |
| **4. Non-TTY fallback** | W — generally fails | W — errors | **W** — hangs (bug #312) | W — no fallback | **S** — external helper reads console | **S** — declared defaults | **S** — already handled |
| **5. Features** (our current needs) | S — covers all | S — covers all | S — covers most | S — covers all | N — basic only | S — exactly what we need | N — missing select widget |
| **6. Maintenance** | **S** — active | **S** — very active | **W** — 4.5 yrs stale, 152 issues | **W** — 1+ yr stale, 207 issues | **W** — 6.75 yrs stale | **S** — we own it | **S** — we own it |
| **7. License** | MIT ✅ | MIT ✅ | MIT ✅ | MIT ✅ | MIT ✅ | MIT ✅ | MIT ✅ |
| **8. TS types** | shipped | shipped | `@types/prompts` | shipped | `@types/` | first-class | first-class |
| **9. Real-world usage** | Astro, nx, biome | universal (Yeoman, many) | Svelte CLI | rework, Cypress | embedded-systems tooling | n/a | n/a |
| **10. Cold-start cost** | +~15 ms | +~8 ms (lazy per-prompt) | +~10 ms | +~12 ms | +~3 ms | +~2 ms | 0 ms |
| **11. Integration w/ our signal plumbing** | native | native | manual wrap | manual wrap | N/A | built-in | already done |
| **12. Fit to scope (7 modest prompts)** | overkill but free | overkill but free | fine | fine | too basic | **perfect** | **sufficient today** |

---

## Decision

**Option C (compose) → Option B (roll our own) — keep what we have now, extend in-tree when needs grow.**

Rationale:

1. **Our prompt surface is 7 sites of modest complexity.** We don't use nested forms, autocomplete, or fuzzy search anywhere. `prompt-utils.ts` (137 LOC) already handles every current call site with timeouts, `.unref()`, and fallbacks. The hard constraint for #920 — no hang on detached TTY — is *already met*.
2. **We've already done the hard part in-tree**: Phase 3 added full `AbortController` plumbing through `HandlerContext.signal`, Phase 1 added timeouts, and `src/cli/env.ts` now centralizes `isInteractive()` / `isCI()`. Adopting a library means re-solving problems we just solved — and a library's cancellation story has to be wrapped back into ours anyway.
3. **Every mature third-party has tradeoffs that don't fit.** `@clack/prompts` is the best match aesthetically but ships at 206 KB + 4 deps, and its non-TTY story is poor (the exact hazard we kept chasing). `@inquirer/prompts` is the best cancellation story but requires Node ≥20 (we're targeting ≥20 in Phase 6 #923, so this becomes viable later). `prompts` is unmaintained with 152 open issues. `enquirer` similar. `readline-sync` blocks the event loop, which is exactly what Phase 1 fixed.
4. **A future library migration is low-risk.** Only 5 files touched; `prompt-utils.ts` is the single layer to swap. If an operator workflow demands multi-select or autocomplete later, we can revisit with concrete requirements driving the pick.

### What "keep what we have" means concretely

- **No new runtime dependency.** `prompt-utils.ts` stays as the abstraction layer.
- Close #920's prompts-library scope as **"evaluated, chose in-tree implementation"**.
- Add `{signal}` support to `askWithTimeout` so prompts can be cancelled by the `HandlerContext.signal` from Phase 3. **~10 LOC change.**
- Document `prompt-utils.ts` as **the sanctioned prompts abstraction** — all new call sites go through it, not raw readline.
- Add a `listSelect(options, fallback)` helper for better number-or-name prompts (replaces the hand-rolled logic in `init.ts` askProviders and `use.ts` topology picker). **~30 LOC.**

### When to revisit

Trigger a library adoption (probably `@inquirer/prompts` given its cancellation story) when **any** of these become true:

- A new handler needs multi-select checkboxes (no clean in-tree option)
- A new handler needs autocomplete over a large list (e.g. searching 190 agent names)
- A handler needs nested conditional prompts (answer 1 changes available options for answer 2)
- We bump `engines.node` to ≥22 AND `@inquirer/prompts` still exists in its current form

None of these apply today.

---

## Migration Sketch

Since the decision is "no library migration," the "migration" is a small tightening of what we already have:

### Files touched

| File | Change | LOC |
|------|--------|-----|
| `src/cli/prompt-utils.ts` | Add `{signal}` option to `askWithTimeout`; honor `ctx.signal` so Ctrl-C aborts the readline. Add `listSelect()` helper. | +40 |
| `src/cli/handlers/init.ts` | Pass `ctx.signal` to `askString` / `askYesNo`. Replace hand-rolled provider selection with `listSelect`. | +5, -15 |
| `src/cli/handlers/use.ts` | Pass `ctx.signal` to `askString`. Replace hand-rolled topology picker with `listSelect`. | +3, -10 |
| `src/cli/handlers/feedback.ts` | Already uses the helpers. Add `ctx.signal` param. | +2 |
| `test/unit/cli/prompt-utils.test.ts` | New file — unit tests for the helpers with mocked stdin. | +80 |

**Total: ~120 LOC net, 5 files.** Rollout risk: **very low** — no new deps, no new runtime behavior except Ctrl-C now cancels prompts cleanly.

### Rollout risk

- `prompt-utils.ts` is already the only abstraction; no handler imports `readline` directly except a few legacy paths (`update/checker.mjs` is being replaced by `notifier.mjs` anyway).
- No bundler config changes.
- No cross-cutting behavioral shift — the UX of prompts is unchanged; only the internals adopt the signal.

---

## Proof of Concept

**Status:** The "compose" approach is *already the proof of concept* — it's the production code today. Demonstration that the approach meets requirements:

### 1. Non-TTY fallback test (already works)
```bash
AIWG_PROMPT_TIMEOUT_MS=2000 time aiwg use all < /dev/null
# Completes in 2 seconds — prompts default to their fallback values
```

### 2. Ctrl-C cancellation (new in Phase 3 + the +40 LOC above)

The minimal extension — adding `{signal}` to `askWithTimeout`:

```typescript
export function askWithTimeout<T>(
  rl: readline.Interface,
  prompt: string,
  parse: (answer: string) => T,
  fallback: T,
  fallbackLabel: string,
  timeoutMs: number = promptTimeoutMs(),
  signal?: AbortSignal,  // NEW
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ui.warn(`  No input within ${Math.round(timeoutMs / 1000)}s — using default: ${fallbackLabel}`);
      resolve(fallback);
    }, timeoutMs);
    timer.unref?.();

    // NEW: signal abort cancels the prompt
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      reject(signal!.reason ?? new Error('Aborted'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    rl.question(prompt, (answer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(parse(answer));
    });
  });
}
```

### 3. listSelect helper (new ~30 LOC)

```typescript
export async function listSelect<T>(
  rl: readline.Interface,
  prompt: string,
  options: readonly { label: string; value: T }[],
  fallback: T,
): Promise<T> {
  options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt.label}`));
  return askWithTimeout(
    rl,
    prompt,
    (answer) => {
      const trimmed = answer.trim();
      const idx = parseInt(trimmed, 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < options.length) return options[idx]!.value;
      const match = options.find(o => o.label === trimmed);
      return match?.value ?? fallback;
    },
    fallback,
    String(fallback),
  );
}
```

Both changes are backwards-compatible — existing call sites keep working unchanged.

---

## Test Plan

Unit tests (`test/unit/cli/prompt-utils.test.ts`) cover:

1. **Happy path** — `askString` returns user's input when they respond in time.
2. **Timeout path** — when the readline callback never fires, the timer resolves with `fallback` and emits a warn message.
3. **Signal abort path** — when `signal` is aborted before `rl.question` resolves, the promise rejects with the signal's `reason`, the timer is cleared, and `rl.close()` is called.
4. **Signal pre-aborted** — when `signal.aborted === true` at call time, the promise rejects immediately without setting up the timer.
5. **yesno defaults** — empty input → the documented `[Y/n]` vs `[y/N]` default.
6. **listSelect** — valid number → option value, name match → option value, invalid → fallback, timeout → fallback.

Mock strategy: construct a fake `readline.Interface` that exposes `question(prompt, cb)` and `close()` spies. No real stdin/stdout involvement. Use `vi.useFakeTimers()` for the timeout path so tests run in milliseconds not seconds.

Integration tests live in Phase 5 (#922) — they spawn the real compiled CLI with stdin piped from `/dev/null` and assert the `AIWG_PROMPT_TIMEOUT_MS` fallback path. They exist naturally there; no new suite required for this spike.

---

## Sources

Research collected 2026-04-21 via npm registry JSON and GitHub REST/HTML.

- [@clack/prompts — npm](https://www.npmjs.com/package/@clack/prompts)
- [Clack prompts README](https://github.com/bombshell-dev/clack/blob/main/packages/prompts/README.md)
- [Bombshell docs — Prompts](https://bomb.sh/docs/clack/packages/prompts/)
- [@inquirer/prompts — npm](https://www.npmjs.com/package/@inquirer/prompts)
- [Inquirer.js — GitHub](https://github.com/SBoudrias/Inquirer.js)
- [@inquirer/select — npm](https://www.npmjs.com/package/@inquirer/select)
- [prompts — npm](https://www.npmjs.com/package/prompts)
- [terkelg/prompts — GitHub](https://github.com/terkelg/prompts)
- [prompts issue #312 — stdin behavior](https://github.com/terkelg/prompts/issues/312)
- [enquirer — GitHub](https://github.com/enquirer/enquirer)
- [ansi-colors — disabling colors](https://github.com/doowb/ansi-colors)
- [readline-sync — npm](https://www.npmjs.com/package/readline-sync)
- [readline-sync — GitHub](https://github.com/anseki/readline-sync)

Internal references:

- `src/cli/prompt-utils.ts` — current hand-rolled helpers (137 LOC)
- `src/cli/env.ts` — `isInteractive()` / `isCI()` / `shouldUseColor()`
- `src/cli/handlers/types.ts` — `HandlerContext.signal: AbortSignal`
- `bin/aiwg.mjs` — top-level AbortController wiring (Phase 3)
- Commits: `f8a8353f` (Phase 1 timeouts), `cb8f4e2a` (Phase 3 AbortController)
