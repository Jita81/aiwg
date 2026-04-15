# Model Card: {{model_name}}

> Per Mitchell et al. 2019 (REF-452) — "Model Cards for Model Reporting". 9 sections.
> This template documents the **downstream model** trained on dataset `{{dataset_name}}` ({{version}}).
> The Training Data section auto-populates from the dataset manifest; most other sections require
> human-fill input from the model developer.

- **Associated dataset:** {{dataset_name}} (version {{version}})
- **Manifest:** {{manifest_path}}
- **Generated:** {{generated_timestamp}}

---

## 1. Model Details

- **Developed by:** <!-- HUMAN FILL: person(s) or organization -->
- **Model date:** <!-- HUMAN FILL: training completion date -->
- **Model version:** <!-- HUMAN FILL: semver / release tag -->
- **Model type:** <!-- HUMAN FILL: architecture family (e.g., transformer decoder, CNN, GBDT) -->
- **Training algorithm and parameters:** <!-- HUMAN FILL: optimizer, LR schedule, compute budget -->
- **Paper/resource references:** <!-- HUMAN FILL: arXiv, GitHub, website -->
- **Citation:** <!-- HUMAN FILL: BibTeX or APA citation -->
- **License:** <!-- HUMAN FILL: model weights license (may differ from dataset license {{license_id}}) -->
- **Contact:** <!-- HUMAN FILL: maintainer email / issue tracker -->

---

## 2. Intended Use

- **Primary intended uses:** <!-- HUMAN FILL: specific tasks the model was designed for -->
- **Primary intended users:** <!-- HUMAN FILL: researchers, developers, end-users -->
- **Out-of-scope use cases:** <!-- HUMAN FILL: explicit uses the model should NOT be applied to -->

---

## 3. Factors

- **Relevant factors:** <!-- HUMAN FILL: demographic, environmental, instrumentation factors -->
- **Evaluation factors:** <!-- HUMAN FILL: which factors are evaluated; justification for omissions -->

---

## 4. Metrics

- **Model performance measures:** <!-- HUMAN FILL: chosen metrics and rationale -->
- **Decision thresholds:** <!-- HUMAN FILL: classification thresholds, confidence cutoffs -->
- **Variation approaches:** <!-- HUMAN FILL: how variation in metrics is estimated (bootstrap, CI, etc.) -->

---

## 5. Evaluation Data

- **Datasets used:** <!-- HUMAN FILL: evaluation corpora (may differ from training set) -->
- **Motivation:** <!-- HUMAN FILL: why these eval sets -->
- **Preprocessing:** <!-- HUMAN FILL: eval-time transforms -->

---

## 6. Training Data

*This section is auto-populated from the AIWG dataset manifest. Refer to the full Datasheet for detailed provenance.*

- **Dataset:** {{dataset_name}}
- **Version:** {{version}}
- **Instance count:** {{instance_count}}
- **Modality:** {{modality}}
- **Splits:** train={{split_train_count}}, validation={{split_val_count}}, test={{split_test_count}}
- **Collection window:** {{collection_start_date}} to {{collection_end_date}}
- **Sources:** {{source_urls}}
- **License:** {{license_id}} ({{license_url}})
- **Sub-populations:** {{subpopulations}}
- **Known biases / gaps:** {{known_errors}}
- **PII status:** {{identifiability_risk}}
- **Decontamination:** {{decontamination_report_path}}
- **Related documents:**
  - Datasheet: {{datasheet_path}}
  - Data Statement: {{data_statement_path}}
  - Provenance (W3C PROV): {{provenance_record_path}}

<!-- HUMAN FILL: Note any training-time subsetting, weighting, or augmentation applied beyond what the manifest records. -->

---

## 7. Quantitative Analyses

- **Unitary results:** <!-- HUMAN FILL: performance per single factor (e.g., accuracy by age bucket) -->
- **Intersectional results:** <!-- HUMAN FILL: performance across combinations of factors (e.g., age x gender) -->

---

## 8. Ethical Considerations

- **Data subject consent:** {{consent_mechanism}} — see Datasheet §3.9
- **Safety-critical applications:** <!-- HUMAN FILL: is the model deployed in safety-critical contexts? -->
- **Privacy:** <!-- HUMAN FILL: re-identification risk, inference attacks, memorization -->
- **Discrimination / fairness concerns:** <!-- HUMAN FILL: known disparate performance -->
- **Mitigation strategies:** <!-- HUMAN FILL: filtering, reweighting, calibration, guardrails -->

---

## 9. Caveats and Recommendations

- **Known unknowns:** <!-- HUMAN FILL: gaps in evaluation or data coverage -->
- **Ideal supplementary evaluation:** <!-- HUMAN FILL: recommended additional testing before deployment -->
- **Recommended use patterns:** <!-- HUMAN FILL: guardrails, human-in-the-loop, monitoring -->

---

## References

- REF-452: Mitchell, M. et al. (2019). *Model Cards for Model Reporting*. FAT* 2019.
- REF-451: Gebru, T. et al. (2021). *Datasheets for Datasets* (Datasheet for training data).
- ADR-022 D9: Dataset Documentation Decision
- Training data manifest: {{manifest_path}}
