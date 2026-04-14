# ADR-021: Semantic Memory Kernel Architecture

**Status**: Accepted (2026-04-14)
**Date**: 2026-04-14
**Deciders**: Architecture Designer (proposing), Project Owner (review pending)
**Context**: Epic #823 — Semantic memory kernel + LLM Wiki addon

---

## Context and Problem Statement

AIWG frameworks (`sdlc-complete`, `research-complete`, `forensics-complete`, `media-curator`) each ship domain-scoped versions of the same five operations: ingest, lint, cross-reference maintenance, contradiction detection, and chronological event logging. These operations are **memory-topology-agnostic** — they describe how any semantic memory behaves, regardless of whether the domain is software delivery, digital forensics, research, or a personal book-companion wiki.

Separately, users whose domain does not fit a pre-packaged framework (book companions, personal knowledge bases, business wikis, exploratory research threads) have no addon to reach for. The LLM Wiki pattern describes exactly this shape — an LLM-maintained markdown wiki that compounds as sources are ingested.

Both problems collapse to one architectural move: **lift the generic operations into a kernel, and ship LLM Wiki as a thin topology declaration on top.**

### Current state audit (from #823)

| Primitive | Status | Existing surface |
|---|---|---|
| Ingest | partial / domain-scoped | `induct-research`, `intake-from-codebase` |
| Index | generic ✓ | `aiwg index build/query/deps/stats` |
| Cross-reference | generic ✓ | `mention-wire`, `mention-lint`, `mention-report`, `link-check` |
| Drift / contradiction | partial | `doc-sync`, `citation-check` |
| Lint / orphan | partial / overlapping | `workspace-health`, `corpus-health`, `cleanup-audit` |
| Query → artifact | **missing** | new skill needed |
| Chronological log | partial / inconsistent | `.aiwg/reports/`, `ralph-memory`, research logs |
| Source immutability | structural ✓ | `agentic/code/` vs `.aiwg/` boundary |
| Provenance | generic ✓ | W3C PROV-O via `provenance-create/query/validate` |

Five of nine primitives are already generic. Three are domain-tinted but liftable. One (`query → artifact`) is genuinely missing.

## Decision Drivers

- **Code reuse**: stop duplicating ingest/lint/log mechanics across four frameworks
- **Backward compatibility**: existing public skill names must keep working — no breaking UX
- **Discoverability**: kernel must be available without extra installation, like `aiwg-utils`
- **Boundary discipline**: kernel is topology-agnostic; domain validation (GRADE, NIST, STIX, phase gates) stays in frameworks
- **Pluggability**: addons (e.g., `llm-wiki`) must be able to declare a topology and inherit kernel behavior with zero custom mechanics

---

## Decisions

This ADR consolidates six interlocking decisions identified in #824. Each is presented with options, recommendation, and rationale. Numbered D1–D6 for downstream reference.

### D1: Kernel location

**Options**:
1. New addon `agentic/code/addons/semantic-memory/` (peer of `aiwg-utils`, `rlm`)
2. Extend existing `aiwg-utils` addon
3. Promote to a top-level "kernel" tier

**Decision**: **Option 1 — new addon `semantic-memory/`**, marked `core: true, autoInstall: true` like `aiwg-utils`.

**Rationale**:
- Clear scope boundary — `aiwg-utils` is meta-management (regenerate, hooks, mentions, soul); `semantic-memory` is artifact-lifecycle. Mixing dilutes both.
- Already-established peer pattern: `aiwg-utils`, `rlm`, `ring-methodology` are all sub-framework tier addons. Semantic memory belongs alongside them.
- `core: true` + `autoInstall: true` gives every project the kernel by default — no extra install step for `induct-research` or any consumer that delegates here.
- Avoids `aiwg-utils` becoming unwieldy (already 5 agents + 43 skills + 15 rules; ADR-009 noted the size risk).

**Consequence**: Adds one entry to the addon registry. Bumps `aiwg-utils` size projection back into safe territory.

### D2: Kernel → consumer interface

**Options**:
1. Skills only — kernel ships `memory-ingest`, `memory-lint`, `memory-query-capture`, `memory-log-append`, `memory-log-render` as standard skills; consumers call them
2. Library — TypeScript/JS module under `src/` that frameworks import
3. Pluggable agent spec — kernel ships agents with declarable behaviors

