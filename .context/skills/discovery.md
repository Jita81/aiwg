# Skill: Discovery Extraction (reference index — read-only)

> **This skill has been split into three sibling skills.** This file is now a reference index and **canonical schema reference**. Do not execute the 11-step pipeline below in a single agent cycle — that path is deprecated.
>
> - **Step 1 — epics only:** `discovery-epics.md`. Produces `.context/discovery/epics.json` and stops. Commits once: `discovery: epics extracted`.
> - **Step 2 — features + architectures:** `discovery-features.md`. Reads confirmed epics + (user-edited) horizons, writes features per epic and the three architecture strategies. Five commits: horizons allocated, features generated, architecture drafted (MVP / MMP / Full).
> - **Step 3 — stories + sprint plan + testing + gaps + RAID:** `discovery-stories.md`. Reads confirmed features, writes stories, sprint plan, testing contracts, gap analysis, and appends to the RAID log. Five commits.
>
> The user reviews and signs off between each step via the 3-step wizard (state tracked in `.context/discovery/wizard-state.json`). The start route gates running step 2 on step 1 being signed off, and running step 3 on all three horizons' features being signed off.
>
> **For execution, follow the three sibling skills.** Keep this file read-only — it remains the canonical schema reference for §5 (epic / horizon / feature / architecture / story / blocker / testing contract / gap / RAID shapes).

---

## 0. HARD RULE — every §5 field MUST be present

**Every field declared in §5 MUST be present in every epic, feature, and story you emit, including ADO/Jira fields (MoSCoW, business case, success metrics, scope, out_of_scope, user_story "as a… I want… so that…", acceptance_criteria, priority, labels, story_points, definition_of_done, dependencies, risks, testing_notes, assignee, blockers).**

- When the content for a field is truly unknown, emit an empty string (`""`) for string fields or an empty array (`[]`) for list fields — NEVER omit the key.
- For **every** empty field you emit, also append a rich open_question to the parent entity's `open_questions[]` explaining what's missing, what you looked for, and what would unblock the field:
  ```json
  { "question": "What is the MoSCoW class for this epic?", "severity": "moderate", "reason": "Inception does not state priority; product_vision lists capabilities but not their relative class.", "sources_checked": ["inception.json:product_vision", "sources/<run_id>/brief.md"], "field": "moscow_class" }
  ```
- The downstream dashboard (`/projects/<pid>/discovery/epics/<eid>` and `/features/<fid>`) surfaces every one of these fields as a first-class panel. Leaving a field unset means the detail page shows "Not yet captured" forever — that is a regression, not a feature.
- **Stream α / β** consume this output to build ADO / Jira work items. Every missing field means a manual back-fill step before backlog import.

The validator will warn (but not fail) on missing fields. **Treat warnings as red.**

---

## 1. Your role

You are Automated Agile's discovery agent, working as a **product strategist + solution architect**. Your output is **load-bearing** — the sprint manufacturing pipeline consumes this context to write real code. Wrong context produces wrong code. Treat every epic, horizon allocation, feature, story, architecture decision, and testing contract as evidence-backed and decision-ready.

A good product strategist:
- traces every scope decision back to a business capability or source_ref,
- separates MVP (what ships first to learn) from MMP (what wins the market) from Full Product (the long-term vision),
- flags gaps as open questions instead of guessing,
- never invents features that aren't implied by the inception context.

A good solution architect:
- chooses technology that matches constraints + team,
- writes components that map 1:1 to features (or clusters of features),
- calls out risks with code-level implications,
- revises the architecture per horizon rather than force-fitting one shape across MVP / MMP / Full.

Apply both lenses, in that order.

---

## 2. Inputs and outputs

**Inputs**
- `.context/inception.json` — the confirmed v2 inception context. Read it once in Step 0 and treat it as the single source of truth for business scope.
- `.context/sources/<run_id>/` — any discovery-specific source documents staged for this run (may be empty; inception often suffices).
- `.context/raid.json` — the existing RAID log (may have entries from inception). Read it; append, do not overwrite.
- `.context/skills/discovery.md` — this skill.

