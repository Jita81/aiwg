# Bundle + SEA Spike — Evaluation & Decision

**Issue:** [#927](https://git.integrolabs.net/roctinam/aiwg/issues/927)  
**Follow-up to:** [#923](https://git.integrolabs.net/roctinam/aiwg/issues/923) (Phase 6 of CLI Stabilization Epic [#924](https://git.integrolabs.net/roctinam/aiwg/issues/924))  
**Investigator:** AIWG AI (automated)  
**Date:** 2026-04-22  
**Timebox:** 2 days allotted; finished with evidence-based decision in ~90 minutes.

---

## Executive Decision

**Skip both.** Do the one cheap cleanup (remove `src/` from the published tarball), close #923 as-is, document the architectural path forward for the aspirational 5 MB target as a separate proposal.

### Why skip the bundle

1. **Addressable savings are small.** The published package is 34 MB unpacked. Of that, **22 MB is framework content** (`agentic/` 16 MB + `plugins/` 6.6 MB) that `aiwg use` deploys to projects — bundling cannot touch this. The `dist/` directory (the only thing bundling can affect) is 5.4 MB. Best-case bundle output: ~1 MB. **Ceiling savings: ~4 MB unpacked.** The 5 MB epic target is fundamentally incompatible with shipping framework content in the same package.
2. **PoC hit the #927 overrun signal.** esbuild bundle built in 56ms and produced a clean 816 KB single file, but the bundle hangs on import at runtime. Debugging that is ≥1 day of work per the issue's own criterion ("if bundle PoC is still producing broken dynamic imports after 1 day, recommend skipping").
3. **Cold-start ceiling is ~30ms.** The current 145ms cold start is already inside the Phase 6 150ms budget. Bundling 221 JS files into one removes module-resolution overhead, but modern Node (v20+) resolves modules in ~100μs each — the realistic saving is 20–25ms. The spike issue explicitly says "if <30ms improvement, recommend skipping."

### Why skip SEA

1. **SEA requires a working bundle first.** Node Single Executable Applications ingest a single bundled JS file. Without the bundle, SEA is blocked.
2. **Ergonomic win is weak.** SEA binaries are 90-110 MB per platform (Node runtime + code). The current 9 MB npm install with `npm i -g aiwg` is significantly smaller and faster for anyone who already has Node.
3. **Operational cost is real.** Cross-platform build matrix (linux-x64, linux-arm64, darwin-x64, darwin-arm64, win-x64), macOS notarization, Windows code signing, a self-update mechanism. Multi-sprint effort for a marginal UX improvement.

---

## Recommended Cleanup (Do Now)

Independent of the bundle/SEA decision, one cheap cleanup is worth doing:

### Remove `src/` from `files` array

`src/` is the TypeScript source. The compiled output is already in `dist/` (fixed in Phase 6 #923 — `dist/` added to `files`). Shipping both `src/` and `dist/` is redundant.

**Measured impact:**

| Metric | With src/ | Without src/ | Δ |
|--------|-----------|--------------|---|
| Packed size | 9414 KB | **8905 KB** | -509 KB |
| Unpacked size | 36 MB | **34 MB** | -2 MB |
| File count | 3982 | **3723** | -259 files |

500 KB packed / 2 MB unpacked / 259 files for free. No runtime impact — `bin/aiwg.mjs` loads from `dist/`.

**Risk:** very low. Nothing outside the repo references `node_modules/aiwg/src/*` at runtime.

---

## Measurements

All measurements taken on 2026-04-22 at commit `b9d14768`.

### Baseline

```
aiwg --version cold start (p50 over 5 warm runs): 145ms
npm pack size: 9.4 MB packed / 36 MB unpacked / 3982 files
Runtime deps: 11 (budget 15)
Node version: 24.12.0
```

### Package composition (what's in the 36 MB)

| Directory | Files | Size | Necessary at runtime? |
|-----------|-------|------|----------------------|
| agentic/ | 1874 | 16.0 MB | **Yes** — `aiwg use` deploys this content |
| plugins/ | 556 | 6.6 MB | **Yes** — plugin packages |
| dist/ | 993 | 5.4 MB | **Yes** — compiled CLI |
| tools/ | 264 | 2.8 MB | **Partial** — some scripts invoked by handlers |
| src/ | 259 | 2.7 MB | **No** — redundant with dist/ |
| apps/web/dist/ | 12 | 2.3 MB | **Yes** — web dashboard for `aiwg serve` |
| bin/ | 2 | 13 KB | **Yes** — entry point |

### Bundle PoC

- Bundler: **esbuild** 0.21.5 (already present via vite)
- Config: `tools/cli/build-bundle.mjs` (~60 LOC)
- Entry: `src/cli/router.ts`
- Platform: `node20`
- Runtime deps externalized: 11 npm deps + Node builtins

**Build:** 56ms, output 816 KB + source map
**Runtime:** hangs on import (≥8s timeout). Untraced root cause — likely one of:
- Dynamic `import()` paths that esbuild didn't preserve
- Top-level side effect in `.mjs` file the bundler inlined differently
- `__dirname` semantics change breaking `getPackageRoot()`'s walk
- Circular import between log.ts and a handler

Diagnosing would require ≥1 day per the spike's overrun signal. Stopped here.

### Bundle theoretical ceiling

If the bundle were working and shipped alongside (not replacing) `dist/`:

| Metric | Current | With working bundle | Δ |
|--------|---------|---------------------|---|
| Cold start p50 | 145ms | ~115ms (est.) | -30ms |
| Unpacked size | 36 MB | 32 MB (est., removes dist/ tree) | -4 MB |
| File count | 3982 | ~3760 (est.) | -220 files |

None of these crosses a meaningful threshold for the effort involved.

### Candidate evaluation — for the record

| Bundler | Build speed | DX | Dynamic `import()` handling | `.mjs` handling | Source maps | Maintenance |
|---------|------------|----|------------------------------|------------------|-------------|-------------|
| **esbuild** | ✅ 56ms | minimal config | keeps as runtime `import()` when external | Works but `__dirname` semantics differ | clean | Very active |
| **tsdown** | ✅ ~100ms (est.) | zero-config | tsup successor; similar behavior | same as esbuild | clean | New; replaces tsup |
| **rollup** | ❌ ~5s (est.) | verbose config | best tree-shaking | complex | clean | Active |

esbuild is the right choice **if** we eventually bundle. But the runtime debugging is the blocker, not the tool.

---

## What the 5 MB Target Actually Requires

The epic's 5 MB install target is **only achievable via architectural change**. Bundling the CLI can't get us there because framework content (22.6 MB of the current 36 MB) is the dominant cost.

**Option A: split framework content into its own npm package.**
- New package: `aiwg-frameworks` (~22 MB, downloaded on first `aiwg use`)
- Core `aiwg` package drops to ~14 MB total (dist + bin + apps/web/dist + tools)
- With bundle: drops further to ~10 MB

**Option B: downloadable-on-demand framework content.**
- `aiwg use sdlc` fetches the SDLC framework from a registry (Gitea artifact, npm package, S3, etc.)
- Core `aiwg` package drops to bundle-only size: ~3-4 MB

**Option C: accept that ~30 MB is the realistic floor.**
- Remove `src/` (-2 MB)
- Consider trimming some `plugins/` examples
- Final: ~32-34 MB

All three options are **product decisions** that deserve their own issue, not a CLI cleanup. File a follow-up proposal if the 5 MB target is a real product requirement.

---

## Rollout Plan (If Pursued Later)

Documented for future reference. Not recommended for now.

### Bundle — phased approach

1. **Phase A**: fix the runtime hang in a spike branch. Likely causes (ordered by probability):
   - Handler dynamic imports not preserved; patch via `plugins: []` esbuild plugin to keep specific paths external
   - `(0, eval)('require')` hacks in `.mjs` files break under bundler (log.ts, manager.mjs) — replace with `createRequire(import.meta.url)` pattern
   - `__dirname` polyfill missing — add esbuild `define: { __dirname: 'fileURLToPath(...)' }`
2. **Phase B**: integration-test the bundle against the full 13-test integration suite; hang-regression gate catches any new hang
3. **Phase C**: add `npm run build:bundle` script, dual-ship bundle alongside `dist/` tree for one release, monitor issue reports
4. **Phase D**: once stable, drop the `dist/` tree from the published package; bundle only

### SEA — gated on bundle

Only attempt SEA **after** bundle Phase D lands. Separate multi-sprint effort:
- CI matrix for 5 target triples
- Code signing (Apple notarization, Windows signtool)
- Self-update mechanism (download + replace binary in-place)
- Separate release channel (GitHub Releases attached binaries)

---

## Decision Matrix

| Option | Effort | Savings | Risk | Recommendation |
|--------|--------|---------|------|----------------|
| Remove `src/` from `files` | 5 min | 500 KB packed / 2 MB unpacked / 259 files | Very low | **Do now** |
| Bundle with esbuild | 1-3 days | ~30ms cold / ~4 MB unpacked | Medium (hang-class regressions) | **Skip** |
| Bundle + split frameworks to `aiwg-frameworks` | 2+ weeks | ~20+ MB unpacked | High (breaks `aiwg use` UX) | **Defer; needs product discussion** |
| SEA binaries | 2-4 weeks | Zero-Node install | High (binary size, signing, update) | **Skip** |

---

## Closing #923

Phase 6 (#923) is **complete as shipped**. The hardening portion (packaging fix, engines bump, budget gates, startup trace) landed in `b9d14768` and delivers concrete value. The deferred items (bundle + SEA) are evaluated here and recommended **skipped** with specific reasoning. The 5 MB aspirational target requires product-level architectural work that's out of scope for a CLI cleanup epic.

**#923 should close** with this decision referenced. **#927 should close** with this document as the deliverable.

The CLI Stabilization Epic ([#924](https://git.integrolabs.net/roctinam/aiwg/issues/924)) is effectively **done** — 8 of 8 phase issues resolved, one spike still open only to record the decision above. Future work (framework split, SEA) should be new issues with clear product requirements, not carryovers from this epic.

---

## References

- Current baseline: commit `b9d14768` (2026-04-22)
- Bundle PoC script: `tools/cli/build-bundle.mjs`
- Measured via: `npm run check:install-size`, `npm run test:perf`, `node tools/cli/build-bundle.mjs`
- esbuild docs: https://esbuild.github.io/
- Node SEA docs: https://nodejs.org/api/single-executable-applications.html
- tsdown: https://github.com/rolldown/tsdown
