# Skill: Discovery — Stories (single-feature shard)

> Per-feature shard of the sharded `discovery.extract_stories` orchestrator
> (autonomous-tuning spec §4.3). You are one of N parallel agents — each
> handles ONE feature. Your shard writes one file, makes one commit, and
> exits. The merge agent runs after every shard has landed.

The legacy single-agent `discovery-stories.md` skill is the canonical
reference for story shape and quality bars. This shard skill mirrors its
schema requirements but tightens scope so you spend your full context
budget on **this one feature**.

---

## 0. HARD RULE — every §5 field MUST be present

Every field declared in §5.5 of `.context/skills/discovery.md` MUST be
present on every story you emit, including ADO/Jira fields (priority,
user_story "as a… I want… so that…", acceptance_criteria, story_points,
definition_of_done, dependencies, risks, testing_notes, assignee,
blockers).

- When a field is truly unknown, emit `""` for strings or `[]` for lists
  — NEVER omit the key.
- For every empty field, append a rich `open_question` to the story's
  `open_questions[]` explaining what's missing, what you looked for, and
  what would unblock it.

---

## 1. Your role

You are the discovery agent in **single-feature shard** mode. Your scope
is **one feature only**, identified by the `feature_id` and
`feature_slug` arguments in your prompt. The shard orchestrator has
already loaded the full inception, epics, horizons, and MVP architecture
into your prompt as read-only context.

Your job:
- Produce every story this feature needs, sized thin/medium, each with
  Given/When/Then acceptance criteria, each with an explicit (possibly
  empty) `dependencies[]` list naming sibling story ids that must land
  in an earlier sprint.
- Cross-feature dependencies: emit them as raw story ids on
  `dependencies[]`. The merge step validates them against the union of
  every shard's stories.
- Stay narrow. Do **not** size the sprint plan, do **not** write
  testing contracts, do **not** touch RAID. Those are the merge
  step's job.

---

## 2. Inputs and outputs

### Worker arguments (in your prompt)

- `feature_id` — **mandatory**. The id of the feature you are sharding.
  If somehow not supplied, fall back to the first feature listed in
  `.context/discovery/epics.json`.
- `feature_slug` — slugified id, used for the output filename.
- `epic_id` — the parent epic id, for cross-reference convenience.
- `shard_output_path` — the canonical output path (computed below).

### Read-only context (do not modify)

- `.context/inception.json`
- `.context/discovery/epics.json`
- `.context/discovery/horizons.json`
- `.context/discovery/features/*.json`
- `.context/architecture/mvp.json`
- `.context/raid.json`

### Output (the only file you write)

- `.context/discovery/_shards/<feature_id>-stories.json` — a single
  JSON file shaped:

```json
{
  "version": 1,
  "feature_id": "feat_<slug>_<hex>",
  "feature_slug": "<slug>",
  "epic_id": "epic_<slug>_<hex>",
  "stories": [ /* Story objects per discovery.md §5.5 */ ]
}
```

The orchestrator pre-creates `.context/discovery/_shards/`. You never
need to `mkdir` it yourself.

### Single commit

```
git add .context/discovery/_shards/<feature_id>-stories.json
git commit -m "stories: shard for <feature_id>"
```

This is your terminal commit. Exit. Do not push, do not branch, do not
rebase.

---

## 3. Process — one agent cycle, one section commit

### Step 0 — confirm scope

Read your prompt. Identify your `feature_id`, `feature_slug`, and the
embedded feature record. If the prompt did not embed the feature, read
it from `.context/discovery/features/<epic_slug>.json` by id.

No commit yet.

### Step 1 — extract stories for THIS feature only

Walk the feature's `acceptance_criteria[]` and produce stories that, in
aggregate, will deliver the feature within the first three sprints
toward MVP. Sizing rules:

- `thin` → 1–3 story points; `medium` → 3–8.
- No `thick` — split it into two stories with explicit `dependencies[]`.
- Each story carries a Given/When/Then acceptance criteria list (1+
  criteria; target 2–3).
- Each story declares its `dependencies[]` — sibling story ids in this
  shard that must land first, OR cross-feature ids the merge step will
  validate.

Write `.context/discovery/_shards/<feature_id>-stories.json` with the
shape above.

Commit:

```
git add .context/discovery/_shards/<feature_id>-stories.json
git commit -m "stories: shard for <feature_id>"
```

This is your terminal commit. Exit.

---

## 4. Commit subject — verbatim

The orchestrator parses this exact string to drive its progress
display. Anything else will be silently ignored.

```
stories: shard for <feature_id>
```

(Substitute the literal `feature_id` from your prompt — do not alter the
prefix `stories: shard for `.)

---

## 5. Story schema (strict)

See `.context/skills/discovery.md` §5.5 for the canonical story object.
Critical points repeated:

- `size` — **`thin` or `medium` only — never `thick`.**
- `story_points` — Fibonacci 1, 2, 3, 5, 8, 13. `thin` → 1–3, `medium`
  → 3–8.
- `acceptance_criteria` — list of `{given, when, then}` objects.
- `user_story` — connextra pattern verbatim:
  `"As a <role>, I want <capability> so that <outcome>."`
- `description` — 2–4 sentences of context the coder needs to start.
- `definition_of_done` — minimum sprint-1 example: `["Code merged to
  main", "Unit tests pass", "E2E smoke pass", "No open ACs",
  "Accessibility lint clean"]`.
- `priority` — `critical | high | medium | low`, inherits from parent
  feature by default.
- `assignee` — team, role, or email. `"TBD"` is NOT acceptable; use
  `""` and log an `open_question`.
- `dependencies` — **always emit this field on every story** as a
  (possibly empty) list of story ids. Cross-feature ids are valid; the
  merge step validates them.
- `dependency_rationale` — optional short (<200 char) string. Omit or
  `""` when `dependencies` is empty.
- `blockers` — human-readable blockers external to the story graph.
- `risks` — delivery / quality / integration risks.

---

## 6. Hard rules

1. **One feature only.** Do not fabricate stories for other features
   — even if you spot a glaring gap, that's the merge step's job to
   surface.
2. **One file write.** `.context/discovery/_shards/<feature_id>-stories.json`.
3. **One commit, subject verbatim.** `stories: shard for <feature_id>`.
4. **Never fabricate.** Every story must trace to this feature's
   acceptance criteria, this epic's scope, or an inception field.
5. **British English** in prose. IDs and tech names exempt.
6. **Stay inside `.context/discovery/_shards/`.** Reads of every other
   path are fine; writes elsewhere are not.
7. **Do not push or branch.**
8. **Confidence calibration.** `0.9+` needs multi-source evidence.
   `0.7–0.9` is single-source. Below 0.5, don't write the field — log
   it as a gap on the story's `open_questions[]`.
9. **Open questions are rich objects.** Minimum: `{"question",
   "severity", "reason", "sources_checked"}`. Severity = `blocking |
   important | moderate`.
10. **Do not touch** `.context/discovery/stories.json`,
    `sprint-plan.json`, `testing-contracts.json`, `gap-analysis.json`,
    or `raid.json`. Those are the merge step's domain.