**Outputs** (all inside `.context/`)
- `.context/discovery/epics.json` — one epic per inception `key_capability`.
- `.context/discovery/horizons.json` — allocations across MVP / MMP / Full Product.
- `.context/discovery/features/<epic-slug>.json` — features per epic, each with horizon label.
- `.context/architecture/mvp.json`, `.context/architecture/mmp.json`, `.context/architecture/full.json` — one architecture per horizon.
- `.context/discovery/stories.json` — stories per feature, covering 3+ sprints toward MVP.
- `.context/discovery/sprint-plan.json` — sprint assignment with blockers flagged on sprint 1.
- `.context/discovery/testing-contracts.json` — per in-plan feature.
- `.context/discovery/gap-analysis.json` — per sprint.
- `.context/raid.json` — decisions appended with `sprint_scope` tag.

**Eleven section commits**, one per step (Steps 1–11). Use the verbatim subjects listed in §4.

Never touch files outside `.context/`. Never modify files under `.context/sources/`. Do not create branches, push, or rebase.

---

## 3. Process — one agent cycle, eleven section commits

Work the sections **in order**. After each section, write the file(s) and commit — the worker watches for those commits and ticks the UI progress ring as they land.

### Step 0 — read the inception context

Open `.context/inception.json`. Build a mental model of:
- The named `key_capabilities` (these drive Step 1).
- `target_users` + `success_metrics` (these drive MVP selection in Step 2).
- `technical_approach`, `architecture_constraints`, `dependencies`, `risk_areas` (these drive Steps 4–6).
- `phase_breakdown`, `effort_estimates`, `timeline` (these drive Steps 7–8).

Read every file in `.context/sources/<run_id>/` (if any) and the current `.context/raid.json`. List any gaps as candidates for `open_questions` or new RAID entries — you'll decide their home at the end.

No commit yet. This is the read-only prep step.

### Step 1 — epics (one per inception key_capability)

For every `key_capability` named in the inception context, write exactly one epic with the schema in §5.1. Extra epics are allowed only if a source document justifies a capability the inception missed — in that case, also log a RAID question at Step 11.

Write to `.context/discovery/epics.json`:

```json
{ "version": 1, "generated_at": "<ISO8601 UTC>", "epics": [ /* epic objects */ ] }
```

Commit:
```
git add .context/discovery/epics.json
git commit -m "discovery: epics extracted"
```

### Step 2 — horizon allocations (MVP / MMP / Full Product)

Allocate every capability / epic to one of three horizons:

- **MVP** — smallest slice that validates the riskiest assumption with real users. Ships in 3–6 sprints.
- **MMP** — feature set that wins the named market segment. Builds on MVP.
- **Full Product** — the long-term vision: every capability, every segment, every risk mitigation.

Write to `.context/discovery/horizons.json`:

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "allocations": [ /* HorizonAllocation objects per §5.2 */ ]
}
```

Every epic MUST appear in at least one allocation. Each allocation records the `rationale` for *why that horizon*, not just *what the horizon contains*.

Commit:
```
git add .context/discovery/horizons.json
git commit -m "discovery: horizons allocated"
```

### Step 3 — features per epic

For every epic, write 2–6 features into `.context/discovery/features/<epic-slug>.json`. Each feature is scoped to a single epic, carries an explicit `horizon` label, lists acceptance criteria, and references the inception field(s) or source doc(s) that justified it.

File shape (one per epic):

```json
{
  "version": 1,
  "epic_id": "<epic id>",
  "epic_slug": "<slug>",
  "generated_at": "<ISO8601 UTC>",
  "features": [ /* Feature objects per §5.3 */ ]
}
```

Commit (one commit covering all features across all epics):
```
git add .context/discovery/features/
git commit -m "discovery: features generated"
```

### Step 4 — MVP architecture

Draft the MVP architecture as a single JSON file at `.context/architecture/mvp.json` matching the shape in §5.4. The MVP architecture MUST cover every MVP-allocated feature and NO more — resist the temptation to pre-solve MMP concerns.

Commit:
```
git add .context/architecture/mvp.json
git commit -m "discovery: architecture drafted (MVP)"
```

### Step 5 — MMP architecture

Draft the MMP architecture at `.context/architecture/mmp.json`. This is the MVP shape plus whatever components are added to serve MMP-allocated features. Call out changes explicitly in `summary`.

Commit:
```
git add .context/architecture/mmp.json
git commit -m "discovery: architecture drafted (MMP)"
```

### Step 6 — Full Product architecture

Draft the Full Product architecture at `.context/architecture/full.json`. This is the long-range target. It may call out components that are currently aspirational — say so in `summary` and in each affected component's `description`.

Commit:
```
git add .context/architecture/full.json
git commit -m "discovery: architecture drafted (Full)"
```

### Step 7 — stories per feature

For every MVP-allocated feature (and any MMP feature whose dependency chain reaches into sprint 1–3), write stories into `.context/discovery/stories.json`. Cover at least the first **three sprints** of delivery toward MVP. Stories must be sized (`thin | medium`; no `thick`), each with Given/When/Then acceptance criteria, and each dependency chain must be explicit.

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "stories": [ /* Story objects per §5.5 */ ]
}
```

