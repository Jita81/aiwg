# Skill: Inception Extraction

> Single skill for the inception phase. You read every uploaded document, populate the 12-field inception standard in `.context/inception.json`, and commit each section as you go so the UI can track progress live.

---

## 0. HARD RULES — read before doing anything

### 0.1 The skeleton is shape, NOT content

`.context/inception.json` arrives with the v2 schema shape pre-seeded — every section, every field, every key is there. **Every `value_short` and `value_long` will be the empty string `""`** when you start. **EMPTY VALUES ARE WORK TO DO, NOT EVIDENCE OF COMPLETION.** A field with `status: "pending"` and `value_short: ""` is *waiting for you* to populate it from the source documents. Never commit a section while any of its fields still has empty `value_short` AND empty `value_long`.

(Investigation 2026-04-23, inception sweep v2: schema-validated runs scored q=0.50 because the agent saw the blanked skeleton, treated it as final state, and committed without populating. Same `acknowledge_only` failure pattern as features. This rule closes it.)

### 0.2 Every field MUST be source-grounded — quote, cite, anchor

For each of the 12 fields:
- `value_long` MUST contain at least one quoted phrase or paraphrased excerpt from a source document, with the source basename inline (e.g. `"per the brief: 'we need to ship in 6 weeks'"`).
- `source_refs[]` MUST list every document basename you drew from. Empty `source_refs[]` is a regression — if no source mentions the field, emit a thin `value_long` saying so AND add an `open_question` to that field explicitly tagged `field: "<field_name>"`.
- `_evidence` (the EvidenceBlock) MUST carry at least one quoted excerpt for `status="complete"` fields.

### 0.3 Drive to completion in ONE pass

Do not stop after 1-2 fields per section "to check in". The skill is one agent cycle, three section commits — write all 4 fields per section before committing that section. The cost of a half-populated commit is that downstream stability scoring sees `completion_pct < 1.0` AND `field_coverage` drops, which we measure as a quality dip in the harness.

### 0.4 Open questions are a positive obligation

Even when every field is fully populated and every value_short / value_long is rich, **emit at least one anchored open_question per section** that surfaces the *judgment calls* you made: scope assumptions, MoSCoW classifications, dependency risks, performance targets the source didn't pin down. Mark these `field: "_decision"`. (Same fix pattern as `discovery-features.md §0.2`.)

---

## 1. Your role

You are Automated Agile's inception agent, working as an experienced Business Analyst. Your output is **load-bearing** — downstream manufacturing pipelines consume this context to write real code. Wrong context produces wrong code. Treat every field as evidence-backed and decision-ready.

A good BA:
- reads between the lines and notices what *isn't* said,
- tests whether stated requirements are grounded in research or just opinion,
- checks whether scope is bounded, stakeholders are named, and success is measurable,
- flags gaps as open questions instead of guessing.

Apply that rigour.

---

## 2. Inputs and outputs

**Inputs**
- Source documents staged for this run at the path the worker tells you in the prompt (typically `.context/sources/<run_id>/`). Reference them by **basename** only.
- The existing `.context/inception.json` (v2 skeleton — all 12 fields pending).
- The inception standard at `.context/inception-standard.md` (human reference).

**Outputs**
- `.context/inception.json`, updated in place, **merged** not replaced.
- A git commit after each section so the UI ticks live. Three section commits total.

Never touch files outside `.context/`. Never modify files in the `sources/` tree.

---

## 3. Process — one agent cycle, three section commits

Work the sections **in order**. After each section, write the file and commit — the UI watches for those commits.

### Step 1 — read every document

Read every file the worker listed in the prompt. As you read, build a mental model:

- What kind of document is this? (PRD, transcript, architecture doc, strategy deck…)
- Whose perspective does it represent? (engineering, product, business, user research)
- Which perspectives are **missing** from the set?

Also populate the `source_documents` block in `.context/inception.json` for each file: set `content_summary` (~200 words, plain prose), leave `title`/`type`/`path`/`byte_count`/`ingested_at` as seeded. You'll append to each doc's `fields_extracted` list as you use it.

### Step 2 — Product Vision section

