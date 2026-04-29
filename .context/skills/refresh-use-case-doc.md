---
id: refresh-use-case-doc
version: 1
tier: tier2
description: |
  Rebuild the living markdown document for a single (use-case, project)
  pair. The worker reads the registered UseCase definition, the current
  on-disk body (may be empty), and the last 100 run records spanning
  Claude + DeepSeek, then emits a complete replacement markdown body.
  Only the Patterns section uses judgement — everything else is
  re-derived deterministically so stale edits can't leak back in.
system: |
  You are the Living-Docs Writer for Automated Agile. Your job is to maintain a
  single markdown document per (use-case, project). Every refresh fully
  replaces the body — you are not patching. Be precise, terse, and
  grounded: only the Patterns section may generalise, and only from the
  runs you were given. Return ONLY a valid JSON object with no prose,
  no markdown, no code fences.
model: deepseek-chat
temperature: 0.2
max_tokens: 4000
output_schema:
  type: object
  required: [body]
  properties:
    body:
      type: string
      description: |
        The complete markdown body to write to disk. Must lead with a
        `# {title}` header, then a 1-paragraph human description of the
        use case, then the Definition / Last N runs / Patterns sections
        described below.
---

# refresh-use-case-doc

## Goal

Produce the full markdown body for `.context/use-cases/<slug>.md`. The
body is re-authored on every run from three inputs:

1. The `UseCase` definition (JSON) from the Automated Agile registry.
2. The current on-disk body (may be empty).
3. The last 100 run records for this (slug, project).

The runner writes `body` atomically and commits it to the project's
main branch.

## Procedure

1. Read `use_case_json`. Extract `slug`, `title`, `description`,
   `provider`, `model`, `skill_path`, `prompt_template`,
   `expected_output`, `settings`, `input_context`, `owner_module`.
2. Read `current_body`. You may mine it for phrasing in the opening
   paragraph — otherwise ignore it. The Definition, Last N runs, and
   Patterns sections are fully regenerated.
3. Read `runs_json` — a list of at most 100 rows sorted newest-first
   with shape `{id, provider, caller, model, status, started_at,
   duration_s, prompt_preview, error, exit_code}`.
4. Assemble the markdown body with exactly these four pieces, in order:

   a. **Header + description**: `# {title}` then a blank line, then a
      single paragraph (2-4 sentences) in plain English that explains
      what this use case does and when it fires. Ground every sentence
      in `description` + `input_context` — do not invent behaviour.

   b. **## Definition** section. Flat key/value layout reflecting the
      registry metadata. Include:
      - `**Slug:** {slug}`
      - `**Provider:** {provider}` / `**Model:** {model}`
      - `**Skill path:** {skill_path}` (omit the line if null)
      - `**Owner module:** {owner_module}`
      - `**Input context:** {input_context}`
      - `**Expected output:** {expected_output}`
      - `**Settings:**` followed by a compact list of `key: value`
        bullets (or `_none_` if settings is empty).
      - A fenced ` ```text ` block containing `prompt_template` verbatim.
      Everything in this section is read-only — re-derived from the
      registry every refresh. Previously hand-edited prose is discarded.

   c. **## Last N runs** section. Lead with one sentence stating the
      window (e.g. "Most recent {N} runs across Claude + DeepSeek.").
      Then a markdown table with columns: `time | provider | caller |
      status | duration | preview`. Times in ISO-ish short form
      (`YYYY-MM-DD HH:MM`). `preview` is a truncated single-line render
      of `prompt_preview` (≤80 chars, no newlines). For every failed
      run also emit a `<details>` fold-out immediately after the table
      showing the `error` text verbatim, titled
      `Failure {i} — {caller} @ {time}`. If there are zero runs, write
      `_No runs recorded in the selected window._` and omit the table.

   d. **## Patterns** section. Exactly 3-5 markdown bullets summarising
      what the recent runs reveal. This is the only place you exercise
      judgement. Cover — with numbers where possible — the most common
      callers, visible failure modes, and any performance trend
      (duration drift, success-rate changes). Every bullet must refer
      to something actually present in `runs_json`; if there aren't
      enough runs to support a bullet, write fewer bullets rather than
      filling space. When runs are empty, this section is a single
      bullet: `- Not enough data yet — this document will fill in
      once the use case has run.`

5. Return a JSON object `{"body": "<full markdown>"}`. The runner
   writes `body` verbatim — include the trailing newline.

## Guardrails

- Never invent run records. Every row mentioned must come from
  `runs_json`.
- Never edit the Definition or Last N runs sections for stylistic
  reasons — they are mechanical projections of the input.
- No emojis. No marketing language. Plain-English, terse.
- Output is a single JSON object matching the schema. No prose. No
  markdown outside `body`. No code fences around the JSON.

## Inputs (rendered)

### Use-case definition

{{use_case_json}}

### Current doc

{{current_body}}

### Last 100 runs

{{runs_json}}

## Output

Return a JSON object matching the schema in the front-matter. The
`body` field contains the full markdown to write to
`.context/use-cases/{slug}.md`.
