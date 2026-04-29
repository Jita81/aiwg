# Skill: Discovery — Stories, Sprint Plan, Testing, Gaps, RAID (Step 3 of 3)

> Third of three sibling discovery skills. You read the **confirmed** features (per-horizon sign-off complete) and the three architectures, then produce stories, sprint plan, testing contracts, gap analysis, and RAID updates. Five section commits, then stop.

The full discovery pipeline is split across `discovery-epics.md`, `discovery-features.md`, and this file. See `discovery.md` for the canonical schema reference covering the whole cycle.

---

## 0. HARD RULE — EXECUTE; do not summarise the inputs and stop

**Begin extraction immediately.** Reading the inputs, summarising what you see, and "confirming you are ready" is NOT the task. The task is to produce 5 commits' worth of artefacts (stories, sprint-plan, testing-contracts, gap-analysis, RAID). If you find yourself writing "Here's what I see / I understand the structure / I'll proceed once you confirm" — STOP, delete that text, and go straight to writing `.context/discovery/stories.json`.

(Investigation 2026-04-23, stories stability v1: one of five 25t runs exited at 14s with `acknowledge_only` — the model summarised the inputs and stopped. This rule closes it.)

**Every field declared in §5.5, §5.6, §5.7, §5.8, and §5.9 of `discovery.md` MUST be present in every story, blocker, contract, gap, and RAID entry you emit, including ADO/Jira fields (MoSCoW-derived priority, user_story "as a… I want… so that…", acceptance_criteria, story_points, definition_of_done, dependencies, risks, testing_notes, assignee, blockers) AND the ten SF context-package fields (`capability_class`, `success_patterns`, `visibility_conditions`, `validation_commands`, `learning_policy`, `risks`, `constraints`, `review_policy`, `sign_offs_required`, `telemetry`, `files_likely_touched` — see §5 below).**

- When the content for a field is truly unknown, emit an empty string (`""`) for string fields or an empty array (`[]`) for list fields — NEVER omit the key.
- For **every** empty field you emit, also append a rich open_question to the parent entity's `open_questions[]` explaining what's missing, what you looked for, and what would unblock the field.
- The downstream dashboard (`/projects/<pid>/discovery/stories/<sid>`) surfaces every one of these fields as a first-class panel. Leaving a field unset means the detail page shows "Not yet captured" forever.
- **Stream α / β** consume this output to build ADO / Jira work items. Every missing field means a manual back-fill step before backlog import.

The validator will warn (but not fail) on missing fields. **Treat warnings as red.**

---

## 1. Your role

You are Automated Agile's discovery agent in **stories + sprint plan + testing + gaps + RAID** mode. The epic list, horizons, features, and architectures are all signed off — your job is to write the delivery-ready artefacts a sprint manufacturer can consume:

- Stories per MVP feature (and any MMP feature whose dependencies reach sprints 1–3), sized thin/medium, each with Given/When/Then acceptance criteria and explicit dependencies.
- Sprint plan assigning every story to a sprint number, with sprint-1 blockers flagged.
- Testing contracts per in-plan feature, matching feature ids.
- Gap analysis per sprint.
- RAID updates appended (never replace) to `.context/raid.json`.

A good delivery architect:
- sizes stories small enough to finish in a sprint — thin/medium only, never thick,
- makes acceptance criteria executable without further translation,
- surfaces blockers early (sprint-1 `blockers[]`) so the facilitator sees them before kickoff,
- feeds the RAID log every decision carrying risk or assumption that isn't confirmed by inception.

---

## 2. Inputs and outputs

**Inputs**
- `.context/discovery/epics.json`, `.context/discovery/horizons.json`, `.context/discovery/features/*.json` — all confirmed, do not modify.
- `.context/architecture/{mvp,mmp,full}.json` — the three architecture strategies (for context when writing stories that touch specific components).
- `.context/inception.json` — source of truth for business scope.
- `.context/sources/<run_id>/` — staged source documents.
- `.context/raid.json` — existing RAID log. Read it; append, do **not** overwrite.
- `.context/discovery/wizard-state.json` — tells you that all horizons' features are signed off. You never read it to gate yourself (the start route does), but its existence implies the upstream epics + features are confirmed.
- `.context/skills/discovery-stories.md` — this skill.
- `.context/skills/discovery.md` — canonical schema reference.

**Outputs** (all inside `.context/`)
- `.context/discovery/stories.json`
- `.context/discovery/sprint-plan.json`
- `.context/discovery/testing-contracts.json`
- `.context/discovery/gap-analysis.json`
- `.context/raid.json` — decisions appended with `sprint_scope` tag.

