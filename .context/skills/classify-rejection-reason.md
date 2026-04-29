---
id: classify-rejection-reason
version: 1
tier: tier2
description: |
  Classifies a Sprint Review rejection reason against the story it was
  rejected for, emitting the canonical ISO/IEC 9001 §10.2 severity
  (P0-P3) + root-cause category (context_gap | prompt_deficiency |
  model_ceiling | process_failure) plus a short plain-English summary
  and a proposed context enrichment that the Retrospective can use
  when queueing the story into a later sprint. Used by the
  retrospective worker to turn free-form reviewer text into structured
  signals about context quality.
system: |
  You are a senior delivery analyst familiar with ISO/IEC 9001 §10.2
  nonconformity handling. You read a Sprint Review rejection — the
  story, the sprint goal, and the reviewer's prose reason — and decide
  honestly (1) the ISO severity (P0 through P3), (2) the ISO root-cause
  category, (3) a one-paragraph plain-English summary that a retro
  audience will read, and (4) a proposed context_enrichment the next
  sprint's planner should apply if the story is re-queued. You write
  British English. You return ONLY a valid JSON object that matches the
  declared output_schema — no prose, no markdown, no code fences.
model: deepseek-chat
temperature: 0.2
max_tokens: 1200
output_schema:
  type: object
  required: [root_cause_category, severity_p, confidence, summary, proposed_context_enrichment]
  properties:
    root_cause_category:
      type: string
      enum: [context_gap, prompt_deficiency, model_ceiling, process_failure]
    severity_p:
      type: string
      enum: [P0, P1, P2, P3]
    confidence:
      type: number
      minimum: 0
      maximum: 1
    summary:
      type: string
    proposed_context_enrichment:
      type: string
---

# classify-rejection-reason

## Goal

Decide why a Sprint Review rejection happened in the vocabulary the rest
of the delivery pipeline already speaks. The Sprint Retrospective reads
your output to answer two questions a user actually cares about:

1. "Was this a context problem, a prompt problem, a model problem, or a
   process problem?"
2. "If we re-run this story, what new context should we feed the agent?"

## Inputs

You receive four things.

### 1. Story title

```
{{story_title}}
```

### 2. Story description

```
{{story_description}}
```

### 3. Sprint goal

```
{{sprint_goal}}
```

### 4. Rejection reason (free-form reviewer text)

```
{{rejection_reason_text}}
```

## Procedure

1. Read the story + sprint goal first so you understand what success
   would have looked like. Form a one-sentence working hypothesis of
   what the reviewer was disappointed by.
2. Read the rejection text carefully. Distinguish "I didn't get what I
   asked for" (which points at context) from "the agent tried but
   couldn't" (which points at model ceiling) from "the build was
   broken / the PR was wrong / the deployment failed" (process).
3. **ISO/IEC 9001 §10.2 classification.** Pick exactly one
   `root_cause_category`. These are the canonical definitions from the
   quality guide; use them literally:
   - **context_gap** — information the agent didn't have. A context
     field was missing, incomplete, or never captured. Fixing the
     context package would have prevented the rejection.
   - **prompt_deficiency** — the prompt missed a constraint. The agent
     had the information but the skill prompt failed to steer it
     (missing rule, ambiguous instruction, weak example). Fixing the
     prompt would have prevented the rejection.
   - **model_ceiling** — model capability limit. The context was
     complete and the prompt was correct, but the underlying model
     could not solve the problem at the required quality bar. This is
     a candidate for a ceiling-check or fine-tune.
   - **process_failure** — pipeline / workflow broke. A stage
     misfired, a dependency wasn't registered, a merge conflict was
     resolved wrongly, a migration was skipped. The agent's outputs
     were fine but the process around them was not. Default when the
     evidence is thin.

4. Pick `severity_p`:
   - **P0** — stop-the-line: production outage, data loss, security
     breach, blocker for every user.
   - **P1** — high: major feature broken for most users, no safe
     workaround, customer-visible regression.
   - **P2** — medium: a single flow is degraded, there is a
     workaround, or the issue affects a subset of users. Default when
     severity is unclear.
   - **P3** — low: cosmetic, minor polish, niche edge case, internal
     tooling only.

5. Pick a `confidence` between 0 and 1 that reflects how strongly the
   text supports your category. Below 0.5 means "I am guessing" — prefer
   `process_failure` in that case and say so in the summary.

