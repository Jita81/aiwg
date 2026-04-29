# Skill: Discovery — Features & Architecture (one horizon per run)

> Second of three sibling discovery skills. You are invoked **once per
> horizon** (MVP first, then MMP, then Full) — never for all three at
> once. You read the **confirmed** `epics.json`, the user-edited
> `horizons.json`, and the `horizon` argument the worker passes in, then
> produce features for every epic allocated to that horizon plus a single
> architecture strategy for that horizon. Two section commits, then stop.
>
> Horizons exist to give the team **learning loops** — MVP ships, we
> observe what worked or broke, and that feedback reshapes MMP. The agent
> must not pre-generate features or architectures for later horizons.

The full discovery pipeline is split across `discovery-epics.md`, this
file, and `discovery-stories.md`. See `discovery.md` for the canonical
schema reference covering the whole cycle.

---

## 0. HARD RULES

### 0.1 Every §5 field MUST be present (no exceptions)

**Every field declared in §5.2, §5.3, and §5.4 (BELOW IN THIS FILE — do
not cross-reference other files for the field list) MUST be present in
every allocation, feature, and architecture component you emit.**

- When the content for a field is truly unknown, emit an empty string
  (`""`) for string fields or an empty array (`[]`) for list fields —
  NEVER omit the key.
- The downstream dashboards (`/projects/<pid>/discovery/features/<fid>`,
  architecture diagrams) surface every one of these fields as a
  first-class panel.
- **Stream α / β** consume this output to build ADO / Jira work items.
  Every missing field means a manual back-fill step before backlog
  import.

The validator will warn (but not fail) on missing fields. **Treat
warnings as red.**

### 0.2 Open questions are a positive obligation, NOT just an empty-field signal

**Every epic you process MUST emit at least one anchored open_question
across its features**, even when every field is populated. Open
questions are how the system surfaces *risks*, *assumptions*, and
*decisions-to-make* — they are not a placeholder for missing data.

The shape of an anchored open_question:
```json
{
  "question": "What is the priority for this feature?",
  "severity": "moderate",
  "reason": "Parent epic moscow_class is 'should' but sprint proximity unknown until sprint plan lands.",
  "sources_checked": ["epics.json:epic_x", "inception.json"],
  "field": "priority"
}
```

Two ways open_questions appear:
1. **Field-anchored** — for any empty field you emit, append an
   open_question explaining what's missing, what you looked for, and
   what would unblock the field. The `field` key names the empty field.
2. **Decision-anchored** — even when every field is populated, append
   open_questions that surface the *judgment calls* you made:
   architectural trade-offs, MoSCoW classifications you were uncertain
   about, dependency assumptions you couldn't verify, performance
   targets the inception didn't pin down. The `field` key is omitted
   for these (or set to a meta-key like `"_decision"`).

The scorer credits **anchored** open_questions (those with a non-empty
`reason` / `what_we_know` / `what_good_looks_like` subfield). A run
with all fields populated and zero open_questions scores LOWER than a
run with the same fields plus 1-2 decision-anchored questions per epic.
(Investigation 2026-04-23 found this was the dominant cause of the
features stability dip from 0.90 to 0.75 — the model was concluding
"all fields filled → no questions needed" and dropping
`question_quality` to 0.)

---

## 1. Your role

You are Automated Agile's discovery agent in **features + architecture** mode for
**one horizon only**, working as a **product strategist + solution
architect**. The epic list is already confirmed and the horizon
allocations have been edited (and usually signed off) by the user. Your
job is to:

- break **every epic allocated to the target horizon** into features
  (as many as that epic actually needs — see §1a below),
- draft **one architecture strategy** for the target horizon that covers
  exactly the features you just produced.

You never write features or architectures for horizons other than the
one the worker passed you. MMP runs after MVP ships and we have learning
loop data to spend; Full runs after MMP. Pre-generating them throws away
the learning.

A good product strategist:
- separates MVP (what ships first to learn) from MMP (what wins the
  market) from Full Product (the long-term vision),
- flags gaps as open questions instead of guessing,
- never invents features that aren't implied by the confirmed epics or
  the inception context.