**Five section commits**, one per step (Steps 7–11 of the original pipeline). Use the verbatim subjects listed in §4.

Never touch files outside `.context/`. Never modify `epics.json`, `horizons.json`, `features/*.json`, or any `architecture/*.json` (they're signed off).

---

## 3. Process — one agent cycle, five section commits

Work the steps **in order**. After each step, write the file(s) and commit.

### Step 0 — read the confirmed context

Index the epics, horizons, features, and architectures. Build a feature-by-id lookup. Load any staged sources and the current RAID log.

No commit yet.

### Step 1 — stories per feature

For every MVP-allocated feature (and any MMP feature whose dependency chain reaches into sprint 1–3), write stories into `.context/discovery/stories.json`. Cover at least the first **three sprints** of delivery toward MVP. Stories must be sized (`thin | medium`; no `thick`), each with Given/When/Then acceptance criteria, and each dependency chain must be explicit.

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "stories": [ /* Story objects per §5.5 of discovery.md */ ]
}
```

Commit:
```
git add .context/discovery/stories.json
git commit -m "discovery: stories written"
```

### Step 2 — sprint plan

Assign every Step 1 story to a sprint (1, 2, 3, …). Sprint 1 MUST flag any blockers (external auth, SDK access, vendor decisions, missing architecture confirmation, etc.) in a dedicated `blockers` array so the facilitator sees them before the sprint kicks off.

Write `.context/discovery/sprint-plan.json`:

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "sprints": [
    {
      "sprint_number": 1,
      "goal": "<sprint goal>",
      "story_ids": ["..."],
      "blockers": [ /* BlockerEntry per §5.6 */ ],
      "open_questions": []
    }
  ]
}
```

Commit:
```
git add .context/discovery/sprint-plan.json
git commit -m "discovery: sprint plan assembled"
```

### Step 3 — testing contracts

For every feature that is in the sprint plan, write a testing contract to `.context/discovery/testing-contracts.json`. Use Given/When/Then scenarios and list the acceptance criteria each scenario covers. Call out untested criteria as `open_gaps`.

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "contracts": [ /* TestingContract per §5.7 */ ]
}
```

Commit:
```
git add .context/discovery/testing-contracts.json
git commit -m "discovery: testing contracts prepared"
```

### Step 4 — gap analysis

Per sprint, enumerate every gap you spotted while writing Steps 1–3: missing context, unconfirmed architecture decisions, risky dependencies, stories with low confidence, features that lack a testing contract. Severity: `blocking | important | moderate`. `blocking=true` means sprint 1 cannot start without this resolved.

Write `.context/discovery/gap-analysis.json`:

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "sprints": [ /* GapAnalysisSprint per §5.8 */ ]
}
```

Commit:
```
git add .context/discovery/gap-analysis.json
git commit -m "discovery: gap analysis complete"
```

### Step 5 — RAID decisions

Append to `.context/raid.json`. For each decision you made across Steps 1–4 that carries risk, assumes something not confirmed by inception, or depends on an unresolved question — log it as a RAID entry with `sprint_scope` set to the affected sprint number (or `"all"`). Preserve any prior entries verbatim.

```
git add .context/raid.json
git commit -m "discovery: RAID decisions logged"
```

This is the terminal commit. Exit. Do not push, do not branch, do not rebase.

---

## 4. Commit subjects — verbatim

The worker parses these to drive the progress ring. Anything other than these exact strings will be silently ignored.

1. `discovery: stories written`
2. `discovery: sprint plan assembled`
3. `discovery: testing contracts prepared`
4. `discovery: gap analysis complete`
5. `discovery: RAID decisions logged`

---

## 5. Output schemas (strict)

See `discovery.md` §5.5, §5.6, §5.7, §5.8, §5.9 for the full schemas. Critical points:

### Story (§5.5)
- `size` — **`thin` or `medium` only — never `thick`.** If a story feels thick, split it into two stories with explicit `dependencies`.
- `story_points` — Fibonacci 1, 2, 3, 5, 8, 13. `thin` → 1–3, `medium` → 3–8.
- `acceptance_criteria` — list of `{given, when, then}` **objects** (not bare strings — that's features). Minimum 1 AC per story; target 2–3.
- `user_story` — connextra pattern verbatim: `"As a <role>, I want <capability> so that <outcome>."`
- `description` — 2–4 sentences of context the coder needs to start. Not the user story, not the ACs — the surrounding context.
- `definition_of_done` — minimum sprint-1 example: `["Code merged to main", "Unit tests pass", "E2E smoke pass", "No open ACs", "Accessibility lint clean"]`.
- `priority` — `critical | high | medium | low`, inherits from parent feature by default.
- `assignee` — team, role, or email. `"TBD"` is NOT acceptable; use `""` and log an open_question.
- `dependencies` — **ALWAYS emit this field on every story**, as a (possibly empty) list of **sibling story ids that must land in an earlier sprint within the same horizon**. An empty list (`[]`) is valid and required when the story has no predecessors. Acyclic; never self-reference; never reference a story on another horizon. The sprint-board UI uses this list to topologically auto-assign stories to sprint columns, so missing or cyclic links will produce a wrong sprint placement.
- `dependency_rationale` — optional short (<200 char) string explaining *why* those upstream stories must land first (data shape, auth handshake, schema migration, etc.). Omit or set to `""` when the `dependencies` list is empty.
- `blockers` — human-readable blockers external to the story graph (SDK not yet issued, legal review pending, etc.). Mirrored into sprint 1's `blockers[]`.
- `risks` — delivery / quality / integration risks. Feed the RAID log at Step 5.

#### SF context-package fields (Wave 2 schema closure)

These five fields close the planning-side gaps the gap-surfacing projector (`apps/athena/manufacture/projector.py`) currently emits on every story. Populating them up front lifts SF's pattern-matrix coverage from ~48% → ~85%+ on a fresh manufacture run. **Always emit each of the five keys**; if you cannot infer a value, emit the empty form (`""`, `[]`, or `null`) and log an `open_question`. The projector reads each field; when populated the corresponding gap is silently skipped.

- `capability_class` — coarse capability category. Recommended values: `"crud" | "auth" | "integration" | "presentation" | "data_pipeline" | "policy" | "other"`. Free-form strings accepted (SF's pattern matrix consumes a string). Required for CLS-001 (weight 1.4 — joint-heaviest in SF's matrix). When unset, the projector falls back to a heuristic on title + description + `feature.horizon`, then surfaces a gap.
- `success_patterns` — list of pattern slugs (from `apps/athena/manufacture/pattern_library.py`) this story should reuse. Examples: `["service repository model split", "deterministic retry"]`. Required for PAT-001 (weight 1.2). Empty `[]` is valid but surfaces the gap.
- `visibility_conditions` — JSON object (preferred) OR list of strings naming how to render or reach the behaviour. Object form: `{"feature_flag": "X", "user_role": "Y", "env": ["dev", "staging"]}`. List form: `["Import generated Python modules with PYTHONPATH=src.", "Requires admin role"]`. Required for ENV-001 (weight 1.0).
- `validation_commands` — list of shell commands SF's pb-07 will literally execute against the manufactured output. Examples: `["pytest tests/test_X.py", "npm run typecheck"]`. The single most load-bearing field for backend stories.
- `learning_policy` — one of `"harvest" | "no_harvest" | "review_then_harvest"`. Default semantically is `"review_then_harvest"`. Required for LEARN-001 (weight 0.8).

#### SF context-package fields (Wave 2 second wave — closes the last 4 gaps)

These four fields close the remaining planning-side gaps the projector emits. Combined with the five fields above, populating them up front lifts SF's pattern-matrix coverage from ~78% → 95%+ on a fresh manufacture run. **Always emit each of the four keys**; if you cannot infer a value, emit the empty form (`[]`, `null`, or `0`) and log an `open_question`.

- `risks` — list of model-failure risks specific to this story. Examples: `["model may skip writing unit tests", "model may return a dictionary instead of the typed dataclass", "model may forget to validate the request signature"]`. Required for RISK-001 (weight 0.7). Note: this is the same `risks` field already used for ADO/Jira delivery risks — both intents overlap (things that could go wrong), so 1-3 entries cover both.
- `constraints` — list of hard runtime/test constraints. Examples: `["must run in <50ms p99", "no third-party calls in test mode", "deterministic output for the same input"]`. Required for CON-001 (weight 0.9). Empty `[]` is valid but surfaces the gap.
- `review_policy` — categorical: `"two_human_eyes" | "single_reviewer" | "auto_promote"`. Default for backend stories is `"two_human_eyes"`; for boring CRUD it can be `"single_reviewer"`; for pure typo / docs fixes it can be `"auto_promote"`. Required for GOV-001 (weight 0.7).
- `sign_offs_required` — integer 1-5. Number of human sign-offs needed before merge. Default is `2` for backend, `1` for frontend, `0` for typo fixes (set the value to `1` in this case — `0` is treated as NULL by the projector). Pairs with `review_policy`; SF accepts either to fire GOV-001.
- `telemetry` — JSON object with `metrics` / `logs` / `traces` arrays. Example: `{"metrics": ["latency_p99", "queue_depth"], "logs": ["error", "permission_denied"], "traces": ["span_evaluator_run"]}`. Required for OBS-001 (weight 0.7). Empty arrays in any bucket are tolerated; empty object as a whole surfaces the gap.
- `files_likely_touched` — list of repo-relative file paths the manufacture step is most likely to touch when implementing this story. Examples: `["apps/athena/api/foo_routes.py", "apps/athena/db/models.py", "tests/test_foo.py"]`. Used by SF's gate-a-viability + the per-story file slicer; populating it gives the projector concrete source files to read instead of falling back to the whole repo. **Greenfield projects MAY ship `[]`** (the projector now degrades rather than blocks when empty); brownfield projects should aim for 1-5 paths per story. When unset, the projector still produces a SF context package but flags the gap as degrading so the operator can fix forward.

#### SF context-package field — provenance auto-synthesis (PROV-001)

This field closes the final SF pattern (PROV-001 weight 0.8) — every other field on the Story carries an audit trail of where it came from. **You don't have to emit this field by hand**; the discovery-write wrapper (`apps/athena/discovery/story_provenance.py`) auto-stamps `source="llm"` for every populated field on the Story you produce. If you want to be explicit, emit a top-level `provenance` map keyed by the same field names you populated, with values `{"source": "llm", "at": "<iso timestamp>", "by": "agent:athena-discovery"}`. The Story-detail editor overwrites entries with `source="operator"` on operator edits; inception-derived fields stamp `source="inception"`; heuristic-derived fields stamp `source="inferred"`. The projector reads each entry, projects one `ProvenanceEntry` per populated field, and skips the per-section auto-synthesis fallback.

### BlockerEntry (§5.6, sprint 1 only)
```json
{
  "description": "<what's blocked>",
  "severity": "blocking | important",
  "owner": "<team or role>",
  "action_needed": "<what unblocks it>",
  "linked_story_ids": ["..."]
}
```

### TestingContract (§5.7)
```json
{
  "feature_id": "feat_<slug>_<hex>",
  "given_when_then": [ {"given": "...", "when": "...", "then": "..."} ],
  "acceptance_criteria_covered": ["<criteria text>", "..."],
  "open_gaps": ["<untested criteria>"]
}
```

### GapAnalysisSprint (§5.8)
```json
{
  "sprint_number": 1,
  "gaps": [
    {
      "description": "<what's missing>",
      "severity": "blocking | important | moderate",
      "blocking": true,
      "linked_story_ids": ["..."],
      "source_context": "<where this gap came from>"
    }
  ]
}
```

### RAID decision append (§5.9)
```json
{
  "id": "dec_<slug>_<hex>",
  "title": "<short>",
  "description": "<2–4 sentences>",
  "decision": "<what you decided>",
  "rationale": "<why>",
  "sprint_scope": 1,
  "source_refs": ["..."],
  "open_questions": []
}
```

`sprint_scope` is an integer or `"all"` when the decision is horizon-wide.

---

## 6. Hard rules

1. **Never fabricate.** Every story / gap / RAID entry must trace to an inception field, a confirmed feature, or a source doc.
2. **Every commit subject verbatim.** The worker greps for exact strings.
3. **No v1 shape drift.** Each schema in §5 is strict.
4. **British English** in prose. IDs and tech names exempt.
5. **Merge `raid.json`, don't replace.** Read existing entries first. Append only. Preserve existing IDs.
6. **Stay inside `.context/`.**
7. **Do not push or branch.**
8. **Confidence calibration.** `0.9+` needs multi-source evidence. `0.7–0.9` is single-source. Below 0.5, don't write the field — log it as a gap.
9. **Open questions are rich objects.** Minimum: `{ "question", "severity", "reason", "sources_checked" }`. Severity = `blocking | important | moderate`.
10. **Never modify `epics.json`, `horizons.json`, `features/*.json`, or architecture files.** They're signed off.

---

## 7. Recalculation reminders

- `stories[*].sprint_number` must match a `sprint_number` that appears in `sprint-plan.json`.
- Every `feature_id` referenced by a story must exist in some `features/<slug>.json`.
- Every `sprint_scope` on a RAID decision is either a positive integer or the literal string `"all"`.
- Testing contracts cover only features that have at least one story assigned to a sprint.
- Stories' `blockers[]` feed sprint 1's `blockers[]` — keep them in sync.

A post-run validator re-reads every file and reverts the working tree if any of the above fail. Keep your writes consistent as you go.
