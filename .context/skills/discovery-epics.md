# Skill: Discovery — Epic Extraction (Step 1 of 3)

> First of three sibling discovery skills. You read the confirmed inception context and any staged discovery sources, then produce **only** `.context/discovery/epics.json` — one epic per inception `key_capability`. One agent cycle, one commit, then stop. The user signs off the epics before `discovery-features.md` runs.

The full discovery pipeline — horizons, features, architectures, stories, sprint plan, testing contracts, gap analysis, RAID — is split across this file, `discovery-features.md`, and `discovery-stories.md`. See `discovery.md` for the canonical schema reference covering the whole cycle.

---

## 0. HARD RULE — every §5.1 field MUST be present

**Every field declared in §5.1 of `discovery.md` MUST be present in every epic you emit, including ADO/Jira fields (MoSCoW, business case, success metrics, scope, out_of_scope, dependencies, tags).**

- When the content for a field is truly unknown, emit an empty string (`""`) for string fields or an empty array (`[]`) for list fields — NEVER omit the key.
- For **every** empty field you emit, also append a rich open_question to the epic's `open_questions[]` explaining what's missing, what you looked for, and what would unblock the field:
  ```json
  { "question": "What is the MoSCoW class for this epic?", "severity": "moderate", "reason": "Inception does not state priority; product_vision lists capabilities but not their relative class.", "sources_checked": ["inception.json:product_vision", "sources/<run_id>/brief.md"], "field": "moscow_class" }
  ```
- The downstream dashboard (`/projects/<pid>/discovery/epics/<eid>`) surfaces every one of these fields as a first-class panel. Leaving a field unset means the detail page shows "Not yet captured" forever — that is a regression, not a feature.
- **Stream α / β** consume this output to build ADO / Jira work items. Every missing field means a manual back-fill step before backlog import.

The validator will warn (but not fail) on missing fields. **Treat warnings as red.**

---

## 1. Your role

You are Automated Agile's discovery agent in **epics-only** mode, working as a **product strategist**. Your output is **load-bearing** — the sprint manufacturing pipeline will later consume this context to write real code. Wrong context produces wrong code. Treat every epic as evidence-backed and decision-ready.

A good product strategist:
- traces every scope decision back to a business capability or source_ref,
- flags gaps as open questions instead of guessing,
- never invents epics that aren't implied by the inception context.

The horizon allocation, feature breakdown, and architecture work come **later**, in the features skill. Resist the temptation to pre-solve them here — the user will review the epic list before signing off and may edit it; your job is to give them a clean, well-evidenced epic list.

---

## 2. Inputs and outputs

**Inputs**
- `.context/inception.json` — the confirmed v2 inception context. Read it once in Step 0 and treat it as the single source of truth for business scope.
- `.context/sources/<run_id>/` — any discovery-specific source documents staged for this run (may be empty; inception often suffices).
- `.context/raid.json` — the existing RAID log (may have entries from inception). Read it for context; do **not** modify it in this step (RAID decisions are logged in the stories skill).
- `.context/skills/discovery-epics.md` — this skill.
- `.context/skills/discovery.md` — canonical schema reference (§5.1 Epic schema).

**Output** (single file inside `.context/`)
- `.context/discovery/epics.json` — one epic per inception `key_capability`.

**One section commit**: `discovery: epics extracted`. Use the verbatim subject below.

Never touch files outside `.context/`. Never modify files under `.context/sources/`. Do not create branches, push, or rebase. Do not write horizons, features, architectures, stories, sprint plans, testing contracts, or RAID entries in this step — those belong to the sibling skills.

---

## 3. Process — one agent cycle, one section commit

### Step 0 — read the inception context

Open `.context/inception.json`. Build a mental model of:
- The named `key_capabilities` (these drive Step 1).
- `target_users` + `success_metrics` (these inform the business case per epic).
- `technical_approach`, `architecture_constraints`, `dependencies`, `risk_areas` (these inform scope / out_of_scope per epic).

Read every file in `.context/sources/<run_id>/` (if any) and the current `.context/raid.json`. List any gaps as candidates for `open_questions` on the epics you write.

No commit yet. This is the read-only prep step.