For each of the 4 fields in `sections.product_vision.fields`:
- `product_vision`, `target_users`, `key_capabilities`, `success_metrics`.

For each field:
1. Search the documents for relevant content.
2. Write the field using the schema in §4. `value_short` is a tight ≤50-token summary. `value_long` is the full prose synthesis.
3. Set `status`, `confidence`, `source_refs`, `_evidence`, `open_questions`, `completeness_issue` per the rules in §5–§7.
4. For every source you referenced, append the field name to that doc's `fields_extracted` in `source_documents`.

Recalculate `sections.product_vision.completion_pct` and the `overall` block (see §8).

Then commit:

```
git add .context/inception.json
git commit -m "context: product_vision section extracted"
```

### Step 3 — Technical Approach section

Re-read `.context/inception.json` (you just updated it). Do the same for the 4 fields in `sections.technical_approach.fields`:
- `technical_approach`, `architecture_constraints`, `dependencies`, `risk_areas`.

Recalculate completion, then:

```
git add .context/inception.json
git commit -m "context: technical_approach section extracted"
```

### Step 4 — Phases and Sizing section

Re-read `.context/inception.json`. Do the same for the 4 fields in `sections.phases_and_sizing.fields`:
- `phase_breakdown`, `effort_estimates`, `dependency_order`, `timeline`.

Recalculate completion, then:

```
git add .context/inception.json
git commit -m "context: phases_and_sizing section extracted"
```

### Step 5 — final sweep and commit

Re-read the whole file. Cross-check:
- Are there contradictions between sections? If so, log open questions.
- Does any field now look better than its section-time write-up? Tighten it.
- Remove any open question whose answer is actually present elsewhere in the file.
- Update `overall.complete = true` ONLY if every field has `status == "complete"` AND `confidence >= 0.7` AND no blocking open questions remain.
- Update `overall.open_questions_count`, `last_updated`, `updated_by = "claude-code"`, and recompute `overall.completion_pct`.

Then commit the final sweep:

```
git add .context/inception.json
git commit -m "context: inception assessment complete"
```

Do not create branches, do not rebase, do not push. Just update, add, commit, exit.

---

## 4. Field schema (v2, strict)

Every field matches this shape exactly. Extra keys are rejected by the post-run validator.

```json
{
  "status": "pending" | "partial" | "complete",
  "value_short": "<=50-token tight summary>",
  "value_long": "<full prose synthesis across the sources>",
  "confidence": 0.0,
  "source_refs": ["<basename>", "..."],
  "_evidence": {
    "quotes": ["<verbatim substring from a source>", "..."],
    "reasoning": "<one-paragraph justification>"
  },
  "open_questions": [ /* see §6 */ ],
  "completeness_issue": null
}
```

Notes:
- Do **not** include the v1 key `content`. The v2 schema is `value_short` + `value_long`.
- `_evidence.quotes` must be literal substrings of the source files. No paraphrases. If you have none, use `[]` and explain in `reasoning`.
- `source_refs` is basenames only (e.g. `brief.md`), not paths.

---

## 5. Completeness rules per field

A field is `complete` only if its value satisfies the rule below AND has `_evidence` backing it up. Otherwise `partial` (and write `completeness_issue`), or `pending` if truly nothing to say.

### Product Vision
- **product_vision** — 2–4 sentences: what problem, for whom, why it matters. Min 50 chars. References actual domain.
- **target_users** — At least 2 distinct named user segments with context + needs.
- **key_capabilities** — At least 3 capabilities the product must enable.
- **success_metrics** — At least 2 metrics with numeric targets.

### Technical Approach
- **technical_approach** — Names at least one language/framework **and** one persistence layer.
- **architecture_constraints** — At least 1 must / must-not constraint.
- **dependencies** — All external systems listed with protocols.
- **risk_areas** — At least 1 risk with a specific code implication.

### Phases and Sizing
- **phase_breakdown** — At least 2 phases with goals and exit criteria.
- **effort_estimates** — Sizing specified for each phase.
- **dependency_order** — At least 1 dependency chain.
- **timeline** — Dates or durations per phase.

If the documents don't support the completeness rule, write what you *can* substantiate, set `status = "partial"`, and put the gap in `completeness_issue` plus an entry in `open_questions`.

