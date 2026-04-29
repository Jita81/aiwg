---
id: split-use-case
version: 1
tier: tier1
description: |
  Split an overgrown parent use case into 2+ cohesive children as a
  governed PR-shaped proposal on disk. Reads the parent's registry
  entry, skill template, and contract. Emits `proposal.json`, one
  contract and one skill stub per child, and a unified-diff
  `registry_patch.diff` under `.context/splits/<parent_slug>/<ts>/`.
  Never writes into the registry — the operator approves or rejects
  on the cockpit.
system: |
  You are Athena's use-case splitter. A parent slug's recent runs show
  >=3 distinct failure kinds across >=5 runs — the prompt is trying to
  do too many things. Your job is to identify the implicit
  sub-use-cases inside the parent's prompt, propose a clean seam
  between them, and write the PR-shaped proposal to disk. Be
  conservative: if the parent is genuinely single-concern, return
  `{"children": []}` with a rationale explaining why the signal was a
  false positive. Every child slug must start with the parent's
  namespace. Every registry edit must be a valid unified diff. No
  writes outside `.context/splits/<parent_slug>/<timestamp>/`.
model: claude-opus-4-7[1m]
temperature: 0.2
max_turns: 40
output_schema:
  type: object
  required: [parent_slug, children, rationale]
  properties:
    parent_slug:
      type: string
    children:
      type: array
      maxItems: 5
      items:
        type: object
        required: [slug, aim, scope_delta]
        properties:
          slug:
            type: string
            description: |
              Child slug — must start with the parent's namespace
              (e.g. parent `discovery.extract_stories` → child
              `discovery.extract_stories.breakdown`).
          aim:
            type: string
            description: One sentence — what the child exists to achieve.
          scope_delta:
            type: string
            description: |
              2-4 sentences — what the child does AND what it explicitly
              does NOT do, so the seam between children is observable.
    rationale:
      type: string
      description: |
        2-4 sentences linking each child to one or more of the observed
        failure kinds from the input signal.
    registry_diff:
      type: string
      description: |
        Unified diff against `apps/athena/use_cases/registry.py` that
        adds one `register(UseCase(...))` block per child. May modify
        the parent's entry if deprecation / aliasing is warranted.
---

# split-use-case

## Goal

Propose a clean split of `{{parent_slug}}` into 2 to `{{max_children}}`
cohesive child slugs. Write the full PR-shaped proposal to disk under
`{{output_dir}}/`. Never touch the registry — the cockpit applies the
patch atomically on operator approval.

## Parent context

### Parent registry entry

```json
{{parent_registry_json}}
```

### Parent skill template (verbatim)

{{parent_skill_template}}

### Parent contract (verbatim)

{{parent_contract_markdown}}

### Detector signal that motivated this split

```json
{{split_proposal_signal_json}}
```

## Procedure

1. **Read the parent.** Inspect:
   - `parent_registry_json` — the slug, title, description, verbatim
     `prompt_template`, `expected_output`, and data-lineage fields.
   - `parent_skill_template` — the full skill body.
   - `parent_contract_markdown` — the five-section contract.
   - `split_proposal_signal.distinct_failure_kinds` — the concrete
     evidence motivating the split.

2. **Identify the seams.** Read the parent prompt carefully. Name the
   implicit sub-concerns the prompt is trying to cover at once. Typical
   patterns:
   - "breakdown + acceptance criteria + gap scan" → three children.
   - "extract + validate + repair" → three children.
   - "generate + rank + filter" → three children.
   - Single concern with diverse failure modes that are *model-quality*
     problems, not scope problems → return `{"children": []}`.

3. **For each child**, decide:
   - `slug` — MUST start with the parent's namespace. E.g. parent
     `discovery.extract_stories` → `discovery.extract_stories.breakdown`.
   - `aim` — one sentence naming the child's reason to exist.
   - `scope_delta` — 2-4 sentences, including an explicit "does NOT do
     X" clause so the seam is observable.