**Decision**: **Option 1 — skills, parameterized by consumer's `manifest.json` schema contract.**

**Rationale**:
- Skills are AIWG's first-class extension surface; agents and CLI commands already know how to discover them.
- Skills are platform-portable (deploy to all 10 providers); a TS library would only work in Node-host providers.
- Skills compose with `parallel-then-synthesize` and `subagent-scoping` rules naturally.
- Ingest/lint/capture are conversational operations that benefit from skill-style elicitation; library code would force premature non-interactive defaults.

**Consequence**: Kernel skills must be schema-aware — they read `manifest.json` `memory:` block to parameterize behavior. No hard-coded paths or page types.

### D3: Schema contract location

**Options**:
1. Inline under a `memory:` key in each consumer's `manifest.json`
2. Separate `memory-schema.yaml` file alongside `manifest.json`
3. Implicit — derived from existing `entry.*` paths and conventions

**Decision**: **Option 1 — inline `memory:` key in `manifest.json`**, consistent with existing `consolidation:` and `deployment:` keys.

**Rationale**:
- One file to read = one source of truth for consumer metadata.
- Existing `consolidation:` precedent shows the pattern works for declarative behavior contracts.
- JSON Schema validation can extend the existing manifest schema rather than introducing a second file format.
- Implicit derivation (option 3) was rejected because consumers have legitimate reasons to deviate from convention (e.g., `forensics-complete` needs an evidence/timeline/IOC topology, not a flat artifact tree).

**Consequence**: `src/extensions/types.ts` gains a `MemoryContract` interface. `src/extensions/schemas/manifest.schema.json` (or equivalent) gains a `memory` property. `aiwg doctor` and `validate-metadata` validate it.

### D4: Consumer identification at invocation time

When a user runs `memory-ingest <source>`, how does the kernel know which consumer's schema to apply?

**Options**:
1. Explicit flag: `memory-ingest <source> --consumer research-complete`
2. Auto-detect via cwd + `.aiwg/frameworks/registry.json`
3. Wrapper skills only: `research-ingest`, `sdlc-ingest` exist; users never call `memory-ingest` directly
4. All three with explicit precedence

**Decision**: **Option 4 — all three supported with precedence: explicit > wrapper > auto-detect**.

**Rationale**:
- Explicit flag is mandatory for scripted/non-interactive use.
- Wrapper skills (option 3) are how backward compatibility is preserved (D5) — existing `induct-research` keeps its name and adds the `--consumer research-complete` internally.
- Auto-detect handles the common interactive case where the user is "in" a project and there's only one installed framework — no need to type the flag.
- When multiple frameworks are installed and no explicit flag is given, auto-detect prompts the user (uses `native-ux-tools` rule).

**Consequence**: Kernel skills implement a `resolveConsumer()` helper with the documented precedence. Ambiguous resolution invokes `AskUserQuestion` (or platform equivalent) rather than guessing.

### D5: Backward compatibility

**Options**:
1. Hard rename — `induct-research` becomes `memory-ingest`, deprecation period
2. Wrapper preservation — existing skills keep names, become thin wrappers calling the kernel
3. Dual-track — both names work, kernel call gradually displaces wrapper call

**Decision**: **Option 2 — wrapper preservation, no breaking changes.**

Existing public surfaces that delegate to the kernel:
- `induct-research` → `memory-ingest --consumer research-complete` + GRADE quality assessment + citation validation (research-specific layers stay in the wrapper)
- `intake-from-codebase` → `memory-ingest --consumer sdlc-complete` + codebase-scan heuristics
- `workspace-health` → `memory-lint` for every framework in `.aiwg/frameworks/registry.json`
- `corpus-health` → `memory-lint --consumer research-complete --severity warning` + GRADE coverage
- `cleanup-audit` → `memory-lint` for each consumer + dead-code/orphan-file checks

**Rationale**:
- Users have muscle memory and documentation referencing existing skill names.
- Domain-specific validation (GRADE, NIST SP 800-86, phase gates, STIX) is real work that doesn't belong in the kernel — wrappers are the natural place for it.
- Aligns with `human-authorization` rule: don't break user workflows without explicit authorization.

