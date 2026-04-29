# Skill: Discovery — Epics merge (union shards into canonical epics.json)

> Final step of the sharded `discovery.extract_epics` orchestrator
> (Phase 5A). You run after every per-section shard has landed its
> `_shards/epics-<section>.json`. Your job is to take the union and
> write the canonical `.context/discovery/epics.json`.

The legacy single-agent `discovery-epics.md` skill is the canonical
schema reference. This merge skill mirrors its commit subject family
(`discovery: epics …`) and adds one new one for the merge step.

---

## 0. HARD RULE — preserve every shard's epics verbatim

You are a merge step, not an editor. Every epic object that lands in
`_shards/epics-<section>.json` MUST appear unchanged in `epics.json`
(deduplicated by `id`). Never rewrite an epic's business case, never
change its MoSCoW class, never reassign it to another capability.

If you spot a problem (e.g. two shards emit the same id with different
content, an epic whose `source_capability` doesn't appear in the
inception, a cycle in the cross-shard dependency graph), **log it on
the surviving epic's `open_questions[]`** — don't paper over it.

---

## 1. Your role

You are the discovery agent in **epics-merge** mode. Three shards have
run, each producing one file under `.context/discovery/_shards/`. The
orchestrator has supplied a manifest of what it observed (counts,
paths, statuses). Your job is one commit:

1. Take the union of every shard's `epics[]`, deduplicate by id (first
   occurrence wins by section order), stamp `generated_at`, and write
   `.context/discovery/epics.json`.

---

## 2. Inputs and outputs

### Inputs (read-only)

- `.context/discovery/_shards/epics-product_vision.json`
- `.context/discovery/_shards/epics-technical_approach.json`
- `.context/discovery/_shards/epics-phases_and_sizing.json`
- `.context/inception.json` — for sanity-checking `source_capability`
  values and detecting fabrications.
- `.context/raid.json` — read-only. Do NOT modify.

### Output

- `.context/discovery/epics.json` — canonical union, shape:

```json
{
  "version": 1,
  "generated_at": "<ISO8601 UTC>",
  "epics": [ /* every shard's epics, deduped by id */ ]
}
```

### Single commit

`discovery: epics merged from shards` — verbatim.

---

## 3. Process — one agent cycle, one commit

### Step 0 — read every shard

List `.context/discovery/_shards/epics-*.json` and load each. Cross-
check against the orchestrator manifest in your prompt: any shard the
orchestrator says completed but you can't read on disk gets a note in
the surviving epics' `open_questions[]`.

No commit yet.

### Step 1 — union + dedupe + write

Build the union of every shard's `epics[]`. Dedupe by `id` (first
occurrence wins, ordered by `product_vision`, `technical_approach`,
`phases_and_sizing`). For every duplicate id with diverging content,
attach an open_question on the survivor noting the conflict.

Stamp `generated_at` with the current ISO8601 UTC timestamp. Write
`.context/discovery/epics.json` with the canonical shape.

Validate: every epic's `dependencies[]` resolves to an id present in
the union (cross-shard dep validation). Unresolved deps → open_question
on the dependent epic.

Commit:
```
git add .context/discovery/epics.json
git commit -m "discovery: epics merged from shards"
```

This is your terminal commit. Exit. Do not push, do not branch, do not
rebase.

---

## 4. Commit subject — verbatim

```
discovery: epics merged from shards
```

---

## 5. Hard rules

1. **Never edit a shard's epics.** Concatenate verbatim; dedupe by id.
2. **Commit subject verbatim.** Anything else and the orchestrator's
   progress display silently ignores it.
3. **No v1 shape drift.** §5.1 of `discovery.md` is strict.
4. **British English** in prose. IDs and tech names exempt.
5. **Stay inside `.context/`.** `_shards/` is read-only for you.
6. **Do not push or branch.**
7. **Cross-shard validation surfaces gaps — never silent fixes.** If
   two shards diverge on the same id, log it; do not silently merge.
8. **Do not touch `.context/raid.json`.** RAID is the stories skill's
   job.