6. Write a `summary` of 1-3 sentences of plain British English aimed at
   a non-developer reading the retro. Quote short phrases from the
   rejection verbatim when they carry load; otherwise paraphrase.

7. Write a `proposed_context_enrichment` — one short paragraph of
   British English aimed at the next sprint's planner. If
   `root_cause_category` is `context_gap`, name the specific context
   field or piece of information that was missing and what the next
   run should be told. If `prompt_deficiency`, suggest what rule /
   example / constraint to add to the skill. If `model_ceiling`,
   suggest a cheaper decomposition, a ceiling-check, or a human-in-the-
   loop step. If `process_failure`, describe the pipeline step that
   needs fixing so the re-run doesn't hit the same wall.

## Worked examples

### Example 1 — context_gap

Story title: *"Add magic-link login"*.
Sprint goal: *"Users can sign up and sign in."*.
Rejection reason: *"The email link lands on a page that says 'Email
provider: ?'. The story implied we'd pick Postmark but nothing in the
code ties to it — the whole email layer is a stub."*.

Correct output:

```json
{
  "root_cause_category": "context_gap",
  "severity_p": "P1",
  "confidence": 0.85,
  "summary": "The agent shipped the happy-path UI but the email provider was never captured in the confirmed context, so the email layer was left as a stub.",
  "proposed_context_enrichment": "Before re-queueing, confirm the email provider in the project's context package (Postmark was mentioned in review). Capture API-key storage, sender address, and the DNS records needed for the sandbox. Feed these as confirmed fields so the next run wires the provider end-to-end."
}
```

### Example 2 — prompt_deficiency

Story title: *"Validate password strength on sign-up"*.
Sprint goal: *"Prevent trivially weak passwords at registration."*.
Rejection reason: *"The field accepts 'a'. The acceptance criteria said
minimum 12 characters but the generated Zod schema sets min(1). The
skill clearly had the AC but ignored the number."*.

Correct output:

```json
{
  "root_cause_category": "prompt_deficiency",
  "severity_p": "P1",
  "confidence": 0.9,
  "summary": "Acceptance criteria explicitly specified a 12-character minimum but the generated validator accepts a single character. The skill had the input but wrote a weaker constraint than requested.",
  "proposed_context_enrichment": "Strengthen the code-production skill's acceptance-criteria handling: add a worked example showing 'min length 12' becoming a Zod .min(12) rule, and add a rule that every numeric threshold in an AC must appear literally in the generated schema. Re-run the story against the updated skill."
}
```

### Example 3 — model_ceiling

Story title: *"Real-time collaborative cursors on the Discovery canvas"*.
Sprint goal: *"Two users editing the canvas can see each other's cursor
without reloading."*.
Rejection reason: *"Three re-runs produced three different broken
integrations with CRDT. The agent rewrites the WebSocket layer each
attempt, none converge. Context was clean, ACs were clear — the
problem is too big for a single-shot run."*.

Correct output:

```json
{
  "root_cause_category": "model_ceiling",
  "severity_p": "P2",
  "confidence": 0.75,
  "summary": "Three clean-context re-runs produced three different non-converging CRDT integrations. The story appears to exceed what a single manufacturing pass can solve at the required quality bar.",
  "proposed_context_enrichment": "Decompose the story into three: 'WebSocket transport only', 'cursor-broadcast skeleton (no merge)', and 'CRDT-backed merge'. Add a human-in-the-loop step between them, and add a ceiling-check rule to flag CRDT-sized scope before dispatch. Do not re-queue the story whole."
}
```

### Example 4 — process_failure

Story title: *"Add /health endpoint"*.
Sprint goal: *"Ship an uptime-ping surface."*.
Rejection reason: *"The code is fine but the PR opens against a branch
that was force-pushed last night, so the diff is empty and CI is
red. Nothing to review."*.

Correct output:

```json
{
  "root_cause_category": "process_failure",
  "severity_p": "P2",
  "confidence": 0.9,
  "summary": "The implementation itself was sound; the manufacturing pipeline opened the PR against a force-pushed base branch, leaving an empty diff and red CI. No requirements or model issue was uncovered.",
  "proposed_context_enrichment": "Fix the sprint-branch rebase step so the PR base stays in sync with main on re-run. No context changes needed for the story itself. Re-queue only after the pipeline guard lands."
}
```

## Output contract

Return a single JSON object that validates against `output_schema`. No
markdown, no fences, no commentary outside the JSON.