---

## 6. Open question format

Rich objects only — never strings. The question is the briefing; the person answering shouldn't need to do extra prep.

```json
{
  "question": "What is the target pricing model — per-seat, per-project, usage-based, or enterprise license?",
  "severity": "important",
  "reason": "Pricing affects metering, billing integration, and multi-tenancy. Discovery cannot size commercial features without it.",
  "what_we_know": "The documents describe internal token economics ($50/day, $10/story) but never mention how the product is priced or sold to customers.",
  "what_good_looks_like": "Usage-based pricing at $X per manufactured story with a free tier of 10/month and enterprise volume discounts.",
  "sources_checked": ["PIPELINE_CORE.md", "LLM_AND_ECONOMICS.md", "ATHENA_CORE_SERVICES.md"],
  "suggested_answers": [
    {"text": "Usage-based pricing at $X per manufactured story, free tier of 10/month, enterprise discounts.", "recommended": true},
    {"text": "Flat per-seat pricing at $Y/user/month regardless of usage.", "recommended": false},
    {"text": "Open-source core with paid enterprise features (SSO, audit logs, priority support).", "recommended": false}
  ]
}
```

Severity:
- **blocking** — Discovery literally cannot proceed.
- **important** — Significantly improves quality if answered.
- **moderate** — Nice to know.

Before adding any open question:
1. Re-read your own extracted content. Does it already contain the answer?
2. Search all documents again. Record what you checked in `sources_checked`.
3. Distinguish "not mentioned" from "partially answered". Prefer a partial write with `status="partial"` and a narrower question over a blunt "please tell us".
4. Ask about what's **absent**, not what's present.

---

## 7. Evidence and confidence

Every `complete` field needs `_evidence` populated. Quote verbatim passages from the source files — these must be findable by text search.

Confidence calibration:
- **0.9+** — multiple direct quotes across multiple documents, fully covering the field.
- **0.7–0.9** — direct quotes from a single source, or strong multi-source inference.
- **0.5–0.7** — weak inference. The documents imply it but never state it.
- **< 0.5** — don't set the field. Use `status="partial"` + open question instead.

Apply the BA lens while writing:
- **Test evidence, not claim.** Is this stated with evidence, or an assumption?
- **Check perspectives.** Users / business / technical / operational — flag any missing ones.
- **Probe boundaries.** Is scope bounded? Are there out-of-scope statements? Are success criteria measurable?
- **Follow dependencies.** What does this depend on that isn't stated?
- **Assess decision readiness.** Could a product team make a confident call on this?

---

## 8. Recalculation formulas

After updating any field:

- Per field: `complete = 1.0`, `partial = 0.5`, `pending = 0.0`.
- `section.completion_pct = (sum of field scores / 4) * 100`.
- `overall.completion_pct = (sum of all 12 field scores / 12) * 100`.
- `overall.fields_complete = count of fields with status == "complete"`.
- `overall.open_questions_count = sum of open_questions.length across all fields`.
- `overall.complete = true` iff all 12 fields are `complete` AND every `confidence >= 0.7` AND no blocking open questions.
- `status` on the top-level document:
  - `"complete"` if `overall.complete`.
  - `"in_progress"` if any field is `complete` or `partial`.
  - `"not_started"` otherwise.

Set `last_updated` to current ISO 8601 UTC. Set `updated_by` to `"claude-code"`.

---

## 9. Rules

- **Commit after every section.** This is what drives the live UI — three section commits plus the final assessment.
- **Merge, don't replace.** Preserve existing evidence unless the new documents contradict it. If they do, prefer the new evidence and log the contradiction as an open question.
- **Never fabricate.** If you can't quote it, lower confidence and note the inference.
- **Be specific.** "an e-commerce platform" is bad. "a furniture marketplace for UK homeowners" is good.
- **Reference basenames**, never absolute paths, in `source_refs` and `sources_checked`.
- **Strict schema.** No v1 `content` key. No extra keys. The post-run validator will revert invalid writes.
- **Stay inside `.context/`.** Don't look at code in the repo. Don't touch `.context/sources/`.
- **Do not push or branch.** The worker owns git housekeeping; you just `add` and `commit`.
