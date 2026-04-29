# Skill: Discovery — Author per-feature TestingContract

> Run after `discovery.extract_stories` lands. Reads one Feature + its
> in-scope Stories and emits one TestingContract describing how the
> feature will be tested. The projector consumes the contract for
> VAL-001 (weight 1.1) and VAL-002 (weight 1.3); without it every
> story surfaces "No TestingContract supplied" as a perpetually-
> degrading gap.

This is the planning-side fix for ListenHearGovern pilot gap #6: the
TestingContract has been a per-feature artefact in the schema since
S-07 but no extraction step authored one. Every sprint then dragged a
"VAL-001 / VAL-002 will not match" message into the gap report on
every story until an operator hand-wrote scenarios.

---

## 0. HARD RULE — execute, do not summarise

**Begin authoring immediately.** Reading the feature, summarising what
you see, and "confirming you are ready" is NOT the task. Output the
JSON straight away.

---

## 1. Inputs

The orchestrator passes you a single payload:

```json
{
  "feature": { /* Feature object — id, name, user_story, acceptance_criteria, … */ },
  "stories": [ /* in-scope Story objects */ ],
  "inception_excerpt": "<200-word excerpt of the inception that anchors this feature>",
  "existing_contract": null
}
```

`existing_contract` may carry a partial TestingContract from a prior run; treat
it as a seed, do NOT overwrite a populated contract unless the operator
explicitly asked for a re-author.

## 2. Output

Emit a single JSON object on stdout — no prose, no markdown. Shape:

```json
{
  "feature_id": "<feature.id>",
  "scenarios": [
    {
      "scenario_name": "<short imperative>",
      "given": "<context / preconditions>",
      "when": "<the behaviour under test>",
      "then": "<observable outcome>",
      "linked_story_ids": ["<story.id>", ...],
      "expected_outcome": "<precise post-condition the test asserts>",
      "mock_requirements": ["<external system to fake>", ...]
    },
    ...
  ],
  "nfrs": {
    "response_time_ms": null,
    "availability_target": null,
    "security_requirements": [],
    "load_target": null
  },
  "dependency_failure_modes": [
    {"dependency_name": "<system>", "failure_behaviour": "<what we do>"}
  ],
  "edge_cases_in_scope": ["<edge case>", ...],
  "edge_cases_out_scope": ["<deferred edge case + why>"],
  "test_types": {
    "unit": true,
    "integration": true,
    "e2e": false,
    "load": false
  },
  "coverage_target": 80
}
```

## 3. Authoring guidelines

* **One scenario per story acceptance criterion** is a reasonable
  lower bound. Two-to-three scenarios per story is typical.
* **Every scenario MUST link back to at least one story** via
  `linked_story_ids`. The projector won't blow up if it doesn't, but
  the trace becomes opaque.
* **`expected_outcome` is the assertion the test runs.** Not the
  same as `then`. `then` is human-readable; `expected_outcome` is the
  shape of what the test code asserts (e.g. `"HTTP 422 with body
  {\"error\": \"invalid_signature\"}"`).
* **`mock_requirements` lists external systems to fake.** Empty list
  is valid for pure-logic features.
* **Default `coverage_target = 80`** unless the feature description
  says otherwise (security-critical: 95; experimental: 50).
* **Default `test_types = {unit: true, integration: true, e2e: false, load: false}`**.
  Flip `e2e` on for any feature that touches the UI; flip `load`
  on for any feature flagged as customer-facing or high-traffic.
* **`nfrs` are nullable.** Leave fields `null` rather than guessing —
  a guessed NFR is worse than no NFR (the SLA-tracker uses these
  values directly).
* **`edge_cases_out_scope` must explain why.** "Deferred to MMP" or
  "out of inception scope" or "feature flag disabled by default".

## 4. Hard rules

1. ONE JSON object on stdout. No prefix prose. No commit (the caller
   persists the row directly via the DB session).
2. Cover every in-scope story at least once via `scenarios[].linked_story_ids`.
3. If you cannot author a contract because the feature has no stories
   yet, emit `{"feature_id": "<id>", "scenarios": [], "_gap":
   "no stories in scope"}` so the caller logs the gap and skips
   persistence.
4. Stay inside `.context/` if writing artefacts (this skill normally
   does NOT — the caller persists directly).
