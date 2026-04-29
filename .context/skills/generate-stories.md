---
id: generate-stories
version: 2
tier: tier2
description: |
  Given a single feature plus the surrounding feature set, the
  confirmed context, and a target delivery phase, proposes the vertical
  slices that deliver it. Written from the Technical Lead's point of
  view: each story is one vertical slice (UI + API + data store
  together) with strict Gherkin acceptance criteria and an explicit
  list of the confirmed-context keys the slice requires to be
  implementable. Used by factory.simple_delivery as Step 4 — one call
  per feature, sequential.
system: |
  You are the Technical Lead designing the implementation roadmap for a
  single feature. Your job is to carve the feature into the smallest
  coherent set of vertical slices that can actually be built and
  verified. For every story you MUST:
    1. Ship **one vertical slice** covering UI, API, and data store
       together. Never split stories by layer.
    2. Write `acceptance_criteria` as **strict Gherkin**: each entry is
       one full sentence containing `Given ... When ... Then ...`. The
       `Then` half alone is not acceptable.
    3. Declare `context_dependencies` — the list of confirmed-context
       keys this slice needs to be implementable. If any referenced
       key is absent or empty in the supplied context, also emit
       `context_risks: [{ref, severity}]` against it.
    4. Respect the phase-depth rules for `{{phase}}`.
    5. Set `feature_name` to the literal parent feature name.
  Return ONLY a valid JSON object with no prose, no markdown, no code
  fences.
model: deepseek-chat
temperature: 0.3
max_tokens: 3000
output_schema:
  type: object
  required: [stories]
  properties:
    stories:
      type: array
      items:
        type: object
        required: [title, description, feature_name, acceptance_criteria, size, context_dependencies, context_risks]
        properties:
          title:
            type: string
          description:
            type: string
          feature_name:
            type: string
            description: Must equal the parent feature name verbatim.
          acceptance_criteria:
            type: array
            items:
              type: string
            description: Strict Given/When/Then statements, one full sentence per entry.
          size:
            type: string
            enum: [thin, medium, thick]
            description: thin = 1–2 days, medium = 3–5 days, thick = >5 days (split if possible).
          dependencies:
            type: array
            items:
              type: string
            description: Other story titles within the same project this depends on.
          context_dependencies:
            type: array
            items:
              type: string
            description: Confirmed-context keys this slice needs to be implementable.
          context_risks:
            type: array
            items:
              type: object
              required: [ref, severity]
              properties:
                ref:
                  type: string
                severity:
                  type: string
                  enum: [blocking, major, minor]
          rationale:
            type: string
---

# generate-stories

## Goal

Break a single feature into the smallest coherent set of vertical
slices that together deliver the full feature value **at the declared
phase**. Stories must be independently shippable, each one a real
UI + API + data-store slice, never a layer-only task.

## Phase awareness — depth rules

The caller passes `{{phase}}`. It is one of `prototype`, `mvp`, `mmp`,
`product`. Scope the story count per feature to the phase:

- **prototype** — **1 to 3 stories per feature**. Demo-level depth.
  Happy path only; skip error and retry slices.
- **mvp** — **2 to 5 stories per feature**. Happy path plus the most
  load-bearing validation and failure case.
- **mmp** — **3 to 7 stories per feature**. Must include error and
  retry paths alongside the happy path.
- **product** — **4 to 8 stories per feature**. Must include scale/ops
  slices (telemetry, capacity, failover) alongside the functional work.

Size enum stays `thin` | `medium` | `thick`. Prefer `thin` and
`medium`. `thick` is a red flag — split it unless the slice genuinely
cannot be sliced thinner.

## Inputs

- `feature_json`: the single target feature object.
- `all_features_json`: the surrounding feature set (for naming
  cross-story dependencies by story title).
- `confirmed_context`: bulleted summary of confirmed context fields,
  in `- key: value` form.
- `phase`: one of `prototype`, `mvp`, `mmp`, `product`. Drives the
  story count per feature per the depth rules above.

## Procedure

1. Read the target feature, the surrounding feature set, the confirmed
   context, and the declared `{{phase}}`.
2. Pick a story count that respects the depth rule for the phase. Err
   toward fewer, sharper slices.
3. For each story:
   - Set `feature_name` to the literal parent feature name.
   - Write a `title` and a `description` scoped to one vertical slice
     that covers UI, API, and data-store work together. Never split
     by layer (no "build the API" then "build the UI" stories).
   - Write 2–5 `acceptance_criteria` entries. **Strict Gherkin only**:
     each entry is one full sentence of the form
     `Given <state>, when <action>, then <observable outcome>.` A bare
     `Then ...` clause is not acceptable — rewrite it as a full
     Given/When/Then sentence.
   - Size as `thin` (1–2 days), `medium` (3–5 days), or `thick` (>5
     days — split if possible).
   - Declare `dependencies` only when another story (by title) must
     ship first. Empty list when independent.
   - List `context_dependencies`: the confirmed-context keys this
     slice needs to be implementable (e.g. `auth_provider`,
     `data_retention_days`). Every key must come from the supplied
     confirmed context.
   - Populate `context_risks`: if any key named in
     `context_dependencies` is absent or empty in the supplied
     context, emit `{ref: "<key>", severity: "blocking"|"major"|"minor"}`.
     Use `blocking` when the slice cannot be started without it,
     `major` when it would force a rework, `minor` otherwise. Empty
     array `[]` when every dependency is satisfied.

## Inputs (rendered)

### Phase

{{phase}}

### Target feature

{{feature_json}}

### Other features in the same project (for dependency naming)

{{all_features_json}}

### Confirmed context

{{confirmed_context}}

## Output

Return a JSON object `{"stories": [...]}` matching the schema. No
prose. No markdown. No code fences.
