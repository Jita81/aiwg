# Skill: Discovery — Stories merge (concatenate shards + cross-cutting plan)

> Final step of the sharded `discovery.extract_stories` orchestrator
> (autonomous-tuning spec §4.3). You run after every per-feature shard
> has landed its `_shards/<feature_id>-stories.json`. Your job is to
> concatenate them into the canonical `stories.json` and compute the
> cross-cutting artefacts: `sprint-plan.json`, `testing-contracts.json`,
> `gap-analysis.json`, and the RAID append.

The legacy single-agent `discovery-stories.md` skill is the canonical
schema reference. This merge skill mirrors its **last four** commit
subjects (sprint plan, testing contracts, gap analysis, RAID) and adds
one new one for the union step.

---

## 0. HARD RULE — preserve every shard's stories verbatim

You are a merge step, not an editor. Every story object that lands in
`_shards/<feature_id>-stories.json` MUST appear unchanged in
`stories.json` (deduplicated by `id`). Never rewrite a story's
acceptance criteria, never change its sizing, never reassign it to
another feature.

If you spot a problem (e.g. a cross-feature dependency that doesn't
resolve, a story id collision, a story whose `feature_id` is not in the
horizons MVP set), **log it in `gap-analysis.json`** and surface a RAID
entry — don't paper over it.

---

## 1. Your role

You are the discovery agent in **stories-merge** mode. The shards have
all run, each producing one file under `.context/discovery/_shards/`.
The orchestrator has supplied a manifest of what it observed (counts,
paths, statuses). Your job is five commits:

1. Concatenate every shard's `stories[]` into the canonical
   `stories.json`.
2. Assign every story to a sprint, considering cross-feature
   dependencies.
3. Per in-plan feature, write a testing contract.
4. Per sprint, enumerate every gap you spotted while merging.
5. Append RAID decisions for any judgement call you made.

---

## 2. Inputs and outputs

### Inputs (read-only)

- `.context/discovery/_shards/*-stories.json` — every shard's output.
  These are your ground truth for stories.
- `.context/discovery/epics.json`, `.context/discovery/horizons.json`,
  `.context/discovery/features/*.json` — context for sprint sizing and
  feature lookups.
- `.context/architecture/mvp.json` — for blocker detection.
- `.context/inception.json` — source of truth for business scope.
- `.context/raid.json` — existing RAID log. Read it; append, do not
  overwrite.

### Outputs (all under `.context/`)

- `.context/discovery/stories.json` — canonical union, shape:

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "stories": [ /* every shard's stories, deduped by id */ ]
}
```

- `.context/discovery/sprint-plan.json`
- `.context/discovery/testing-contracts.json`
- `.context/discovery/gap-analysis.json`
- `.context/raid.json` — append decisions tagged with `sprint_scope`.

### Five section commits

One per artefact, with the verbatim subjects in §4.

---

## 3. Process — one agent cycle, five section commits

### Step 0 — read every shard

List `.context/discovery/_shards/*-stories.json` and load each one.
Cross-check against the orchestrator manifest in your prompt: any
shard the orchestrator says completed but you can't read on disk gets
a gap entry; any extra file on disk you didn't expect gets one too.

No commit yet.

### Step 1 — concatenate stories

Build the union of every shard's `stories[]`. Dedupe by `id` (first
occurrence wins). Stamp `generated_at` with the current ISO8601 UTC
timestamp. Write `.context/discovery/stories.json`.

Validate: every story's `dependencies[]` id either exists somewhere in
the union, OR gets logged as a gap in Step 4 with severity ≥
`important`.

Commit:
```
git add .context/discovery/stories.json
git commit -m "stories: merged from shards"
```

### Step 2 — sprint plan

Assign every story to a sprint (1, 2, 3, …). Use the union's
`dependencies[]` graph to topologically order them: a story whose
deps land in sprint K cannot be assigned earlier than K+1.

Sprint 1 MUST flag any blockers (external auth, SDK access, vendor
decisions, missing architecture confirmation, etc.) in a dedicated
`blockers[]` array so the facilitator sees them before kickoff.

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
      "blockers": [ /* BlockerEntry per discovery.md §5.6 */ ],
      "open_questions": []
    }
  ]
}
```

Commit:
```
git add .context/discovery/sprint-plan.json
git commit -m "stories: sprint plan assembled"
```

### Step 3 — testing contracts

For every feature that has at least one story in the sprint plan,
write a testing contract using Given/When/Then scenarios. List the
acceptance criteria each scenario covers. Untested criteria → list as
`open_gaps`.

Write `.context/discovery/testing-contracts.json`:

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "contracts": [ /* TestingContract per discovery.md §5.7 */ ]
}
```

Commit:
```
git add .context/discovery/testing-contracts.json
git commit -m "stories: testing contracts prepared"
```

### Step 4 — gap analysis

Per sprint, enumerate every gap you spotted: missing context,
unconfirmed architecture decisions, risky dependencies, stories with
low confidence, features that lack a testing contract, dependency ids
that don't resolve in the union. Severity: `blocking | important |
moderate`. `blocking=true` means sprint 1 cannot start without this
resolved.

Write `.context/discovery/gap-analysis.json`:

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "sprints": [ /* GapAnalysisSprint per discovery.md §5.8 */ ]
}
```

Commit:
```
git add .context/discovery/gap-analysis.json
git commit -m "stories: gap analysis complete"
```

### Step 5 — RAID decisions

Append to `.context/raid.json` for every judgement call you made
across Steps 1–4 — dedupe choices, sprint assignments where multiple
ordering options were valid, blocker classifications, etc. Preserve
prior entries verbatim.

```
git add .context/raid.json
git commit -m "stories: RAID decisions logged"
```

This is the terminal commit. Exit. Do not push, do not branch, do not
rebase.

---

## 4. Commit subjects — verbatim

The orchestrator parses these to drive its progress display. Anything
other than these exact strings will be silently ignored.

1. `stories: merged from shards`
2. `stories: sprint plan assembled`
3. `stories: testing contracts prepared`
4. `stories: gap analysis complete`
5. `stories: RAID decisions logged`

---

## 5. Output schemas (strict)

See `.context/skills/discovery.md` §5.5–§5.9 for the full schemas.
This skill never invents fields — it only concatenates and computes
across the shards' output.

---

## 6. Hard rules

1. **Never edit a shard's stories.** Concatenate verbatim; dedupe by id.
2. **Every commit subject verbatim.** The orchestrator greps for
   exact strings.
3. **No v1 shape drift.** Each schema in §5 is strict.
4. **British English** in prose. IDs and tech names exempt.
5. **Merge `raid.json`, don't replace.** Read existing entries first.
   Append only. Preserve existing IDs.
6. **Stay inside `.context/`.** `_shards/` is read-only for you.
7. **Do not push or branch.**
8. **Cross-shard validation surfaces gaps — never silent fixes.** If a
   story refers to a non-existent dependency, log it; do not delete
   the reference.
9. **Open questions are rich objects.** Minimum: `{"question",
   "severity", "reason", "sources_checked"}`. Severity = `blocking |
   important | moderate`.

---

## 7. Recalculation reminders

- `stories[*].sprint_number` (when present) must match a
  `sprint_number` in `sprint-plan.json`.
- Every `feature_id` referenced by a merged story must exist in some
  `features/<slug>.json`.
- Every `sprint_scope` on a RAID decision is either a positive
  integer or the literal `"all"`.
- Testing contracts cover only features that have at least one story
  assigned to a sprint.
- Stories' `blockers[]` feed sprint 1's `blockers[]` — keep them in
  sync.
