# Skill: Discovery — Epics (single-section shard)

> Per-section shard of the sharded `discovery.extract_epics`
> orchestrator (Phase 5A). You are one of three parallel agents — each
> handles ONE inception section. Your shard writes one file, makes one
> commit, and exits. The merge agent runs after every shard has landed.

The legacy single-agent `discovery-epics.md` skill is the canonical
schema reference. This shard skill mirrors its schema requirements but
tightens scope so you spend your full context budget on **this one
inception section**.

---

## 0. HARD RULE — every §5.1 field MUST be present

Every field declared in §5.1 of `.context/skills/discovery.md` MUST be
present on every epic you emit (MoSCoW, business case, success
metrics, scope, out_of_scope, dependencies, tags, source_capability,
source_refs, confidence, open_questions).

- When a field is truly unknown, emit `""` for strings or `[]` for
  lists — NEVER omit the key.
- For every empty field, append a rich `open_question` to the epic's
  `open_questions[]` explaining what's missing.

---

## 1. Your role

You are the discovery agent in **single-section shard** mode. Your scope
is **one inception section only**, identified by the `section` argument
in your prompt (one of `product_vision`, `technical_approach`,
`phases_and_sizing`).

Your job:
- Read `.context/inception.json` end-to-end so you have the project
  framing in mind.
- Then derive epics ONLY from the fields under
  `sections.<section>.fields`. Even if you spot an obvious epic that
  belongs to another section, leave it for that section's shard.
- Stay narrow. Do **not** allocate horizons, do **not** draft
  features, do **not** touch RAID. Those are out of scope.

---

## 2. Inputs and outputs

### Worker arguments (in your prompt)

- `section` — **mandatory**. One of `product_vision`,
  `technical_approach`, `phases_and_sizing`.
- `shard_output_path` — the canonical output path (computed below).

### Read-only context (do not modify)

- `.context/inception.json`
- `.context/raid.json`

### Output (the only file you write)

- `.context/discovery/_shards/epics-<section>.json` — a single JSON file
  shaped:

```json
{
  "version": 1,
  "section": "<section>",
  "epics": [ /* Epic objects per discovery.md §5.1 */ ]
}
```

The orchestrator pre-creates `.context/discovery/_shards/`. You never
need to `mkdir` it yourself.

### Single commit

```
git add .context/discovery/_shards/epics-<section>.json
git commit -m "epics: shard from <section>"
```

This is your terminal commit. Exit. Do not push, do not branch, do not
rebase.

---

## 3. Process — one agent cycle, one section commit

### Step 0 — confirm scope

Read your prompt. Identify your `section`. Read
`.context/inception.json`. Locate `sections.<section>.fields` and read
every field within.

No commit yet.

### Step 1 — extract epics for THIS section only

For each meaningful capability, business goal, or scope decision that
arises from the fields within `sections.<section>`, write one epic
record per `discovery-epics.md` §5.1.

Heuristics per section:

- **`product_vision`** — one epic per `key_capability` listed in the
  `key_capabilities.value_long` field. Each epic's
  `source_capability` MUST match an entry in that field.
- **`technical_approach`** — epics that arise from architecture
  constraints, dependencies, and risk areas. Often "platform" /
  "integration" epics rather than user-facing features.
- **`phases_and_sizing`** — epics that arise from phase breakdown,
  effort estimates, or timeline milestones. Often "milestone" epics
  that span multiple capabilities.

Write `.context/discovery/_shards/epics-<section>.json` with the shape
above.

Commit:

```
git add .context/discovery/_shards/epics-<section>.json
git commit -m "epics: shard from <section>"
```

This is your terminal commit. Exit.

---

## 4. Commit subject — verbatim

```
epics: shard from <section>
```

(Substitute the literal section name from your prompt.)

---

## 5. Epic schema (strict)

See `.context/skills/discovery.md` §5.1 for the canonical epic object.
Key points:

- All IDs lowercase-slug + short hex suffix, e.g.
  `epic_user_onboarding_a1b2`.
- `source_capability` MUST trace to a value in `sections.<section>`.
- `source_refs` lists basenames (e.g. `inception.json:<section>`) that
  justified this epic.
- `moscow_class` — `must | should | could | wont`, or `""` with an
  open_question.
- `dependencies` — epic-level dependency graph; list of epic ids this
  epic depends on (0–3 per epic, acyclic). Cross-shard deps are
  validated by the merge step.
- `confidence` — 0.9+ multi-source; 0.7–0.9 single-source; <0.5 omit
  + log open question.

---

## 6. Hard rules

1. **One section only.** Do not write epics that derive from other
   sections — even if obvious. The other shards own them.
2. **One file write.** `.context/discovery/_shards/epics-<section>.json`.
3. **One commit, subject verbatim.** `epics: shard from <section>`.
4. **Never fabricate.** Every epic must trace to a field within
   `sections.<section>`.
5. **British English** in prose. IDs and tech names exempt.
6. **Stay inside `.context/discovery/_shards/`.** Reads of every other
   path are fine; writes elsewhere are not.
7. **Do not push or branch.**
8. **Do not touch** `.context/discovery/epics.json` or
   `.context/raid.json` — the merge step + stories skill own those.