Commit:
```
git add .context/discovery/stories.json
git commit -m "discovery: stories written"
```

### Step 8 — sprint plan

Assign every Step 7 story to a sprint (1, 2, 3, …). Sprint 1 MUST flag any blockers (external auth, SDK access, vendor decisions, missing architecture confirmation, etc.) in a dedicated `blockers` array so the facilitator sees them before the sprint kicks off.

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

### Step 9 — testing contracts

For every feature that is in the sprint plan (i.e. has at least one story with a sprint assignment), write a testing contract to `.context/discovery/testing-contracts.json`. Use Given/When/Then scenarios and list the acceptance criteria each scenario covers. Call out untested criteria as `open_gaps`.

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

### Step 10 — gap analysis

Per sprint, enumerate every gap you spotted while writing Steps 7–9: missing context, unconfirmed architecture decisions, risky dependencies, stories with low confidence, features that lack a testing contract. Severity: `blocking | important | moderate`. `blocking=true` means sprint 1 cannot start without this resolved.

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

### Step 11 — RAID decisions

Append to `.context/raid.json`. For each decision you made across Steps 1–10 that carries risk, assumes something not confirmed by inception, or depends on an unresolved question — log it as a RAID entry with `sprint_scope` set to the affected sprint number (or `"all"`). Preserve any prior entries verbatim.

```
git add .context/raid.json
git commit -m "discovery: RAID decisions logged"
```

This is the terminal commit. Exit. Do not push, do not branch, do not rebase.

---

## 4. Commit subjects — verbatim

The worker parses these to drive the progress ring. Anything other than these exact strings will be silently ignored.

1. `discovery: epics extracted`
2. `discovery: horizons allocated`
3. `discovery: features generated`
4. `discovery: architecture drafted (MVP)`
5. `discovery: architecture drafted (MMP)`
6. `discovery: architecture drafted (Full)`
7. `discovery: stories written`
8. `discovery: sprint plan assembled`
9. `discovery: testing contracts prepared`
10. `discovery: gap analysis complete`
11. `discovery: RAID decisions logged`

---

## 5. Output schemas (strict)

All IDs are lowercase-slug + short hex suffix, e.g. `epic_user_onboarding_a1b2`, `feat_email_verify_c3d4`, `story_wire_magic_link_e5f6`. Every file is UTF-8 JSON, indented 2 spaces, with a trailing newline.

### 5.1 Epic

```json
{
  "id": "epic_<slug>_<hex>",
  "name": "<short noun phrase>",
  "description": "<2–4 sentences: what, for whom, why>",
  "source_capability": "<exact key_capability string from inception.json>",
  "source_refs": ["<inception field name>", "<source basename>"],
  "confidence": 0.0,
  "open_questions": [],

  "moscow_class": "must | should | could | wont",
  "business_case": "<1 paragraph — why now, what changes if we don't build>",
  "success_metrics": ["<measurable outcome 1>", "<measurable outcome 2>"],
  "scope": ["<in-scope capability 1>", "..."],
  "out_of_scope": ["<explicitly excluded capability>", "..."],
  "dependencies": ["<epic id>", "..."],
  "tags": ["<label>", "..."]
}
```

`source_capability` MUST match one of the entries in `inception.sections.product_vision.fields.key_capabilities.value_long` (or an approved source doc). `source_refs` lists the **basenames** (e.g. `brief.md`, `inception.json:product_vision`) that justified this epic.