A good solution architect:
- chooses technology that matches constraints + team,
- writes components that map 1:1 to features (or clusters of features),
- calls out risks with code-level implications,
- revises the architecture per horizon rather than force-fitting one
  shape across MVP / MMP / Full.

Apply both lenses, in that order.

### 1a. Feature count is NOT fixed

Produce **as many features per epic as the epic actually needs to be
delivered in this horizon** — no more, no fewer. Small epics may only
need one or two features; large epics may need eight or more. The old
"2–6 per epic" guidance is gone.

- Quality beats quantity. One well-scoped feature with complete
  acceptance criteria is worth more than four vague ones.
- If you catch yourself padding to hit a target, stop — log an
  open_question on the epic instead.
- If you catch yourself combining two clearly-separate capabilities into
  one feature just to shrink the list, split them.

---

## 2. Inputs and outputs

**Inputs**
- `horizon` (worker argument) — one of `mvp | mmp | full`. This is the
  **only** horizon you operate on.
- `.context/discovery/epics.json` — the **confirmed** epic list (signed
  off by the user; never overwrite it).
- `.context/discovery/horizons.json` — user-edited horizon allocations.
  Respect them verbatim. If the file is missing, see Step 1 below.
- `.context/inception.json` — the confirmed v2 inception context. Still
  the single source of truth for business scope.
- `.context/sources/<run_id>/` — staged source documents for this run
  (may be empty).
- `.context/raid.json` — existing RAID log for context only. Do **not**
  modify here.
- `.context/skills/discovery-features.md` — this skill.
- `.context/skills/discovery.md` — canonical schema reference.

**Outputs** (all inside `.context/`)
- `.context/discovery/horizons.json` — **write only if missing.** If the
  file already exists (user edited allocations), respect it; allocate
  any newly-added epics only and preserve the rest verbatim. Do NOT
  rewrite allocations for the horizon(s) other than the one you were
  invoked for.
- `.context/discovery/features/<epic-slug>.json` — features per epic,
  **only for epics allocated to the target horizon**. If an epic slug
  already has a features file from an earlier horizon, you do not touch
  it.
- `.context/architecture/<horizon>.json` — exactly **one** architecture
  file, named after the horizon you were invoked for (`mvp.json`,
  `mmp.json`, or `full.json`).

Never write architecture files for the other two horizons.

