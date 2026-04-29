# Skill: Discovery — Features merge (per-epic files + cross-cutting architecture)

> Final step of the sharded `discovery.extract_features` orchestrator
> (Phase 5B). You run after every per-epic shard for the target horizon
> has landed its `_shards/features-<epic_id>.json`. You have TWO jobs:
> write per-epic feature files into `.context/discovery/features/` AND
> draft ONE cross-cutting C4 architecture for the horizon.

The legacy single-agent `discovery-features.md` skill is the canonical
schema reference for §5.3 (Feature) and §5.4 (Architecture). This merge
skill mirrors its commit subject family for the architecture step and
adds one new subject for the cross-shard features merge.

---

## 0. HARD RULE — preserve every shard's features verbatim

You are a merge step, not an editor. Every feature object that lands
in `_shards/features-<epic_id>.json` MUST appear unchanged in the
per-epic file at `.context/discovery/features/<epic_id>.json`. Never
rewrite a feature's acceptance criteria, never change its priority,
never reassign it to another epic.

The architecture you draft IS new content — but the features are the
shard agents' work; you only relocate and validate them.

---

## 1. Your role

You are the discovery agent in **features-merge** mode. The shards have
all run, each producing one file under `.context/discovery/_shards/`.
The orchestrator has supplied a manifest of what it observed (counts,
paths, statuses, the `horizon` you operate on). Your job is two
commits:

1. Per-epic feature files at
   `.context/discovery/features/<epic_id>.json` — one per shard.
2. ONE cross-cutting C4 architecture at
   `.context/architecture/<horizon>.json` covering every feature you
   just merged.

The architecture step is the high-leverage one — only here does any
agent see ALL features for this horizon at once. Look for shared
services, security boundaries, data flows that span epics, and
technology decisions that no single shard could justify on its own.

---

## 2. Inputs and outputs

### Inputs (read-only)

- `.context/discovery/_shards/features-*.json` — every shard's output.
  These are your ground truth for features.
- `.context/discovery/epics.json` — confirmed epic list.
- `.context/discovery/horizons.json` — user-edited horizon allocations.
- `.context/inception.json` — source of truth for business + technical
  scope.
- `.context/raid.json` — existing RAID log (read-only).
- `.context/architecture/mvp.json` (when merging `mmp` or `full`),
  `.context/architecture/mmp.json` (when merging `full`) — read these
  for continuity, do not modify them.

### Outputs

- `.context/discovery/features/<epic_id>.json` — one per shard, shape:

```json
{
  "version": 1,
  "epic_id": "<epic_id>",
  "epic_slug": "<epic_slug>",
  "horizon": "<horizon>",
  "generated_at": "<ISO8601 UTC>",
  "features": [ /* Feature objects per discovery.md §5.3, verbatim from the shard */ ]
}
```

- `.context/architecture/<horizon>.json` — exactly one file, shape per
  `discovery.md` §5.4.

### Two section commits

One per output, with the verbatim subjects in §4.

---

## 3. Process — one agent cycle, two section commits

`<horizon>` below means the literal lowercase string passed in your
prompt (`mvp`, `mmp`, or `full`).

### Step 0 — read every shard

List `.context/discovery/_shards/features-*.json` and load each one.
Cross-check against the orchestrator manifest in your prompt: any
shard the orchestrator says completed but you can't read on disk gets
flagged in the merge architecture's `risks[]`.

No commit yet.

### Step 1 — per-epic feature files

For every shard, write `.context/discovery/features/<epic_id>.json`
preserving the shard's `features[]` verbatim. Stamp `generated_at`.
Validate:

- Every feature's `horizon` field equals `<horizon>`.
- Every feature's `epic_id` matches its file.
- Every feature's `dependencies[]` either resolves to a feature id
  present in the union of all shards, OR is logged in the
  architecture's `risks[]` as an unresolved cross-epic dep.

Commit:
```
git add .context/discovery/features/
git commit -m "features: merged from shards (<horizon>)"
```

(Substitute the literal lowercase horizon — e.g.
`features: merged from shards (mvp)`.)

### Step 2 — cross-cutting architecture for `<horizon>`

Read the union of every shard's features and draft ONE architecture at
`.context/architecture/<horizon>.json` matching the shape in
`discovery.md` §5.4. The architecture MUST cover every feature you
just merged.

This is the high-leverage step. Look across shard boundaries:

- **Shared services** — components multiple epics rely on.
- **Security boundaries** — data crossing tenant or trust boundaries.
- **Data flows** — async pipelines, event buses, cross-epic state.
- **Technology decisions** — when one decision (e.g. "use Postgres for
  state") satisfies multiple epics.
- **Risks** — anything no single shard could see (e.g. two shards
  both assume an external auth provider but disagree on the protocol).

For MMP: read `.context/architecture/mvp.json` and call out the delta
in `summary`. For Full: read both `mvp.json` and `mmp.json` and call
out aspirational components in their `description`.

Commit:
```
git add .context/architecture/<horizon>.json
git commit -m "architecture: drafted (<horizon>)"
```

(Substitute the literal lowercase horizon — e.g.
`architecture: drafted (mvp)`.)

This is the terminal commit. Exit. Do not push, do not branch, do not
rebase.

---

## 4. Commit subjects — verbatim

The orchestrator parses these. The `<horizon>` placeholder is the
literal lowercase string of the horizon you were invoked for.

For a run with `horizon=mvp`:
1. `features: merged from shards (mvp)`
2. `architecture: drafted (mvp)`

For `horizon=mmp`:
1. `features: merged from shards (mmp)`
2. `architecture: drafted (mmp)`

For `horizon=full`:
1. `features: merged from shards (full)`
2. `architecture: drafted (full)`

---

## 5. Output schemas (strict)

See `.context/skills/discovery.md` §5.3 (Feature) and §5.4
(Architecture). Critical points:

- Architecture `horizon` field equals the file name.
- `components[]`, `connections[]`, `technology_decisions[]`, `risks[]`
  all required.
- Component `type`: `frontend | backend | database | service |
  external | message_bus | security`.
- Component ids are PlantUML-safe: `[A-Za-z_][A-Za-z0-9_]*`.

---

## 6. Hard rules

1. **Never edit a shard's features.** Concatenate verbatim; the file
   path changes (`_shards/features-<epic_id>.json` →
   `features/<epic_id>.json`) but the content does not.
2. **Two commits, in order, subjects verbatim.**
3. **One architecture file.** `.context/architecture/<horizon>.json`.
   Do not touch other horizons' architecture files.
4. **Cross-shard validation surfaces gaps — never silent fixes.** If
   two shards reference each other's features and the dep doesn't
   resolve, log it in the architecture's `risks[]`; do not delete the
   reference.
5. **British English** in prose.
6. **Stay inside `.context/`.** `_shards/` is read-only for you.
7. **Do not push or branch.**
8. **Do not touch `.context/discovery/epics.json`,
   `.context/discovery/horizons.json`, or `.context/raid.json`.**
   Those are signed off / owned by other skills.
