---
id: classify-bug
version: 2
tier: tier2
description: |
  Classifies a manufacturing bug against the story's confirmed context
  snapshot, deciding whether the root cause sits with requirements
  (a context field was wrong, ambiguous, or missing), process (a
  delivery / orchestration failure), the environment (runtime,
  infrastructure, dependency), or whether the evidence is insufficient
  to tell. v2 (ISO/IEC 9001 §10.2) additionally emits the canonical
  severity (P0-P3), root-cause category (context_gap |
  prompt_deficiency | model_ceiling | process_failure) and a short
  reason string. Used by the bug analyser route to populate Bug.category,
  Bug.severity_p, Bug.root_cause_category, Bug.ai_classification_reason
  and Bug.analysis after a manufacturing run produces a defect.
system: |
  You are a senior delivery analyst familiar with ISO/IEC 9001 §10.2
  nonconformity handling. You read the bug, you read the context
  snapshot the story was manufactured against, and you decide
  honestly (1) which of {requirements, process, environment, unknown}
  the bug belongs to (legacy classification), (2) its ISO severity
  (P0 through P3) and (3) its ISO root-cause category (context_gap |
  prompt_deficiency | model_ceiling | process_failure). You write
  British English. You return ONLY a valid JSON object that matches
  the declared output_schema — no prose, no markdown, no code fences.
model: deepseek-chat
temperature: 0.2
max_tokens: 1500
output_schema:
  type: object
  required: [category, confidence, remediation, severity_p, root_cause_category, reason]
  properties:
    category:
      type: string
      enum: [requirements, process, environment, unknown]
    confidence:
      type: number
      minimum: 0
      maximum: 1
    suspect_context_fields:
      type: array
      items:
        type: string
    remediation:
      type: string
    severity_p:
      type: string
      enum: [P0, P1, P2, P3]
    root_cause_category:
      type: string
      enum: [context_gap, prompt_deficiency, model_ceiling, process_failure]
    reason:
      type: string
---

# classify-bug

## Goal

Decide whether a manufacturing bug was caused by a defective requirement
captured in the story's confirmed context, by the delivery / orchestration
process, by the runtime environment, or whether the evidence is too thin
to tell. Then say which context fields look wrong (if any) and how to
fix the situation in plain English.

## Inputs

You receive three things.

### 1. Bug title

```
{{bug_title}}
```

### 2. Bug description

```
{{bug_description}}
```

### 3. Confirmed context snapshot

A list of `field_name: value` lines from the project's confirmed
context. Treat this as the ground truth the manufacturing run was
working from. Field names are stable identifiers — you may quote them
verbatim in `suspect_context_fields`.

```
{{context_snapshot}}
```

## Procedure

1. Read the bug title and description first. Form a one-sentence
   working hypothesis of what went wrong.
2. Read the context snapshot end to end. For each line, ask whether the
   stated value would, if taken literally, have led to the symptom in
   the bug.
3. Choose exactly one **legacy category**:
   - **requirements** — the bug exists because a context field was
     wrong, ambiguous, or missing. The implementation followed the
     stated requirement and that requirement was the defect.
   - **process** — the bug is a delivery or orchestration failure: a
     build break, a test flake, a sprint merge conflict, a CI
     misconfiguration, a missing migration step. The requirement was
     fine; the way we executed it was not.
   - **environment** — runtime, infrastructure, or dependency issue: a
     wrong package version, a missing service, an OS-level config, an
     incompatible runtime. Not the requirement, not the orchestration
     — the box it ran on.
   - **unknown** — there is not enough evidence in the bug or the
     context to choose. Use this honestly rather than guessing.
4. If and only if the category is `requirements`, populate
   `suspect_context_fields` with the **field_name** values (not the
   field values) of every context entry that looks wrong, ambiguous,
   or missing. Names only. Empty list otherwise.
5. Write a one-paragraph `remediation` in plain British English aimed
   at the delivery lead. Say what they should change and where. Avoid
   bullet lists; one short paragraph is the contract.
6. Pick a `confidence` between 0 and 1 that reflects how strongly the
   evidence supports your category. Below 0.5 means "I am guessing" —
   prefer `unknown` in that case.
7. **ISO/IEC 9001 §10.2 classification.** Additionally emit:

   `severity_p` — one of:
   - **P0** — stop-the-line: production outage, data loss, security
     breach, blocker for every user.
   - **P1** — high: major feature broken for most users, no safe
     workaround, customer-visible regression.
   - **P2** — medium: a single flow is degraded, there is a
     workaround, or the issue affects a subset of users. Default when
     severity is unclear.
   - **P3** — low: cosmetic, minor polish, niche edge case, internal
     tooling only.

   `root_cause_category` — exactly one of the four ISO categories.
   These are the canonical definitions from the quality guide; use
   them literally:
   - **context_gap** — information the agent didn't have. A context
     field was missing, incomplete, or never captured. Fixing the
     context package would have prevented the bug.
   - **prompt_deficiency** — the prompt missed a constraint. The
     agent had the information but the skill prompt failed to steer
     it (missing rule, ambiguous instruction, weak example). Fixing
     the prompt would have prevented the bug.
   - **model_ceiling** — model capability limit. The context was
     complete and the prompt was correct, but the underlying model
     could not solve the problem at the required quality bar. This
     is a candidate for a ceiling-check or fine-tune.
   - **process_failure** — pipeline / workflow broke. A stage
     misfired, a dependency wasn't registered, a merge conflict was
     resolved wrongly, a migration was skipped. The agent's outputs
     were fine but the process around them was not. Default when the
     evidence is thin.

   Map between legacy and ISO (not a strict equivalence — use
   judgement):
   - legacy `requirements` usually → `context_gap` (but prompt
     deficiency is possible if the context was present yet the
     skill ignored it).
   - legacy `process` / `environment` usually → `process_failure`.
   - legacy `unknown` → pick the most likely ISO category;
     `process_failure` is a safe default.

   `reason` — one or two sentences of plain British English
   justifying the `severity_p` and `root_cause_category` choice.
   This lands in `Bug.ai_classification_reason` and is read by
   humans auditing the triage agent.

## Output contract

Return a single JSON object that validates against `output_schema`.
No markdown, no fences, no commentary outside the JSON.
