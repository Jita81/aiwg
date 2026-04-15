---
dataset_version: "{{DATASET_VERSION}}"
generated_at: "{{TIMESTAMP}}"
mode: "{{MODE}}"
ngram_size: {{NGRAM_SIZE}}
targets_checked: {{TARGET_COUNT}}
overall_passed: {{OVERALL_PASSED}}
---

# Decontamination Report — {{DATASET_VERSION}}

Generated: `{{TIMESTAMP}}` · Mode: `{{MODE}}` · Targets: {{TARGET_COUNT}}

## Summary

| Target | Examples Scanned | Overlap Count | Threshold | Passed |
|---|---:|---:|---:|:---:|
{{#each targets}}
| {{id}} | {{examples_scanned}} | {{overlap_count}} | {{threshold}} | {{#if passed}}PASS{{else}}FAIL{{/if}} |
{{/each}}

**Overall gate result**: {{#if overall_passed}}PASS{{else}}FAIL — publication blocked by decontamination-gate (#843){{/if}}

## Per-Target Detail

{{#each targets}}
### {{id}} — {{name}}

- **Source**: {{source}}
- **Eval set**: `{{eval_set_path}}`
- **Mode(s) run**: {{detection_modes}}
- **N-gram size**: {{ngram_size}}
- **Overlap count**: {{overlap_count}} / threshold {{threshold}}
- **Result**: {{#if passed}}PASS{{else}}FAIL{{/if}}

{{#if overlap_count}}
**Top-10 overlap samples** (example_id → matched target item):

| # | Example ID | Target Item | Excerpt |
|---|---|---|---|
{{#each top_overlaps}}
| {{index}} | `{{example_id}}` | `{{target_item_id}}` | `{{excerpt}}` |
{{/each}}
{{else}}
_No overlap detected._
{{/if}}

{{/each}}

## Recommendation

{{#if overall_passed}}
All targets passed. Dataset `{{DATASET_VERSION}}` is clear to proceed to `dataset-version` publication.
{{else}}
Contamination detected. Required next steps:

1. Review overlap samples above to confirm true overlap vs. false positive.
2. Remove or regenerate contaminated examples (obtain human authorization per `human-authorization` rule).
3. Re-run `decontamination-check {{DATASET_VERSION}}` and verify PASS.
4. Do not bypass the decontamination-gate lint rule (#843).
{{/if}}

## Reproducibility

- **Mode**: `{{MODE}}`
- **N-gram size**: {{NGRAM_SIZE}}
- **Normalization**: {{NORMALIZATION}}
- **Semantic model** (if applicable): `{{EMBEDDING_MODEL}}`
- **Semantic threshold** (if applicable): {{COSINE_THRESHOLD}}
- **Random seed** (if applicable): {{RANDOM_SEED}}
- **Targets config hash**: `{{TARGETS_CONFIG_HASH}}`
- **Dataset manifest hash**: `{{DATASET_MANIFEST_HASH}}`

---

_Gate enforcement: decontamination-gate lint rule (#843) reads the `decontamination-check` event from `.aiwg/activity.log` and blocks `dataset-version` on FAIL._