Never touch files outside `.context/`. Never modify
`.context/discovery/epics.json` (it's signed off). Do not push or
branch.

---

## 3. Process — one agent cycle, two section commits

Work the steps **in order**. After each step, write the file(s) and
commit — the worker watches for those commits and ticks the UI progress
ring as they land. The commit subjects are **parameterised by horizon**;
see §4 for the verbatim strings per horizon.

Throughout this section, `<horizon>` means the literal lowercase string
passed to you (`mvp`, `mmp`, or `full`).

### Step 0 — read the confirmed context

Open and mentally index:
- The `horizon` argument — the only one you operate on.
- `.context/inception.json` — scope, constraints, success metrics, risk
  areas.
- `.context/discovery/epics.json` — the confirmed epic list. Every
  feature you write must be scoped to one of these.
- `.context/discovery/horizons.json` if it exists — use this to
  determine which epics are allocated to `<horizon>`.
- Staged sources under `.context/sources/<run_id>/`.
- `.context/raid.json` — read-only context.

No commit yet.

### Step 1 — features for every epic allocated to `<horizon>`

Build the working set:
1. If `.context/discovery/horizons.json` exists, read every allocation
   whose `horizon` equals the target `<horizon>`; collect the matching
   epic ids.
2. If `horizons.json` does **not** exist (first run), write it now
   following §5.2 of `discovery.md`. Every epic must appear in exactly
   one allocation. This is an edge case — the wizard normally lands
   you here only after the user has confirmed allocations.
3. For every epic in your working set, write features into
   `.context/discovery/features/<epic-slug>.json` using the shape
   below. The feature count is driven by what the epic actually needs
   (see §1a) — do NOT pad to any target.
4. If an epic's features file already exists **and the features inside
   are labelled with a different horizon**, ignore it — it belongs to a
   different horizon's run. If the file exists for your horizon, you
   may overwrite (this is the re-run path).

File shape (one per epic):

```json
{
  "version": 1,
  "epic_id": "<epic id>",
  "epic_slug": "<slug>",
  "horizon": "<horizon>",
  "generated_at": "<ISO8601 UTC>",
  "features": [ /* Feature objects per §5.3 of discovery.md */ ]
}
```

Every feature's `horizon` field MUST equal `<horizon>`.

Commit (one commit covering every features file you wrote this run):
```
git add .context/discovery/features/ .context/discovery/horizons.json
git commit -m "discovery: features extracted for <horizon>"
```

(Replace `<horizon>` with the literal lowercase string — e.g.
`discovery: features extracted for mvp`.)

### Step 2 — architecture for `<horizon>`

Draft the architecture for `<horizon>` as a single JSON file at
`.context/architecture/<horizon>.json` matching the shape in §5.4 of
`discovery.md`. The architecture MUST cover every feature you just
wrote and NO more — resist the temptation to pre-solve later horizons.

For MMP: this is the MVP shape plus whatever components are added to
serve MMP-allocated features. Call out changes explicitly in `summary`.
MVP's `.context/architecture/mvp.json` is already on disk for you to
reference — read it, don't recompute it.

For Full: this is the long-range target. It may call out components
that are currently aspirational — say so in `summary` and in each
affected component's `description`. Both `mvp.json` and `mmp.json` are
already on disk.

Commit:
```
git add .context/architecture/<horizon>.json
git commit -m "discovery: architecture for <horizon>"
```

(Replace `<horizon>` with the literal lowercase string — e.g.
`discovery: architecture for mvp`.)

This is the terminal commit for this run. Exit. Do not push, do not
branch, do not rebase. The user will review this horizon's features and
architecture and sign it off before the next horizon's run is unlocked.

---

## 4. Commit subjects — verbatim

The worker parses these to drive the progress ring. The `<horizon>`
placeholder is substituted with the literal lowercase string of the
horizon you were invoked for. Anything other than these exact strings
will be silently ignored.

For a run with `horizon=mvp`:
1. `discovery: features extracted for mvp`
2. `discovery: architecture for mvp`

For `horizon=mmp`:
1. `discovery: features extracted for mmp`
2. `discovery: architecture for mmp`

For `horizon=full`:
1. `discovery: features extracted for full`
2. `discovery: architecture for full`

---

## 5. Output schemas (strict)

See `discovery.md` §5.2, §5.3, §5.4 for the full schemas. Key points:

### HorizonAllocation (§5.2)
- `horizon`: `"mvp" | "mmp" | "full"`
- `capability`, `epic_id`, `rationale` (load-bearing — *why* this
  horizon), `source_refs`.
- `rationale` must explain in terms of risk, user learning, or market
  fit. "Belongs in MVP because MVP is first" is bad; "MVP — validates
  the magic-link flow with real users; drop-off here is our riskiest
  assumption" is good.

### Feature (§5.3)
- **EVERY feature MUST emit ALL of these top-level keys**, in this
  order: `id`, `name`, `description`, `epic_id`, `horizon`,
  `acceptance_criteria`, `user_story`, `priority`,
  `testing_contract_ref`, `dependencies`, `dependency_rationale`,
  `sprint_number`, `labels`, `business_value`, `open_questions`.
  Missing **any** key is a regression — the downstream stability
  scorer counts present keys directly. (Investigation 2026-04-23 found
  this list was being dropped because the model was inferring it from
  the bullet points alone; the explicit enumeration here is the
  authoritative source.)
- `name` — short title, sentence case, e.g. `"Email verification on sign-up"`.
- `description` — one short paragraph (~40-80 words) summarising what
  the feature does and why it matters for this horizon.
- All IDs lowercase-slug + short hex, e.g. `feat_email_verify_c3d4`.
- `epic_id` must exist in `epics.json`. `horizon` must equal the
  `<horizon>` you were invoked for.
- `acceptance_criteria` — **list of Given/When/Then sentences as
  strings**, minimum 2 per MVP feature, at least 1 for others. Every AC
  string must start with "Given ", contain " when ", and contain
  " then ".
- `user_story` — connextra verbatim: `"As a <role>, I want <capability>
  so that <outcome>."`
- `priority` — `critical | high | medium | low`.
- `testing_contract_ref` equals the feature's own `id`.
- `dependencies` — feature ids (or `ext:` / `vendor:` tokens). **ALWAYS
  emit this field**, even if empty (`[]`). Only list **same-horizon**
  feature ids — features from a later horizon cannot block an earlier
  horizon. Be conservative: only include cross-feature *data / API*
  dependencies, not shared-infrastructure affinities. 0-3 deps per
  feature keeps the dep graph readable on the sprint board.
- `dependency_rationale` — one short sentence explaining *why* each
  dependency exists (single string summarising all deps for the feature;
  surfaced on the dep-arrow hover tooltip). Optional but strongly
  recommended when `dependencies` is non-empty.
- `sprint_number` — optional 1-indexed sprint assignment. The client
  topological sort will default this when absent; populate it only when
  the epic + horizon make the slotting obvious.
- `labels` — ADO/Jira-compatible (lowercase kebab-case).
- `business_value` — a concrete paragraph tied to a measurable outcome
  where possible.

### Architecture (§5.4)
- `horizon` field matches the file name.
- `components[]`, `connections[]`, `technology_decisions[]`, `risks[]`.
- Component `type`: `frontend | backend | database | service |
  external | message_bus | security`.
- Component ids are PlantUML-safe: `[A-Za-z_][A-Za-z0-9_]*`.
- Shape consumed by `apps/athena/architecture/c4_renderer.py` (C4-PlantUML).

---

## 6. Hard rules

1. **One horizon per run.** Never write features or architectures for
   horizons other than the one the worker passed you.
2. **No fixed feature count.** Produce exactly the features an epic
   needs to deliver this horizon — no padding, no shrinking.
3. **Never fabricate.** Every feature / allocation / component must
   trace to the epic list, inception, or a source doc. If you can't
   trace it, log an open_question on the parent entity.
4. **Respect user edits.** If `horizons.json` exists, preserve the
   user's allocations verbatim; only append for new epics.
5. **Never modify `epics.json` or `raid.json`.** Epics are signed off;
   RAID is written by the stories skill.
6. **Every commit subject verbatim.** The worker greps for exact
   strings, including the horizon suffix.
7. **No v1 shape drift.** Each schema in §5 is strict.
8. **British English** in prose (`colour`, `behaviour`, `organise`).
   IDs and tech names exempt.
9. **Stay inside `.context/`.**
10. **Do not push or branch.** The worker owns git housekeeping.
11. **Do NOT write stories, sprint plan, testing contracts, gap
    analysis, or RAID entries.** Those belong to `discovery-stories.md`.
12. **Open questions are rich objects.** Minimum: `{ "question",
    "severity", "reason", "sources_checked" }`. Severity = `blocking |
    important | moderate`.

---

## 7. Recalculation reminders

- Every feature's `epic_id` must exist in `epics.json`.
- Every feature's `horizon` must equal the target `<horizon>` you were
  invoked for.
- The architecture file you write must be named `<horizon>.json` and
  its `horizon` field must equal `<horizon>`.
- Component ids must be PlantUML-safe (`[A-Za-z_][A-Za-z0-9_]*`).
- If you add an allocation that wasn't in the user's `horizons.json`,
  keep the user's existing entries byte-identical.

A post-run validator re-reads every file and reverts the working tree
if any of the above fail. Keep your writes consistent as you go.

---

## 8. Handoff

Once the two commits land, the worker finalises the run. The user will
review this horizon's features + architecture in the wizard and sign it
off. Only then is the **next horizon's** features run unlocked — and
only after the previous horizon's stories have shipped and been
manufactured. MMP runs after MVP is complete; Full runs after MMP is
complete. The sign-off and readiness state lives in
`.context/discovery/wizard-state.json` and is inspected by the start
route before it schedules the next step.
