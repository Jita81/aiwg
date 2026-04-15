# Data Statement: {{dataset_name}}

> Per Bender & Friedman 2018 (REF-453) — "Data Statements for Natural Language Processing".
> Use for NLP / language datasets. Complements the full Datasheet with linguistic specifics.

- **Dataset version:** {{version}}
- **Manifest:** {{manifest_path}}
- **Generated:** {{generated_timestamp}}

---

## 1. Curation Rationale

- **Auto-summary:** {{intended_tasks}}
<!-- HUMAN FILL: Which texts were included, which were excluded, and why. Describe the selection criteria that shaped the sample. -->

---

## 2. Language Variety

- **BCP-47 language tag(s):** {{language_tags}}
- **Language variety / dialect:** {{language_variety}}
<!-- HUMAN FILL: Register (formal/informal), regional variety, historical period. -->

---

## 3. Speaker Demographics

*Demographics of the producers of the language data.*

- **Age distribution:** {{speaker_age}}
- **Gender distribution:** {{speaker_gender}}
- **Race / ethnicity:** {{speaker_race_ethnicity}}
- **Socioeconomic status:** {{speaker_ses}}
- **First language:** {{speaker_first_language}}
- **Language proficiency:** {{speaker_proficiency}}
- **Training in linguistics / relevant variety:** {{speaker_linguistics_training}}

<!-- HUMAN FILL: Explain estimation method (self-report, inferred, unknown) and note any populations under-represented. -->

---

## 4. Annotator Demographics

*Demographics of annotators (if dataset is labeled).*

- **Age distribution:** {{annotator_age}}
- **Gender distribution:** {{annotator_gender}}
- **Race / ethnicity:** {{annotator_race_ethnicity}}
- **Socioeconomic status:** {{annotator_ses}}
- **First language:** {{annotator_first_language}}
- **Language proficiency:** {{annotator_proficiency}}
- **Training in linguistics / relevant variety:** {{annotator_linguistics_training}}

<!-- HUMAN FILL: Describe annotator recruitment, compensation, and inter-annotator agreement metrics. -->

---

## 5. Speech Situation

- **Time and place of communication:** {{speech_time_place}}
- **Modality:** {{modality}} <!-- spoken / written / signed -->
- **Scripted / spontaneous:** {{speech_scripted}}
- **Synchronous / asynchronous interaction:** {{speech_synchronous}}
- **Intended audience:** {{speech_intended_audience}}

<!-- HUMAN FILL: Additional context about setting (broadcast, social media, private correspondence, etc.). -->

---

## 6. Text Characteristics

- **Genre:** {{text_genre}}
- **Topic:** {{text_topic}}
- **Structural complexity:** {{text_structure}}

<!-- HUMAN FILL: Length distribution, sentence complexity, domain vocabulary notes. -->

---

## 7. Recording Quality

- **Recording conditions:** {{recording_conditions}}
- **Audio / OCR / transcription quality:** {{recording_quality}}

<!-- HUMAN FILL: If applicable; omit for purely synthetic or curated-text datasets. -->

---

## 8. Other

- **IRB approval:** {{irb_approval_id}}
- **Consent mechanism:** {{consent_mechanism}}
- **Contact:** {{curator_contact}}
- **Disclosures / conflicts of interest:** <!-- HUMAN FILL -->

---

## 9. Provenance Appendix

- **W3C PROV record:** {{provenance_record_path}}
- **Upstream sources:** {{source_urls}}
- **Derivation chain:** {{derivation_chain_summary}}
- **Related artifacts:**
  - Datasheet: {{datasheet_path}}
  - Model Card: {{model_card_path}}
  - License ledger: {{license_ledger_path}}
  - Quality report: {{quality_report_path}}

---

## References

- REF-453: Bender, E. M. & Friedman, B. (2018). *Data Statements for Natural Language Processing: Toward Mitigating System Bias and Enabling Better Science*. TACL 6.
- ADR-022 D9: Dataset Documentation Decision
