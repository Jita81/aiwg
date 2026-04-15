# Datasheet for Dataset: {{dataset_name}}

> Per Gebru et al. 2021 (REF-451) — "Datasheets for Datasets". 57 questions across 7 sections.
> Auto-populated fields use `{{field_name}}` placeholders keyed to `dataset-manifest.yaml`.
> Fields marked `<!-- HUMAN FILL -->` require human subject-matter expert input.

- **Dataset version:** {{version}}
- **Manifest:** {{manifest_path}}
- **Generated:** {{generated_timestamp}}
- **Generator:** `skills/dataset-docs` (training-complete framework)

---

## 1. Motivation

### 1.1 For what purpose was the dataset created?

<!-- HUMAN FILL: Describe the specific task(s), research question(s), or gap this dataset fills. -->

### 1.2 Who created this dataset (team, research group, company) and on behalf of which entity?

- **Creators:** {{creators}}
- **Organization:** {{organization}}

### 1.3 Who funded the creation of the dataset?

- **Funding sources:** {{funding_sources}}
<!-- HUMAN FILL: Include grant numbers, sponsors, or note if self-funded. -->

### 1.4 Any other comments?

<!-- HUMAN FILL: Optional context about motivation. -->

### 1.5 What intended tasks does this dataset support?

- **Intended tasks:** {{intended_tasks}}

### 1.6 What tasks has this dataset been used for to date?

<!-- HUMAN FILL: List prior publications, models, or benchmarks trained on this data. -->

### 1.7 Are there tasks for which the dataset should not be used?

<!-- HUMAN FILL: Explicit out-of-scope uses (e.g., surveillance, credit scoring, safety-critical decisions). -->

---

## 2. Composition

### 2.1 What do the instances that comprise the dataset represent?

- **Instance type:** {{instance_type}}
- **Modality:** {{modality}}

### 2.2 How many instances are there in total (of each type, if appropriate)?

- **Total instances:** {{instance_count}}
- **By split:** train={{split_train_count}}, validation={{split_val_count}}, test={{split_test_count}}

### 2.3 Does the dataset contain all possible instances or is it a sample?

- **Sampling strategy:** {{sampling_strategy}}
<!-- HUMAN FILL: If a sample, describe how representative it is of the larger population. -->

### 2.4 What data does each instance consist of?

- **Features/fields:** {{features}}
- **Schema:** {{schema_path}}

### 2.5 Is there a label or target associated with each instance?

- **Labels:** {{label_fields}}
- **Label source:** {{label_source}}

### 2.6 Is any information missing from individual instances?

- **Missingness rate:** {{missingness_rate}}
<!-- HUMAN FILL: Explain why information is missing and any imputation performed. -->

### 2.7 Are relationships between individual instances made explicit?

<!-- HUMAN FILL: Describe any links, ratings, social network structure, or sequencing. -->

### 2.8 Are there recommended data splits?

- **Splits:** {{splits}}
- **Split rationale:** {{split_rationale}}

### 2.9 Are there any errors, sources of noise, or redundancies in the dataset?

- **Known errors:** {{known_errors}}
- **Decontamination report:** {{decontamination_report_path}}

### 2.10 Is the dataset self-contained, or does it link to or depend on external resources?

- **External dependencies:** {{external_dependencies}}
- **Archival copy preserved:** {{external_archival_status}}

### 2.11 Does the dataset contain data that might be considered confidential?

- **Confidentiality flag:** {{contains_confidential}}
<!-- HUMAN FILL: Describe legal basis for inclusion if confidential. -->

### 2.12 Does the dataset contain data that, if viewed directly, might be offensive, insulting, threatening, or might otherwise cause anxiety?

- **Offensive content flag:** {{contains_offensive}}
<!-- HUMAN FILL: Describe filtering / warning labels applied. -->

### 2.13 Does the dataset identify any sub-populations (e.g., by age, gender)?

- **Sub-populations:** {{subpopulations}}
<!-- HUMAN FILL: Describe distribution across sub-populations. -->

### 2.14 Is it possible to identify individuals (i.e., one or more natural persons) from the dataset?

- **Identifiability:** {{identifiability_risk}}
- **PII scan results:** {{pii_scan_report_path}}

### 2.15 Does the dataset contain data that might be considered sensitive in any way?

<!-- HUMAN FILL: Sensitive categories: race, ethnicity, sexual orientation, religion, political opinions, health, biometrics, etc. -->

---

## 3. Collection Process

### 3.1 How was the data associated with each instance acquired?

- **Acquisition method:** {{acquisition_method}}
- **Source URLs/APIs:** {{source_urls}}

### 3.2 What mechanisms or procedures were used to collect the data?

- **Collection tools:** {{collection_tools}}
- **Validation:** {{collection_validation}}

### 3.3 If the dataset is a sample from a larger set, what was the sampling strategy?

- **Sampling strategy:** {{sampling_strategy}}
- **Sample size justification:** {{sample_size_justification}}

### 3.4 Who was involved in the data collection process and how were they compensated?

<!-- HUMAN FILL: Employees, contractors, crowdworkers, volunteers; compensation model. -->

### 3.5 Over what timeframe was the data collected?

- **Collection window:** {{collection_start_date}} to {{collection_end_date}}

### 3.6 Were any ethical review processes conducted?

- **IRB approval:** {{irb_approval_id}}
- **Ethics review body:** {{ethics_review_body}}
<!-- HUMAN FILL: Attach approval letter or note exemption rationale. -->