**ALL fields in this schema are REQUIRED.** Per §0, when you can't evidence a field emit `""` (string) or `[]` (list) and log a rich `open_question` pointing at that field. In particular:

- `moscow_class` — one of `must | should | could | wont`, or `""` with an open_question.
- `business_case` — a complete paragraph describing why the organisation is investing now and what happens if they don't. Never blank when the inception has *any* value/problem prose — synthesise from `product_vision`, `business_problem`, or `success_metrics` fields.
- `success_metrics` — at least one measurable outcome (KPI, NPS delta, revenue target, time-to-value target). If inception lists success metrics, use them; don't invent new ones.
- `scope` / `out_of_scope` — what this epic explicitly includes / excludes. `out_of_scope` is load-bearing for later horizon conversations; don't leave it empty just because nothing was "excluded by name" — the MVP slice itself constrains scope.
- `tags` — short labels suitable for ADO area paths / Jira labels (lowercase, kebab-case preferred).
- `dependencies` — **epic-level dependency graph.** List of **epic ids (strings) this epic depends on**. Keep it tight — prefer 0–3 deps per epic. A dependency means: *the depending epic cannot be delivered before the dependency epic has shipped*. The horizon-assignment UI uses this to warn (and optionally cascade) when a user moves an epic to an earlier horizon than one of its dependencies — MVP is earlier than MMP, which is earlier than Full. External dependencies are allowed as opaque strings (`ext:stripe-verified`, `vendor:<name>`). Circular dependencies are invalid; rank order must be derivable from the list. If you can't identify a hard ordering, leave the list empty; don't pad it with "related" epics.

`open_questions` entries MUST be objects with at minimum `{question, severity, reason, sources_checked}` plus — when raised for an empty ADO/Jira field — an explicit `field` key naming the field so the enrichment endpoint can find it later.

### 5.2 HorizonAllocation

```json
{
  "horizon": "mvp" | "mmp" | "full",
  "capability": "<inception key_capability>",
  "epic_id": "<epic id from 5.1>",
  "rationale": "<1–3 sentences — why THIS epic sits in THIS horizon, in terms of risk, user learning, or market fit>",
  "source_refs": ["..."]
}
```

**`rationale` is required and load-bearing.** It must explain *why* the epic lives in that horizon, not restate *what* the horizon contains. Example of a good rationale: "MVP — validates the magic-link flow with real users; drop-off here is our riskiest assumption (source: inception.product_vision.riskiest_assumption)." Example of a bad rationale: "Belongs in MVP because MVP is first." If you cannot justify the horizon in terms of learning / risk / market, log an open_question at Step 11 and keep the allocation but mark `rationale` with the uncertainty explicitly.

### 5.3 Feature

```json
{
  "id": "feat_<slug>_<hex>",
  "name": "<short noun phrase>",
  "description": "<2–4 sentences>",
  "epic_id": "<epic id>",
  "horizon": "mvp" | "mmp" | "full",
  "acceptance_criteria": [
    "Given <pre-condition>, when <action>, then <observable outcome>.",
    "Given <…>, when <…>, then <…>."
  ],
  "testing_contract_ref": "<feature id — own>",
  "source_refs": ["..."],
  "open_questions": [],

  "business_value": "<1 paragraph — the user / business outcome this feature unlocks>",
  "user_story": "As a <role>, I want <capability> so that <outcome>.",
  "priority": "critical | high | medium | low",
  "status": "draft | ready | in_progress | blocked | done",
  "dependencies": ["<feature id or external dep>", "..."],
  "labels": ["<label>", "..."]
}
```

`testing_contract_ref` equals the feature's own `id` — the matching testing contract in `testing-contracts.json` uses the same id.

**ALL fields in this schema are REQUIRED.** Per §0, emit `""` / `[]` and log an open_question when evidence is thin. Concrete notes:

- `acceptance_criteria` — **list of Given/When/Then sentences as strings**, one per discrete behaviour. Minimum 2 entries per in-MVP feature; at least 1 for others. Every AC string MUST start with "Given " (case-insensitive is tolerated but the skill writes "Given "), contain " when ", and contain " then ". Bare bullet-point ACs (no G/W/T) are a skill violation.
- `user_story` — the connextra pattern **verbatim**: `"As a <role>, I want <capability> so that <outcome>."` No variations, no "As an admin user: …" colon-forms — they break the sprint parser. One sentence. Present tense.
- `priority` — `critical | high | medium | low`, derived from the MoSCoW class of the parent epic plus sprint proximity. `critical` is reserved for sprint-1 features whose loss kills the MVP; `high` for sprint-1/2; `medium` for sprint-3; `low` otherwise.
- `dependencies` — feature ids (or `ext:` / `vendor:` tokens, same convention as epics) that must land first. This is the feature-level dependency graph the sprint planner walks.
- `labels` — ADO/Jira-compatible labels (lowercase, kebab-case, one word per label).
- `business_value` — a concrete paragraph, not marketing prose. Tie it to a measurable outcome where possible: "Cuts sign-up abandonment from 35% to <10% (source: inception.success_metrics)."
- `open_questions` — same rich-object shape as §5.1. Raise one per empty ADO/Jira field.

### 5.4 Architecture (per horizon)

```json
{
  "version": 1,
  "horizon": "mvp" | "mmp" | "full",
  "generated_at": "<ISO8601 UTC>",
  "summary": "<1 paragraph describing the shape>",
  "components": [
    {
      "id": "comp_<slug>",
      "name": "<name>",
      "type": "frontend" | "backend" | "database" | "service" | "external" | "message_bus" | "security",
      "description": "<purpose>",
      "technology": "<stack choice>",
      "rationale": "<why this tech here>"
    }
  ],
  "connections": [
    { "from": "comp_<slug>", "to": "comp_<slug>", "relationship": "<verb>", "protocol": "<HTTPS | gRPC | SQL | ...>" }
  ],
  "technology_decisions": [
    { "area": "<frontend | backend | persistence | auth | hosting | ci>", "choice": "<tech>", "rationale": "<why>" }
  ],
  "risks": [
    { "description": "<risk>", "severity": "low" | "medium" | "high", "mitigation": "<how>" }
  ]
}
```

This shape is consumed by the deterministic C4-PlantUML renderer at `apps/athena/architecture/c4_renderer.py`.

### 5.5 Story

```json
{
  "id": "story_<slug>_<hex>",
  "name": "<short noun phrase>",
  "feature_id": "<feature id>",
  "sprint_number": 1,
  "size": "thin" | "medium",
  "acceptance_criteria": [
    { "given": "...", "when": "...", "then": "..." }
  ],
  "dependencies": ["<story id>", "..."],
  "blockers": ["<human-readable blocker>"],
  "source_refs": ["..."],
  "open_questions": [],

  "description": "<2–4 sentences — context the coder needs to start>",
  "user_story": "As a <role>, I want <capability> so that <outcome>.",
  "story_points": 3,
  "priority": "critical | high | medium | low",
  "definition_of_done": ["<DoD bullet 1>", "<DoD bullet 2>"],
  "assignee": "<team | role | email>",
  "labels": ["<label>", "..."],
  "risks": ["<risk 1>", "..."],
  "testing_notes": "<how to verify, test data to use, edge cases to cover>",
  "status": "planned | in_progress | blocked | done"
}
```

**ALL fields in this schema are REQUIRED.** Per §0, emit `""` / `[]` (and an open_question for each) when evidence runs out.

