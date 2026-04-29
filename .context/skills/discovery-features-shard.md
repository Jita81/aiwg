# Skill: Discovery — Features (single-epic shard)

> Per-epic shard of the sharded `discovery.extract_features`
> orchestrator (Phase 5B). You are one of N parallel agents — each
> handles ONE epic in ONE horizon. Your shard writes one file, makes
> one commit, and exits. The merge agent runs after every shard has
> landed and is responsible for the cross-cutting C4 architecture.

The legacy single-agent `discovery-features.md` skill is the canonical
schema reference. This shard skill mirrors its schema requirements but
tightens scope so you spend your full context budget on **this one
epic in this one horizon**.

---

## 0. HARD RULES

### 0.1 Every §5.3 field MUST be present

Every field declared in §5.3 of `.context/skills/discovery.md` MUST be
present on every feature you emit, in this order: `id`, `name`,
`description`, `epic_id`, `horizon`, `acceptance_criteria`,
`user_story`, `priority`, `testing_contract_ref`, `dependencies`,
`dependency_rationale`, `sprint_number`, `labels`, `business_value`,
`open_questions`.

- When a field is truly unknown, emit `""` for strings or `[]` for
  lists — NEVER omit the key.

### 0.2 Open questions are a positive obligation

Even when every field is populated, append decision-anchored
open_questions surfacing the judgment calls you made (architectural
trade-offs, MoSCoW uncertainty, dependency assumptions, performance
targets the inception didn't pin down). The scorer credits anchored
open_questions.

---

## 1. Your role

You are the discovery agent in **single-epic shard** mode. Your scope
is **one epic, in one horizon**, identified by the `epic_id`,
`epic_slug`, and `horizon` arguments in your prompt. The shard
orchestrator has loaded the full inception, epics, and horizons into
your prompt as read-only context.

Your job:
- Produce every feature this epic needs to deliver in this horizon
  (see §1a — feature count is NOT fixed).
- Cross-epic dependencies: emit them as raw feature ids on
  `dependencies[]`. The merge step validates them against the union of
  every shard's features.
- Stay narrow. Do **not** draft architecture, do **not** allocate
  horizons, do **not** touch other epics. Those are out of scope.

### 1a. Feature count is NOT fixed

Produce as many features as this epic actually needs to be delivered
in this horizon — no padding to a target, no shrinking to a cap.
Quality beats quantity.

---

## 2. Inputs and outputs

### Worker arguments (in your prompt)

- `epic_id` — **mandatory**.
- `epic_slug` — slugified id, used in commit messages and references.
- `horizon` — one of `mvp | mmp | full`. Every feature you emit
  carries this value.
- `shard_output_path` — the canonical output path (computed below).

### Read-only context (do not modify)

- `.context/inception.json`
- `.context/discovery/epics.json`
- `.context/discovery/horizons.json`
- `.context/raid.json`

### Output (the only file you write)

- `.context/discovery/_shards/features-<epic_id>.json` — a single JSON
  file shaped:

```json
{
  "version": 1,
  "epic_id": "<epic_id>",
  "epic_slug": "<epic_slug>",
  "horizon": "<horizon>",
  "features": [ /* Feature objects per discovery.md §5.3 */ ]
}
```

The orchestrator pre-creates `.context/discovery/_shards/`.

### Single commit

```
git add .context/discovery/_shards/features-<epic_id>.json
git commit -m "features: shard for <epic_id>"
```

This is your terminal commit. Exit. Do not push, do not branch, do not
rebase.

---

## 3. Process — one agent cycle, one section commit

### Step 0 — confirm scope

Read your prompt. Identify `epic_id`, `epic_slug`, `horizon`, and the
embedded epic record. Read `.context/inception.json` and the embedded
epics + horizons context.

No commit yet.

### Step 1 — extract features for THIS epic + horizon only

Walk the epic's `scope`, `success_metrics`, and `business_case` and
produce features that, in aggregate, deliver this epic within the
target horizon. Each feature carries:

- A `name` in sentence case (e.g. `"Email verification on sign-up"`).
- A short `description` paragraph (40–80 words).
- `acceptance_criteria` — list of `"Given … when … then …"` strings,
  minimum 2 for MVP features, 1+ otherwise.
- `user_story` — connextra verbatim.
- `priority` — `critical | high | medium | low`.
- `testing_contract_ref` — equals the feature's own id.
- `dependencies[]` — feature ids (or `ext:` / `vendor:` tokens). Only
  same-horizon dependencies. ALWAYS emit this field, even if empty.
- `business_value` — concrete paragraph tied to a measurable outcome.

Write `.context/discovery/_shards/features-<epic_id>.json` with the
shape above. Every feature's `horizon` field MUST equal the `horizon`
argument.

Commit:

```
git add .context/discovery/_shards/features-<epic_id>.json
git commit -m "features: shard for <epic_id>"
```

This is your terminal commit. Exit.

---

## 4. Commit subject — verbatim

```
features: shard for <epic_id>
```

(Substitute the literal `epic_id` from your prompt.)

---

## 5. Feature schema (strict)

See `.context/skills/discovery.md` §5.3 for the canonical Feature
object. Critical points repeated:

- All IDs lowercase-slug + short hex, e.g. `feat_email_verify_c3d4`.
- `epic_id` MUST equal the prompt's `epic_id` arg.
- `horizon` MUST equal the prompt's `horizon` arg.
- `acceptance_criteria` strings: each starts with `"Given "`, contains
  ` when `, contains ` then `.
- `dependencies` — same-horizon feature ids only. Cross-horizon deps
  are forbidden — features in earlier horizons cannot be blocked by
  features in later horizons.

---

## 6. Hard rules

1. **One epic only.** Do not draft features for sibling epics — even if
   you spot a glaring gap, that's another shard's job.
2. **One horizon only.** Every feature's `horizon` equals the prompt's
   `horizon`. Never write features for `mmp` while sharding `mvp`.
3. **One file write.** `.context/discovery/_shards/features-<epic_id>.json`.
4. **One commit, subject verbatim.** `features: shard for <epic_id>`.
5. **Never fabricate.** Every feature must trace to this epic's scope
   or an inception field.
6. **British English** in prose. IDs and tech names exempt.
7. **Stay inside `.context/discovery/_shards/`.**
8. **Do not push or branch.**
9. **Do not touch** `.context/discovery/features/`,
   `.context/architecture/`, `.context/discovery/epics.json`, or
   `.context/raid.json` — the merge step + stories skill own those.
10. **Open questions are rich objects** — minimum
    `{question, severity, reason, sources_checked}`. Severity =
    `blocking | important | moderate`.