### 3.7 Did you collect the data from the individuals in question directly, or obtain it via third parties or other sources?

- **Data source type:** {{data_source_type}}
<!-- HUMAN FILL: If third-party, name source and describe licensing. -->

### 3.8 Were the individuals in question notified about the data collection?

- **Notification method:** {{notification_method}}
<!-- HUMAN FILL: Attach notification text or describe why notification was not feasible. -->

### 3.9 Did the individuals in question consent to the collection and use of their data?

- **Consent mechanism:** {{consent_mechanism}}
- **Consent records:** {{consent_records_path}}
<!-- HUMAN FILL: Describe withdrawal mechanism if applicable. -->

### 3.10 Has an analysis of the potential impact of the dataset and its use on data subjects been conducted?

<!-- HUMAN FILL: Describe DPIA, fairness audit, or harm assessment. -->

---

## 4. Preprocessing / Cleaning / Labeling

### 4.1 Was any preprocessing/cleaning/labeling of the data done?

- **Preprocessing performed:** {{preprocessing_performed}}
- **Pipeline:** {{preprocessing_pipeline_path}}

### 4.2 Was the "raw" data saved in addition to the preprocessed/cleaned/labeled data?

- **Raw data preserved:** {{raw_preserved}}
- **Raw data location:** {{raw_data_location}}

### 4.3 Is the software used to preprocess/clean/label the instances available?

- **Tools:** {{preprocessing_tools}}
- **Version/commit:** {{preprocessing_tool_version}}

### 4.4 Does preprocessing introduce any bias?

<!-- HUMAN FILL: Describe sampling, filtering, or transformation biases. -->

### 4.5 Who were the annotators?

- **Annotator pool:** {{annotator_pool}}
- **Annotator demographics:** {{annotator_demographics}}
<!-- HUMAN FILL: Expertise, training, inter-annotator agreement scores. -->

### 4.6 What instructions were given to annotators?

- **Instructions:** {{annotation_instructions_path}}
<!-- HUMAN FILL: Attach the annotation guide. -->

---

## 5. Uses

### 5.1 Has the dataset been used for any tasks already?

<!-- HUMAN FILL: List models trained, papers published, benchmarks reported. -->

### 5.2 Is there a repository that links to any or all papers or systems that use the dataset?

- **Repository:** {{usage_repository}}

### 5.3 What (other) tasks could the dataset be used for?

<!-- HUMAN FILL: Describe additional plausible uses. -->

### 5.4 Is there anything about the composition of the dataset or the way it was collected and preprocessed/cleaned/labeled that might impact future uses?

<!-- HUMAN FILL: Biases, representational gaps, label noise that downstream users must know. -->

### 5.5 Are there tasks for which the dataset should not be used?

- **Out-of-scope uses:** {{out_of_scope_uses}}

### 5.6 Legal or ethical limits on use?

- **License:** {{license_id}}
- **Legal constraints:** {{legal_constraints}}

---

## 6. Distribution

### 6.1 Will the dataset be distributed to third parties outside of the entity on behalf of which it was created?

- **Distribution:** {{distribution_model}}

### 6.2 How will the dataset be distributed?

- **Distribution channel:** {{distribution_channel}}
- **DOI:** {{doi}}

### 6.3 When will the dataset be distributed?

- **Release date:** {{release_date}}

### 6.4 Will the dataset be distributed under a copyright or other IP license, and/or under applicable terms of use?

- **License:** {{license_id}}
- **License URL:** {{license_url}}
- **Fee:** {{distribution_fee}}

### 6.5 Have any third parties imposed IP-based or other restrictions on the data associated with the instances?

<!-- HUMAN FILL: Describe upstream restrictions inherited from source data. -->

### 6.6 Do any export controls or other regulatory restrictions apply?

- **Export control classification:** {{export_control_class}}

### 6.7 Any other comments on distribution?

<!-- HUMAN FILL: Optional. -->

---

## 7. Maintenance

### 7.1 Who will be supporting/hosting/maintaining the dataset?

- **Curator:** {{curator}}
- **Host:** {{hosting_platform}}

### 7.2 How can the owner/curator/manager be contacted?

- **Contact:** {{curator_contact}}

### 7.3 Is there an erratum?

- **Errata URL:** {{errata_url}}

### 7.4 Will the dataset be updated?

- **Update policy:** {{update_policy}}
- **Update cadence:** {{update_cadence}}

### 7.5 If the dataset relates to people, are there applicable limits on the retention of the data?

- **Retention schedule:** {{retention_schedule}}

### 7.6 Will older versions of the dataset continue to be supported/hosted/maintained?

- **Versioning policy:** {{versioning_policy}}
- **Prior versions:** {{prior_versions}}

### 7.7 If others want to extend/augment/build on/contribute to the dataset, is there a mechanism for them to do so?

- **Contribution mechanism:** {{contribution_mechanism}}

### 7.8 Mailing list or announcement channel?

- **Mailing list:** {{mailing_list}}

### 7.9 Any other comments on maintenance?

<!-- HUMAN FILL: Optional. -->

---

## References

- REF-451: Gebru, T. et al. (2021). *Datasheets for Datasets*. Communications of the ACM, 64(12).
- ADR-022 D9: Dataset Documentation Decision
- Related artifacts:
  - Manifest: {{manifest_path}}
  - Quality report: {{quality_report_path}}
  - License ledger: {{license_ledger_path}}
  - Decontamination report: {{decontamination_report_path}}
  - Provenance record: {{provenance_record_path}}