- `size` — **`thin` or `medium` only — never `thick`.** If a story feels thick, split it into two stories with explicit `dependencies`. Thick stories are a skill violation and will be rejected by the validator.
- `story_points` — Fibonacci 1, 2, 3, 5, 8, 13. Map: `thin` → 1–3, `medium` → 3–8, and the spread is by complexity, not scope. No 21+.
- `acceptance_criteria` — list of `{given, when, then}` **objects** (not bare strings — that's features). Minimum 1 AC per story; target 2–3. Every field non-empty.
- `user_story` — same connextra pattern as features: `"As a <role>, I want <capability> so that <outcome>."` It's fine for the story to inherit its parent feature's role, but phrase the capability in the story's terms (e.g. feature = "Email verification", story = "As a new user, I want a clickable magic-link email so that I can verify my address without a password.").
- `description` — **2–4 sentences of context the coder needs to start.** Not the user story, not the ACs — the surrounding context: what exists already, what stays out of scope, which file(s) are likely touched, which library / pattern to use. This is the single highest-leverage field for delivery quality — never leave it blank for a sprint-1 story.
- `definition_of_done` — list of bullet strings. Minimum for a sprint-1 story: `["Code merged to main", "Unit tests pass", "E2E smoke pass", "No open ACs", "Accessibility lint clean"]` (adapt to the project). Borrow from `.context/quality_standards` if present.
- `priority` — same `critical | high | medium | low` as features. Inherits from parent feature by default; override only with a logged reason.
- `assignee` — team, role, or email. `"<team-name>"` is fine; `"TBD"` is NOT — use `""` and log an open_question.
- `labels` — lowercase kebab-case, ADO/Jira compatible.
- `dependencies` — **story ids only** (no cross-type references here). The dependency graph must be acyclic. Stories blocked on external work use `blockers`, not `dependencies`.
- `blockers` — human-readable blockers **external to the story graph** (SDK not yet issued, legal review pending, design not signed off, etc.). Mirrored into sprint 1's `blockers[]` via §5.6.
- `risks` — delivery / quality / integration risks this story introduces. Feed the RAID log at Step 11.
- `testing_notes` — concrete verification guidance: test data to use, edge cases to cover, how the tester reproduces the ACs locally.
- `open_questions` — same rich-object shape as §5.1. Raise one per empty ADO/Jira field.

### 5.6 BlockerEntry (sprint 1 only)

```json
{
  "description": "<what's blocked>",
  "severity": "blocking" | "important",
  "owner": "<team or role>",
  "action_needed": "<what unblocks it>",
  "linked_story_ids": ["..."]
}
```

### 5.7 TestingContract

```json
{
  "feature_id": "feat_<slug>_<hex>",
  "given_when_then": [
    { "given": "...", "when": "...", "then": "..." }
  ],
  "acceptance_criteria_covered": ["<criteria text>", "..."],
  "open_gaps": ["<untested criteria>"]
}
```

### 5.8 GapAnalysisSprint

```json
{
  "sprint_number": 1,
  "gaps": [
    {
      "description": "<what's missing>",
      "severity": "blocking" | "important" | "moderate",
      "blocking": true,
      "linked_story_ids": ["..."],
      "source_context": "<where this gap came from>"
    }
  ]
}
```

### 5.9 RAID decision append

Each decision appended to `.context/raid.json.decisions[]` MUST include:

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

`sprint_scope` is an integer (the sprint it applies to) or `"all"` when the decision is horizon-wide.

---

## 6. Hard rules

1. **Never fabricate.** Every epic, feature, story, allocation, and architecture component must trace to an inception field or a source doc. If you can't trace it, log an open question and move on.
2. **Every epic → inception key_capability.** One epic per capability is the baseline. Extra epics require a written `open_question` at Step 11.
3. **Every commit subject verbatim.** The worker greps for exact strings. Any typo skips a tick on the progress ring.
4. **No v1 shape drift.** Each output schema in §5 is strict. Extra keys are ignored by the validator but they waste tokens.
5. **British English** in all prose (`colour`, `behaviour`, `organise`). IDs and technology names are exempt.
6. **Merge `raid.json`, don't replace.** Read existing entries first. Append only. Preserve existing IDs.
7. **Stay inside `.context/`.** Never read code or files outside this directory except the listed sources.
8. **Do not push or branch.** The worker owns git housekeeping — you only `add` + `commit`.
9. **Confidence calibration.** `0.9+` needs multi-source evidence. `0.7–0.9` is single-source. `0.5–0.7` is inference; pair with an open question. Below 0.5, don't write the field — log it as a gap instead.
10. **Open questions are rich objects.** Minimum: `{ "question", "severity", "reason", "sources_checked" }`. Severity = `blocking | important | moderate`.

---

## 7. Recalculation reminders

- `stories[*].sprint_number` must match a `sprint_number` that appears in `sprint-plan.json`.
- Every `feature_id` referenced by a story must exist in some `features/<slug>.json`.
- Every `epic_id` referenced by a feature must exist in `epics.json`.
- Every `horizon` label must be one of `mvp | mmp | full`.
- Every `sprint_scope` on a RAID decision is either a positive integer or the literal string `"all"`.

A post-run validator re-reads every file and reverts the working tree if any of the above fail. Keep your writes consistent as you go.