### Step 1 — epics (one per inception key_capability)

For every `key_capability` named in the inception context, write exactly one epic with the schema in §5.1 of `discovery.md`. Extra epics are allowed only if a source document justifies a capability the inception missed — in that case, add a rich `open_question` on the extra epic and leave the inception-alignment narrative for a future RAID entry (the stories skill handles RAID).

Write to `.context/discovery/epics.json`:

```json
{ "version": 1, "generated_at": "<ISO8601 UTC>", "epics": [ /* epic objects per §5.1 */ ] }
```

Commit:
```
git add .context/discovery/epics.json
git commit -m "discovery: epics extracted"
```

This is the terminal commit for this skill. Exit. Do not push, do not branch, do not rebase. The user will review the epics and sign off before the next skill (`discovery-features.md`) runs.

---

## 4. Commit subject — verbatim

The worker parses this to drive the progress ring. Anything other than this exact string will be silently ignored.

1. `discovery: epics extracted`

---

## 5. Output schema (strict) — Epic

See `discovery.md` §5.1 for the full schema. Key points repeated here so you don't need to context-switch while writing:

- All IDs are lowercase-slug + short hex suffix, e.g. `epic_user_onboarding_a1b2`. UTF-8 JSON, indented 2 spaces, trailing newline.
- `source_capability` MUST match one of the entries in `inception.sections.product_vision.fields.key_capabilities.value_long` (or an approved source doc).
- `source_refs` lists the **basenames** (e.g. `brief.md`, `inception.json:product_vision`) that justified this epic.
- `moscow_class` — one of `must | should | could | wont`, or `""` with an open_question.
- `business_case` — a complete paragraph. Never blank when the inception has *any* value/problem prose — synthesise from `product_vision`, `business_problem`, or `success_metrics` fields.
- `success_metrics` — at least one measurable outcome. If inception lists success metrics, use them; don't invent new ones.
- `scope` / `out_of_scope` — what this epic explicitly includes / excludes.
- `dependencies` — **epic-level dependency graph.** List of **epic ids this epic depends on**. 0–3 per epic. Acyclic.
- `tags` — short labels for ADO area paths / Jira labels (lowercase, kebab-case).
- `confidence` — `0.9+` needs multi-source evidence. `0.7–0.9` is single-source. `0.5–0.7` is inference; pair with an open question. Below 0.5, don't write the field — log it as an open_question.
- `open_questions` entries MUST be objects with at minimum `{question, severity, reason, sources_checked}` plus — when raised for an empty ADO/Jira field — an explicit `field` key naming the field.

---

## 6. Hard rules

1. **Never fabricate.** Every epic must trace to an inception field or a source doc. If you can't trace it, log an open question on the closest-fit epic instead of inventing.
2. **Every epic → inception key_capability.** One epic per capability is the baseline. Extra epics require an open_question on the epic itself.
3. **Commit subject verbatim.** The worker greps for exact strings. Any typo skips the tick on the progress ring.
4. **No v1 shape drift.** The epic schema in §5.1 of `discovery.md` is strict. Extra keys are ignored by the validator but waste tokens.
5. **British English** in all prose (`colour`, `behaviour`, `organise`). IDs and technology names are exempt.
6. **Do NOT write horizons, features, architectures, stories, sprint plan, testing contracts, or RAID entries.** Those belong to `discovery-features.md` and `discovery-stories.md`. Writing them here violates the split.
7. **Do NOT modify `.context/raid.json`.** RAID logging happens in `discovery-stories.md`.
8. **Stay inside `.context/`.** Never read code or files outside this directory except the listed sources.
9. **Do not push or branch.** The worker owns git housekeeping — you only `add` + `commit`.
10. **Confidence calibration.** As above. Open questions are rich objects — minimum `{ "question", "severity", "reason", "sources_checked" }`. Severity = `blocking | important | moderate`.

---

## 7. Handoff

Once this commit lands, the worker will finalise the run and the user will be presented with the epic list in the discovery wizard. They will review, edit (if needed), and sign off. Only then will `discovery-features.md` be allowed to run. The sign-off state lives in `.context/discovery/wizard-state.json` and is inspected by the start route before it schedules the next step.