**Consequence**: Each wrapper skill gains a thin top layer that delegates to the kernel. The wrapper retains its public name, prompt UX, and domain layers. Regression tests (per #830) validate equivalence on representative fixtures.

### D6: Memory-log format

**Options**:
1. JSON Lines (`.log.jsonl`) for machine parseability + on-demand rendered Markdown view
2. YAML frontmatter-prefixed Markdown (`log.md` only)
3. Append-only YAML list

**Decision**: **Option 1 — JSON Lines primary, rendered Markdown view on demand.**

Primary storage: `.aiwg/<namespace>/.log.jsonl` (append-only, one event per line).

Rendered view: `.aiwg/<namespace>/log.md` generated by `memory-log-render` with the convention `## [YYYY-MM-DD] <op> | <subject>` so it's greppable with simple unix tools.

**Rationale**:
- JSON Lines is the standard for append-only event streams (compatible with `jq`, log shippers, structured grep).
- Rendered Markdown view solves human readability without coupling storage format to display format.
- Greppable line prefix lets the existing `activity-log` rule keep working unchanged for `aiwg activity-log` consumers.
- YAML alternatives (options 2, 3) sacrifice machine parseability for marginal human gain over the rendered view.

**Consequence**: Two new kernel skills: `memory-log-append` (writer) and `memory-log-render` (JSONL → Markdown). JSON Schema for log entry types ships in #829. Existing logs (`.aiwg/reports/`, `ralph-memory`) get an opt-in migration helper, not a forced conversion.

---

## Consequences

### Positive

- One implementation of ingest/lint/log instead of four. Bug fixes apply everywhere.
- Frameworks declare topology declaratively in 10–15 lines of JSON instead of writing custom mechanics.
- New addons (starting with `llm-wiki`) ship as pure schema + templates, no code.
- `query → artifact` capability filled (the genuinely-missing primitive).
- Activity-log unification gives `aiwg activity-log` a single pane across frameworks.

### Negative

- Adds an indirection layer — debugging an `induct-research` failure now means tracing through the wrapper to `memory-ingest`.
- Requires per-consumer schema declarations; consumers without one get no kernel benefit until they declare.
- Migration risk for `induct-research` and `intake-from-codebase` — regression tests are mandatory (per #830).

### Risks

**Risk: Schema contract is too narrow** (MEDIUM)
- **Probability**: Medium — first-pass schemas often miss edge cases (e.g., forensics evidence has provenance + custody chain requirements that may not fit a generic `derivedPages` model).
- **Impact**: Schema iteration before consumers can migrate. Worst case: schema v2 with a deprecation period.
- **Mitigation**: Validate schema against all four target consumers (#825) before declaring stable. Treat first three months as schema-iteration window — bump kernel version on any breaking change.

**Risk: Wrapper drift** (MEDIUM)
- **Probability**: Medium — wrappers might re-introduce duplicated logic if the kernel doesn't cover their needs.
- **Impact**: Defeats the consolidation purpose.
- **Mitigation**: Lint wrappers periodically (`cleanup-audit` extension) for ingest-like loops. ADR rollout includes a "no duplicate ingest mechanics" rule in `aiwg-utils`.

**Risk: Auto-detect ambiguity** (LOW)
- **Probability**: Low — most projects install ≤2 frameworks.
- **Impact**: User confusion when wrong consumer schema is applied silently.
- **Mitigation**: When multiple frameworks are installed and no explicit flag is given, kernel prompts via `AskUserQuestion` (or equivalent per `native-ux-tools`).

---

## Rollout Plan

Phased delivery per #823:

1. **#824 (this ADR)** — landed and reviewed before any code. Locks the six decisions above.
2. **#825 + #829 (parallel)** — schema contract in `manifest.json`; log format JSON Schema and writer/renderer skills. Foundational data shapes.
3. **#826 + #827 + #828 (parallel)** — kernel skills `memory-ingest`, `memory-lint`, `memory-query-capture`. Each callable independently against any consumer schema.
4. **#830** — consumer migrations, one PR per migration (research → SDLC → lint-unification → forensics/media schemas). Each independently shippable and reversible.
5. **#831** — `llm-wiki` addon: scaffold + templates + Obsidian integration docs. Ships once kernel is stable.

### Schema stability

Each consumer declares its own schema stability policy via the `memory:` contract. Breaking schema changes in the kernel bump the kernel minor version and require a one-week deprecation announcement. Consumers can iterate their own schema declarations independently of the kernel version.

---

## Alternatives Considered (system-level)

### Alternative A: Do nothing — let frameworks keep their domain-scoped implementations

**Rejected because**: The duplication compounds with every new framework. Each new domain (e.g., `legal-complete`, `incident-response-complete`) would need its own ingest, lint, and log code. Fixed-cost work that's already been written four times.

### Alternative B: Build a unified search/RAG engine instead

**Rejected because**: `aiwg index` already covers the search primitive. The bottleneck is ingest/lint/log mechanics, not retrieval. Building search would solve a problem we don't have.

### Alternative C: Force consumers into a single canonical topology

**Rejected because**: Forensics evidence ≠ research papers ≠ artist releases ≠ SDLC artifacts. A canonical topology would either be too narrow (excluding forensics) or too broad (no semantic structure left). Schema contract per consumer is the right level of abstraction.

---

## Resolved Open Questions (2026-04-14)

Resolved during review with Project Owner:

1. **Naming**: `semantic-memory` — accepted as-is.
2. **`crossRefStyle` enum**: All four values supported (`at-mention | wikilink | markdown-link | yaml-ref`). AIWG internal tooling (`mention-wire`, `mention-lint`, `mention-validate`) continues to use `at-mention` exclusively. Consumers declare their preferred style; the kernel writes cross-refs per the consumer's declared style.
3. **Schema-iteration window**: Not a fixed global window. Instead, configurable per memory instance via the schema contract. Each consumer can declare its own iteration/stability policy.
4. **Forensics topology in #825**: Ship it. All four consumer schema declarations (sdlc-complete, research-complete, forensics-complete, media-curator) land in #825. No deferrals — exercising all consumers early catches schema gaps before the kernel skills are built.
5. **CLI surface**: Yes. Add `aiwg memory ingest`, `aiwg memory lint`, `aiwg memory query-capture` commands for parity with `aiwg index`. Ships with respective skill issues (#826, #827, #828).

---

## References

- @.aiwg/architecture/decisions/ADR-007-framework-scoped-workspace-architecture.md — Framework-scoped `.aiwg/` structure (kernel respects this)
- @.aiwg/architecture/decisions/ADR-008-plugin-type-taxonomy.md — Addon vs framework distinction
- @.aiwg/architecture/decisions/ADR-009-devkit-extends-aiwg-utils.md — Precedent for the "extend existing addon" rejection (D1)
- @.aiwg/architecture/decisions/ADR-018-hook-file-architecture.md — Pattern for declarative extension contracts
- @agentic/code/addons/aiwg-utils/manifest.json — Reference manifest pattern (D3)
- @agentic/code/addons/aiwg-utils/rules/human-authorization.md — Backward compatibility justification (D5)
- @agentic/code/addons/aiwg-utils/rules/native-ux-tools.md — Auto-detect ambiguity resolution (D4)
- @agentic/code/addons/aiwg-utils/rules/activity-log.md — Existing log convention the new format must remain compatible with (D6)

**Issue references**:

- Epic: https://git.integrolabs.net/roctinam/aiwg/issues/823
- This ADR: https://git.integrolabs.net/roctinam/aiwg/issues/824
- Schema contract: https://git.integrolabs.net/roctinam/aiwg/issues/825
- `memory-ingest`: https://git.integrolabs.net/roctinam/aiwg/issues/826
- `memory-lint`: https://git.integrolabs.net/roctinam/aiwg/issues/827
- `memory-query-capture`: https://git.integrolabs.net/roctinam/aiwg/issues/828
- log format: https://git.integrolabs.net/roctinam/aiwg/issues/829
- consumer migrations: https://git.integrolabs.net/roctinam/aiwg/issues/830
- `llm-wiki` addon: https://git.integrolabs.net/roctinam/aiwg/issues/831

---

**Last Updated**: 2026-04-14
**Author**: Claude (Architecture Designer / Orchestrator)
**Reviewers**: Project Owner (accepted 2026-04-14)