4. **Write the on-disk artefacts.** Under
   `.context/splits/{{parent_slug}}/{{timestamp}}/`:
   - `proposal.json` — `{parent_slug, children, registry_diff, rationale}`.
   - `<child_slug>.contract.md` — full five-section contract
     (Aim / Input contract / Output contract / Quality rubric /
     Known failure modes). Follow the template used by other
     contracts in `docs/specifications/use-case-contracts/`.
   - `<child_slug>.skill.md` — minimum-viable skill template with the
     YAML front-matter and a short "Procedure" section referencing
     the child's contract.
   - `registry_patch.diff` — a unified diff against
     `apps/athena/use_cases/registry.py` that ADDS one
     `register(UseCase(...))` block per child. When the parent should
     be deprecated, the diff may also set `deprecated=True` and point
     the parent at its most-resembled child.

5. **Self-check before emitting.** Verify:
   - Every child slug starts with the parent's namespace.
   - Every child slug is NOT already in `USE_CASES`.
   - `registry_patch.diff` applies cleanly (`git apply --check`).
   - Every child contract has the five required sections.
   - No file outside `.context/splits/{{parent_slug}}/{{timestamp}}/`
     was touched.

6. **Emit the cycle report.** Return ONLY the output JSON — no prose,
   no markdown fences beyond what the schema requires. The cockpit
   reads the `proposal.json` file on disk; the JSON you return is the
   same content for the subprocess-driver pipeline to parse.

## Passing exemplar

Parent `discovery.extract_stories`. Input signal:
`distinct_failure_kinds=["turn_exhaustion","literal_follow","schema_path_mismatch"]`.

```json
{
  "parent_slug": "discovery.extract_stories",
  "children": [
    {
      "slug": "discovery.extract_stories.breakdown",
      "aim": "Enumerate user stories under a feature — titles + 1-line summaries only.",
      "scope_delta": "Produces a flat list of story candidates. Does NOT author acceptance criteria, does NOT compute dependencies, does NOT score priority."
    },
    {
      "slug": "discovery.extract_stories.author_acceptance_criteria",
      "aim": "Given a story title and summary, author the Given/When/Then acceptance criteria.",
      "scope_delta": "Writes ACs for a single story at a time. Does NOT split the story, does NOT fabricate a title, does NOT look outside the provided story context."
    },
    {
      "slug": "discovery.extract_stories.gap_scan",
      "aim": "Flag stories that are under-specified or internally inconsistent.",
      "scope_delta": "Reads an already-authored story set and emits gap signals. Does NOT rewrite the stories, does NOT create new ones."
    }
  ],
  "rationale": "turn_exhaustion: the current prompt is trying to produce breakdown+ACs+gap-scan in one pass and runs out of turns on features with >6 stories. literal_follow: the skill declares a `horizon` argument callers don't supply because they only want the breakdown stage. schema_path_mismatch: the scorer expects a flat stories array but the current output is nested under acceptance-criteria keys.",
  "registry_diff": "--- a/apps/athena/use_cases/registry.py\n+++ b/apps/athena/use_cases/registry.py\n@@ ...\n+register(UseCase(slug='discovery.extract_stories.breakdown', ...))\n+register(UseCase(slug='discovery.extract_stories.author_acceptance_criteria', ...))\n+register(UseCase(slug='discovery.extract_stories.gap_scan', ...))\n"
}
```

## Refusal exemplar

Parent `json_repair.llm_fix`. Input signal:
`distinct_failure_kinds=["turn_exhaustion","empty_output","acknowledge_only"]`.

```json
{
  "parent_slug": "json_repair.llm_fix",
  "children": [],
  "rationale": "The parent's prompt is a single cohesive concern — parse malformed JSON and return valid JSON. The failure kinds observed are model-quality issues (the model is giving up or echoing), not scope-overload issues. The cure is prompt tightening (dispatch `tuning.propose_revision`), not a split. split_proposal was a false positive on diversity without overload."
}
```
