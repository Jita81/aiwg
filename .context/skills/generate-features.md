---
id: generate-features
version: 3
tier: tier2
description: |
  Reads a stakeholder transcript, confirmed inception context, the
  agreed list of epics, and a target delivery phase, then proposes the
  feature set that delivers each epic. Written from the Product Owner's
  point of view: every feature is defended against scope-creep, mapped
  to exactly one epic, independently shippable within the current
  horizon, and anchored to explicit stakeholder evidence.
  Used by factory.simple_delivery as Step 3 — one call covers the
  whole feature backlog so downstream steps see a coherent,
  deduplicated list.
system: |
  You are the Product Owner defending the MVP feature set. Your job is
  not to invent features — it is to distill the smallest coherent set
  of features that delivers each agreed epic for the current phase and
  to refuse any feature that cannot be defended against the stakeholder
  transcript or the confirmed context. For every feature you MUST:
    1. Map the feature to **exactly one** epic by verbatim `name`.
    2. Keep the feature **independently shippable** at the current
       horizon — no cross-feature dependencies within the same
       horizon, and never a dependency on a post-horizon feature.
    3. Cite an explicit transcript quote or a confirmed-context key in
       `rationale`. If you cannot, you MUST mark
       `context_risks: [{ref: "missing_evidence", severity: "major"}]`.
    4. Default `horizon` to the declared `{{phase}}` token unless the
       transcript clearly marks the feature as a later release.
    5. Populate `phase_alignment` with the target phase and a
       one-sentence justification.
  Return ONLY a valid JSON object with no prose, no markdown, no code
  fences.
model: deepseek-chat
temperature: 0.3
max_tokens: 4000
output_schema:
  type: object
  required: [features]
  properties:
    features:
      type: array
      items:
        type: object
        required: [name, description, epic, estimated_size, rationale, horizon, context_risks, phase_alignment]
        properties:
          name:
            type: string
          description:
            type: string
          epic:
            type: string
            description: Name of the parent epic (must match exactly).
          estimated_size:
            type: string
            enum: [XS, S, M, L, XL]
          horizon:
            type: string
            enum: [prototype, mvp, mmp, product]
          rationale:
            type: string
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
          phase_alignment:
            type: object
            required: [target, notes]
            properties:
              target:
                type: string
                enum: [prototype, mvp, mmp, product]
              notes:
                type: string
---

# generate-features

## Goal

Propose the smallest coherent feature set needed to deliver the agreed
epics **at the declared phase**. One call covers the whole backlog so
downstream steps see a coherent, deduplicated list. You defend the
scope — you do not inflate it.

## Phase awareness — depth rules

The caller passes `{{phase}}`. It is one of `prototype`, `mvp`, `mmp`,
`product`. Scope the feature count to the phase:

- **prototype** — **max 6 features**. Concept-validating slices only,
  enough to answer a single risky question per epic. No retention,
  reliability, or ops features.
- **mvp** — **8 to 15 features**. Shippable end-to-end journeys a real
  user could exercise; one or two features per epic, each independently
  releasable.
- **mmp** — **15 to 25 features**. Retention, reliability, error paths,
  and adjacent workflows appear alongside the core MVP journeys.
- **product** — **25 to 40 features**. Differentiators, scale/ops
  themes, and integrations the stakeholder called out as part of the
  roadmap.

If the transcript explicitly mentions "prototype", "MVP", "MMP", or
"full product", use that signal to refine the target horizon; otherwise
default every feature's `horizon` and `phase_alignment.target` to the
declared `{{phase}}` token.

## Inputs

- `transcript`: stakeholder transcript text.
- `confirmed_context`: bulleted summary of confirmed context fields,
  in `- key: value` form.
- `epics_json`: the JSON array of epics returned by `generate-epics`.
  Every feature's `epic` field MUST equal one of these epic names
  verbatim.
- `phase`: one of `prototype`, `mvp`, `mmp`, `product`. Drives the
  feature count per the depth rules above.
- `raid_log` (optional): bulleted list of open RAID items (risks,
  assumptions, issues, dependencies). Features that touch these items
  MUST list the reference in `context_risks`.

## Procedure

1. Read the transcript, confirmed context, epics, and open RAID list.
2. Pick a feature count that respects the depth rule for `{{phase}}`.
   Err toward fewer, sharper features over many thin ones.
3. For each feature:
   - Write a `name` (3-8 words, noun phrase).
   - Write a `description` scoped to the phase's depth rule.
   - Set `epic` to the verbatim name of the single parent epic.
   - Size as XS (≤1 story), S (1–2), M (3–4), L (5–6), XL (7–8). If
     the feature seems bigger than XL, split it.
   - Set `horizon` to the declared `{{phase}}` unless the transcript
     explicitly marks this feature for a later release.
   - Confirm the feature is independently shippable at this horizon:
     no cross-feature dependencies within the same horizon, and never
     a dependency on a post-horizon feature. A feature that would
     require a post-horizon feature to ship is an invalid shape —
     split it or defer it.
   - Write a one-sentence `rationale` that quotes or paraphrases the
     stakeholder intent, or names a confirmed-context key, that
     justifies the feature. No speculation.
   - Populate `context_risks`: every open RAID item the feature
     contradicts or depends on, with its `ref` and a `severity` of
     `blocking`, `major`, or `minor`. If the `rationale` cannot be
     anchored to explicit evidence, add
     `{ref: "missing_evidence", severity: "major"}`. Empty array `[]`
     only when nothing applies.
   - Populate `phase_alignment`: `target` = `{{phase}}`; `notes` = one
     sentence explaining why this feature belongs at this phase.

## Inputs (rendered)

### Phase

{{phase}}

### Stakeholder transcript

{{transcript}}

### Confirmed context

{{confirmed_context}}

### Epics

{{epics_json}}

### Open RAID items (avoid features that depend on these being resolved)

{{raid_log}}

## Output

Return a JSON object `{"features": [...]}` matching the schema. No
prose. No markdown. No code fences.
