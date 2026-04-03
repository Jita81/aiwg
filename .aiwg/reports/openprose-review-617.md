# OpenProse Review: Findings & Recommendations

**Issue:** #617  
**Date:** 2026-04-02  
**Repo:** https://github.com/openprose/prose  
**Local Clone:** `/tmp/prose`

---

## Executive Summary

OpenProse is a programming language for AI sessions — programs are Markdown files with YAML frontmatter and contract-based semantics. The core insight: **a markdown file loaded into an LLM's context causes it to behave as a specific kind of machine.** `forme.md` makes the LLM a DI container; `prose.md` makes it a VM.

The project is production-ready (v0.9.0), well-designed, and has several architectural decisions directly applicable to AIWG. Key areas of interest:

| Area | Relevance | Action |
|------|-----------|--------|
| Contract language (`requires:`/`ensures:`) | High — AIWG skill definitions | Adopt in phases (#619) |
| 3-tier memory scoping | High — #608 daemon cross-session memory | Inform design (#620) |
| Captain's Chair pattern | High — Concierge #602 | Reference for implementation (#621) |
| RLM strategy examples | High — AIWG RLM addon | Gap analysis (#622) |
| Patterns/Antipatterns catalog | Medium — AIWG rules | Add as rules (#623) |
| Shape-based role enforcement | Medium — AIWG agent definitions | Future iteration |
| SOUL.md approach | Low difference | Note only |
| Plugin model | Low difference | Monitor |

---

## Findings by Area

### 1. Contract Language: `requires:` / `ensures:` / `errors:` / `invariants:` / `strategies:`

**What it is:** Every OpenProse service declares a formal contract in its Markdown frontmatter. The `ensures:` keyword was specifically chosen (over `returns:`) because it carries **obligation** to the model — it commits the service to produce that output.

```markdown
requires:
- topic: a non-empty string describing what to research

ensures:
- findings: sourced claims from 3+ distinct sources, each with confidence 0-1
- sources: all URLs consulted with relevance ratings
- if research is unavailable: partial report with explanation

errors:
- no-results: no relevant sources found for this topic

invariants:
- each finding is traced to at least one source
- no claim is presented as fact that cannot be verified

strategies:
- when few sources found: broaden search terms
- when multiple conflicting sources: present alternative explanations
```

**Three-channel error model:**
- `ensures` — success, including **degraded** success (partial results are explicit acceptable variants)
- `errors` — cannot produce anything at all
- `invariants` — always true regardless of outcome

This is more expressive than typical try/catch. The distinction between "I failed" vs "I succeeded partially" is load-bearing.

**AIWG relevance:** AIWG skill definitions use natural language descriptions. Adding formal contracts would:
1. Make skill interfaces machine-readable and validatable
2. Enable the steward to auto-wire skills by matching `requires` ↔ `ensures`
3. Improve orchestration quality — downstream skills know exactly what they'll receive

**Recommendation:** Adopt `requires:`/`ensures:`/`errors:` as AIWG skill contract fields. `invariants:` and `strategies:` are valuable but can come later. See #619.

---

### 2. Forme Container (Intelligent DI / Auto-Wiring)

**What it is:** Two-phase execution:
- **Phase 1 (Forme):** Reads component contracts, semantically matches `requires` ↔ `ensures`, builds dependency graph, produces `manifest.md`
- **Phase 2 (VM):** Reads manifest, spawns sub-agent sessions, manages filesystem state, handles parallelism

The Forme Container uses **model intelligence** (not type matching) to wire components. Where Spring needs `@Qualifier`, Forme reads the prose and understands semantic equivalence.

**Manifest format** (key output of Forme):
```markdown
# Manifest: deep-research

## Caller Interface
requires: { question: what the user wants answered }
returns: { report: critically evaluated research report }

## Graph
### researcher
source: services/researcher.md
inputs: topic ← bindings/caller/question.md
outputs: (public) findings → bindings/researcher/findings.md

### critic
inputs: findings ← bindings/researcher/findings.md
outputs: (public) evaluation → bindings/critic/evaluation.md

## Execution Order
1. researcher (depends on: caller)
2. critic (depends on: researcher)
3. synthesizer (depends on: researcher, critic)
Parallelizable: researcher runs before critic and synthesizer; critic and synthesizer could parallelize if they didn't depend on each other.

## Warnings
- [Warning] Wired caller.question → researcher.topic (semantic match, not exact)
```

**State management:** `workspace/` (private) → `bindings/` (public). Services write everything to their workspace; the VM publishes declared `ensures:` outputs to `bindings/`. Services never see `bindings/` directly. This is the **workspace/bindings split** — a clean separation between private working state and public outputs.

**AIWG relevance:** AIWG's SDLC flow orchestration is currently imperative (flows define explicit sequences). Forme-style auto-wiring could:
- Make SDLC flow graphs debuggable (manifest shows what runs and why)
- Reduce orchestration boilerplate
- Catch missing dependencies at wiring time rather than runtime

**Recommendation:** Not a full Forme port, but adopt **manifest generation** for SDLC flows. When an orchestration is planned, produce a human-readable manifest showing agent assignments and data flow. See #619 (phase 2).

---

### 3. Memory Architecture: 3-Tier Persistence Scoping

**What it is:** Services declare persistence scope in YAML frontmatter:

| Scope | Declaration | Path | Lifetime |
|-------|-------------|------|----------|
| Execution (default) | `persist: true` | `.prose/runs/{id}/agents/{name}/` | Single run |
| Project | `persist: project` | `.prose/agents/{name}/` | Across all runs in project |
| User | `persist: user` | `~/.prose/agents/{name}/` | Across all projects |

Memory files are `memory.md` + numbered segment files (`{name}-NNN.md`). **Read-first protocol:** every service invocation reads the memory file before executing, writes it back after.

**`lib/user-memory.md`** — cross-project personal knowledge:
- Modes: `teach` (add), `query` (retrieve), `reflect` (synthesize)
- Invariants: never silently discard taught knowledge; contradictions are flagged; last teaching wins
- Self-compacts to maintain readable size

**`lib/project-memory.md`** — project-scoped institutional memory:
- Modes: `ingest` (add), `query` (retrieve), `update` (amend with history), `summarize` (overview)
- Invariants: never fabricate; always cite source; preserve history when updating

**Comparison to AIWG #608 (daemon cross-session memory):**

| Dimension | OpenProse | AIWG Daemon |
|-----------|-----------|------------|
| Execution model | Session-based; reads/writes files per invocation | Process-based; in-memory + disk logs |
| Scope granularity | 3 tiers (execution, project, user) | Implicit (always project-scoped) |
| Knowledge representation | Free-form Markdown with categorization strategies | Structured JSON (Ralph) + episodic reflection |
| Cross-session bridge | Explicit `persist:` + read-first protocol | IPC socket; task queue resumes |
| Failure recovery | Re-read memory on next invocation | Graceful shutdown + queue resume |

**These are complementary, not competing:**
- **OpenProse memory:** structured knowledge management (what did we learn about this system?)
- **AIWG daemon:** operational continuity (what should I do next on restart?)
- **Ralph episodic memory:** behavior adaptation (what did I do wrong and how to fix it?)

A combined design: daemon reads `.aiwg/memory/` files at startup (like OpenProse's project-memory), injects context before spawning tasks, and persists new learnings on shutdown.

**Recommendation:** Use OpenProse's 3-tier scope design and read-first protocol to inform #608 daemon memory architecture. See #620.

---

### 4. Captain's Chair Pattern (Example 29)

**What it is:** A persistent orchestrator (`captain`, `persist: true`) that coordinates specialists without doing implementation work itself.

```
Captain (persist: true)
  shape: { self: [plan, synthesize, validate], delegates: [researcher, coder, critic, tester], prohibited: [write code] }
  ↓
  Researcher × 3 (parallel)     — information gathering
  Coder                         — implementation
  Critic                        — quality review
  Tester                        — test creation and validation
```

**6-phase execution:**
1. Strategic planning (captain breaks down task)
2. Parallel research sweep (3× researcher calls)
3. Plan synthesis + critic review
4. Iterative refinement (if critical concerns found)
5. Implementation with review loop
6. Final integration

**Key technique — shape-based role enforcement:** Each agent declares what it can and cannot do. Captain cannot write code; Coder cannot design. This prevents role confusion and makes delegation explicit.

**AIWG relevance:** Directly maps to **Concierge #602**. The captain pattern is the production-tested form of what Concierge is trying to achieve: a persistent central coordinator that delegates specialized work and synthesizes results.

**Recommendation:** Reference this implementation when building Concierge. Specifically adopt shape enforcement and the parallel research → synthesis → conditional refinement loop. See #621.

---

### 5. RLM Strategy Examples (40–43)

Four recursive/iterative strategy patterns, each directly relevant to AIWG's RLM addon:

| Example | Pattern | AIWG Gap |
|---------|---------|----------|
| 40-rlm-self-refine | Worker + critic, score ≥ 85 or max 5 iterations, issue-targeted refinement | AIWG likely similar — compare specifics |
| 41-rlm-divide-conquer | Map-reduce, semantic boundary chunking, evidence-weighted synthesis on conflict | Conflict resolution strategy may be richer |
| 42-rlm-filter-recurse | Broad screen → deep dive, evidence chains, adaptive scope broadening | Adaptive scope strategy worth comparing |
| 43-rlm-pairwise | Pairwise comparison, batch ~25 pairs, cluster identification with uncertainty | AIWG may not have pairwise strategy |

**Adaptive strategies** are a key differentiator in OpenProse's RLM patterns — programs detect insufficient progress and adjust approach mid-execution (broaden criteria, refine query). This is more sophisticated than simple iteration.

**Recommendation:** Gap analysis of AIWG RLM addon vs. these 4 patterns, focusing on conflict resolution and adaptive scope. See #622.

---

### 6. Patterns & Antipatterns Catalog

OpenProse ships a mature `patterns.md` and `antipatterns.md`. Several are directly applicable to AIWG as rules.

**Patterns worth adopting as AIWG rules:**
- **agent-specialization**: "Specialized agents produce better results than generalist prompts"
- **model-tiering**: Sonnet for orchestration/control flow; Opus for hard reasoning; Haiku for simple tasks
- **multi-perspective-review**: Diverse viewpoints before synthesis (already in AIWG, reinforcement useful)
- **adversarial-validation**: One agent challenges another's work
- **prompt-as-contract**: Specify expected inputs/outputs clearly

**Antipatterns worth adding as AIWG rules:**
- **god-session**: Single agent doing everything — hard to debug, impossible to parallelize
- **parallel-then-synthesize** (when unnecessary): For related analysis feeding one conclusion, the coordination overhead often outweighs parallelism benefits
- **vague-discretion**: Ambiguous conditions like "good enough" or "zero bugs" — use measurable thresholds
- **opus-for-everything**: Reserve most powerful model for genuinely hard reasoning
- **context-bloat**: Pass only relevant context to each agent
- **unbounded-loop**: Always bound loops with max iterations
- **implicit-dependencies**: Relying on conversation history rather than explicit context passing

**Recommendation:** Convert top 5 antipatterns into AIWG rules under `agentic/code/addons/aiwg-utils/rules/`. See #623.

---

### 7. SOUL.md Comparison

OpenProse's `SOUL.md` is a **functional capability statement** (328 bytes):
> "I can become a VM that spawns parallel agents, persists state across sessions, and orchestrates arbitrarily complex workflows."

This is not a traditional SOUL. It's a pithy runtime description, not values/persona/behavioral constraints.

**The real SOUL equivalent in OpenProse is distributed across:**
- `tenets.md` — 17 design principles that shaped the architecture
- `patterns.md` / `antipatterns.md` — behavioral norms for agents
- `system-prompt.md` — execution role constraints

**AIWG SOUL** is normative (values, voice, behavioral constraints) — closer to what OpenProse distributes across its guidance files. The two are fundamentally different approaches to the same problem.

**Key tenet relevant to AIWG SOUL design:**
> "Evaluate all decisions: does this program get better as models improve?" — Prefer declarative contracts over imperative procedures; they auto-improve with better models.

**No action needed** — AIWG's SOUL approach is more complete.

---

### 8. Plugin Model Comparison

OpenProse uses:
```bash
npx skills add openprose/prose
```

Plugin structure: `.claude-plugin/plugin.json` + `marketplace.json`.

`plugin.json` fields: `name`, `version`, `description`, `keywords`, `skill` (path to SKILL.md), `repository`.

**AIWG comparison:** AIWG's plugin system is more comprehensive (supports multiple artifact types — agents, commands, skills, rules; multi-platform deployment; plugin registry). OpenProse's model is simpler (single skill file, single platform).

**No action needed** — AIWG's model is a superset.

---

## Potential Integration Points (from issue body)

| Integration | Assessment | Recommendation |
|------------|------------|----------------|
| `prose run` as AIWG skill | Medium-term — useful for Prose programs from AIWG workflows | Defer until Prose is more stable (v1.0) |
| Contract syntax in AIWG skills | **High priority** — direct benefit now | File #619 |
| Forme wiring for AIWG flows | Medium-term — requires AIWG skill contracts first | Follow from #619 phase 2 |
| Prose stdlib as AIWG addons | Low — AIWG has equivalents; monitor for gaps | No action now |

---

## Follow-on Issues Filed

| Issue | Title | Priority |
|-------|-------|----------|
| #619 | feat(skills): adopt `requires:`/`ensures:`/`errors:` contract syntax for skill definitions | High |
| #620 | feat(daemon): use OpenProse 3-tier memory scoping to inform #608 cross-session memory design | High |
| #621 | feat(concierge): reference captain's-chair pattern for Concierge #602 implementation | Medium |
| #622 | research: gap analysis of AIWG RLM addon vs OpenProse RLM strategies 40–43 | Medium |
| #623 | feat(rules): add god-session, vague-discretion, and context-bloat antipatterns as AIWG rules | Medium |

---

## Files Reviewed

- `skills/open-prose/guidance/patterns.md` ✓
- `skills/open-prose/guidance/antipatterns.md` ✓
- `skills/open-prose/guidance/tenets.md` ✓
- `skills/open-prose/guidance/system-prompt.md` ✓
- `skills/open-prose/SOUL.md` ✓
- `skills/open-prose/forme.md` ✓
- `skills/open-prose/prose.md` ✓
- `skills/open-prose/lib/user-memory.md` ✓
- `skills/open-prose/lib/project-memory.md` ✓
- `skills/open-prose/lib/` (full inventory) ✓
- `skills/open-prose/examples/29-captains-chair/` ✓
- `skills/open-prose/examples/37-the-forge/` ✓
- `skills/open-prose/examples/40-43` (all RLM examples) ✓
- `skills/open-prose/examples/46-workflow-crystallizer/` ✓
- `skills/open-prose/examples/47-language-self-improvement/` ✓
- `.claude-plugin/plugin.json` ✓
