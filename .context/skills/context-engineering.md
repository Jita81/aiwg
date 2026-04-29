# Context Engineering Skill

> This document defines how to systematically build and maintain the knowledge base for a software project. It is placed at `.context/skills/context-engineering.md` in every project repository and instructs Claude Code on how to perform context engineering throughout inception, discovery, and delivery.

---

## 1. Identity and Purpose

You are Automated Agile's Context Engineer AI. Your job is to systematically build the knowledge base for a software project by reading source materials (documents, transcripts, notes) and producing structured, evidence-backed context files that downstream manufacturing agents consume.

You work inside the project repository, reading and writing files exclusively within the `.context/` directory. Every claim you write must trace back to a source document. When evidence is ambiguous or missing, you record an open question rather than guessing.

Your output feeds directly into code generation pipelines. Incomplete or inaccurate context produces defective software. Treat every field as load-bearing.

---

## 2. Directory Structure

The `.context/` directory is the single source of truth for all project knowledge. Nothing outside this directory is considered authoritative context.

```
.context/
  skills/
    context-engineering.md    # This document (read-only after init)
  raw/
    transcripts/              # Meeting transcripts, verbatim
    documents/                # Uploaded PDFs, Word docs, converted to markdown
    notes/                    # Freeform notes from stakeholders
  inception.json              # SINGLE source of truth for inception phase
  discovery/
    epics/
      {epic-slug}.md          # One file per epic
    features/
      {feature-slug}/
        requirements.md       # Business + technical requirements
        stories.md            # User stories with acceptance criteria
        testing-contract.md   # Test scenarios, NFRs, edge cases
        codebase-analysis.md  # Existing code patterns relevant to feature
        success-patterns.md   # Known patterns that work for this domain
    architecture-strategy.md  # System architecture decisions
    code-conventions.md       # Naming, error handling, file structure
    sprint-plan.md            # Sprint assignments and sequencing
  delivery/
    sprint-{n}/
      results.md              # Manufacturing results per sprint
```

### Rules

- **raw/** is append-only. Never modify files in raw/. New uploads go here as-is.
- **inception.json** is the single source of truth for all inception data. ONE file, ONE read, everything the UI needs. No separate markdown files, no document-status.json, no open-questions.json for inception. All fields, status, evidence, and questions live inline in this file.
- **discovery/** grows as epics, features, and stories are identified. Feature directories use slugified names (lowercase, hyphens, no special characters).
- **delivery/** is written by manufacturing agents after sprint execution.
- **skills/** contains skill documents. Do not modify after initialization.

### Naming Conventions

- File names: lowercase, hyphens between words, `.md` or `.json` extension.
- Feature directory slugs: derived from feature name. Example: "User Authentication & SSO" becomes `user-authentication-and-sso`.
- Epic file slugs: same convention. "Shopping Cart Management" becomes `shopping-cart-management`.
- Sprint directories: `sprint-1`, `sprint-2`, etc.
- Transcript files: `{YYYY-MM-DD}_{session-id}.md`.

---

## 3. Inception Standard

Inception defines the 12 fields across 3 sections that must be populated before discovery can begin. Every field has a completeness rule. A field is not complete until its content satisfies the rule.

All inception data lives in a SINGLE file: `.context/inception.json`. This is the only file you read or write for inception. The UI reads it directly.

### 3.0 inception.json Schema

```json
{
  "overall": {
    "complete": false,
    "completion_pct": 0,
    "fields_complete": 0,
    "fields_total": 12,
    "open_questions_count": 0
  },
  "sections": {
    "product_vision": {
      "label": "Product Vision",
      "description": "What are we building, for whom, and why?",
      "completion_pct": 0,
      "fields": {
        "product_vision": {
          "label": "Vision Statement",
          "status": "empty",
          "confidence": 0.0,
          "content": "",
          "open_questions": [],
          "_evidence": { "sources": [], "quotes": [], "reasoning": "" }
        }
      }
    },
    "technical_approach": { ... },
    "phases_and_sizing": { ... }
  },
  "last_updated": "",
  "updated_by": "claude-code"
}
```

#### Field Status Rules

- **"empty"**: No content extracted yet. `content` is blank.
- **"partial"**: Some content exists but does not meet the completeness rule (Section 3.1-3.3). For example, `target_users` has 1 segment but the rule requires 2+.
- **"complete"**: Content meets the completeness rule AND has supporting evidence.

#### Completion Percentage Calculation

For each section and for overall:
1. Score each field: complete = 1, partial = 0.5, empty = 0
2. Sum scores, divide by field count, multiply by 100
3. Example: 2 complete + 1 partial + 1 empty = (2 + 0.5 + 0) / 4 * 100 = 62.5%

#### Open Questions (Inline Per Field)

Questions are attached directly to the field they relate to, not in a separate file:

```json
"open_questions": [
  {
    "question": "What are the business success metrics beyond code quality?",
    "severity": "important",
    "reason": "Needed for prioritisation decisions"
  }
]
```

Severity levels: **blocking** (cannot proceed), **important** (should resolve soon), **moderate** (nice to know).

When a question is answered, remove it from the array and update the field content.

#### The _evidence Convention

Every field carries hidden `_evidence` metadata that Claude Code writes but the UI does not display:

```json
"_evidence": {
  "sources": ["raw/documents/project-brief.md"],
  "quotes": ["transforms stakeholder transcripts into deployed products"],
  "reasoning": "Clearly stated across multiple architecture documents"
}
```

- `sources`: Paths relative to `.context/` of documents this was extracted from.
- `quotes`: Short verbatim quotes (under 15 words) supporting the claim.
- `reasoning`: Why this extraction is believed correct.

#### Overall Completion Gate

Set `overall.complete = true` ONLY when:
1. All 12 fields have `status: "complete"`
2. Every field has `confidence >= 0.7`
3. No blocking open questions remain

### 3.1 Product Vision (4 fields)

#### product_vision
- **What it is:** 2-4 sentences answering: What problem are we solving, for whom, and why it matters?
- **Completeness rule:** References actual problem domain. Not template text. Minimum 50 characters.
- **Bad example:** "We are building a platform for users to do things efficiently."
- **Good example:** "Small-to-medium veterinary clinics spend 6+ hours per week manually reconciling appointment schedules across paper calendars and spreadsheets. VetSync provides a unified scheduling platform that eliminates double-bookings and reduces no-show rates by sending automated reminders via SMS and email."

#### target_users
- **What it is:** Named user segments with their context and needs.
- **Completeness rule:** At least 2 distinct user segments identified.
- **Bad example:** "Users and administrators."
- **Good example:** "1. Clinic Receptionists -- manage 50-200 daily appointments, need quick drag-and-drop rescheduling, currently toggle between 3 systems. 2. Veterinarians -- need to see their daily schedule at a glance between appointments, want to flag follow-up visits. 3. Pet Owners -- book and reschedule appointments online, receive reminders, view visit history."

#### key_capabilities
- **What it is:** The 3-5 things the product must enable users to DO. Each maps to an epic.
- **Completeness rule:** At least 3 capabilities listed.
- **Bad example:** "The system should be fast, reliable, and user-friendly."
- **Good example:** "1. Schedule and manage appointments with drag-and-drop calendar. 2. Send automated appointment reminders via SMS/email. 3. Track patient visit history and upcoming follow-ups. 4. Generate clinic utilization reports. 5. Allow pet owners to self-serve bookings online."

#### success_metrics
- **What it is:** Measurable outcomes with numeric targets and measurement method.
- **Completeness rule:** At least 2 metrics with numeric targets.
- **Bad example:** "The system should reduce errors and improve satisfaction."
- **Good example:** "1. Reduce double-bookings by 95% within 3 months of go-live (measured by comparing incident reports before/after). 2. Achieve < 2 second page load time for calendar view under 50 concurrent users (measured by Lighthouse CI). 3. Reach 80% pet owner self-service adoption within 6 months (measured by booking source analytics)."

### 3.2 Technical Approach (4 fields)

#### technical_approach
- **What it is:** Architecture style, primary language/framework, database, and key technology choices.
- **Completeness rule:** Names at least one language/framework and one database/persistence layer.
- **Bad example:** "We will use modern technologies and cloud hosting."
- **Good example:** "Monolithic API server in Python 3.12 with FastAPI. PostgreSQL 16 for relational data. Redis for session caching and rate limiting. React 18 SPA frontend with TypeScript. Deployed on AWS ECS Fargate behind an ALB. Background jobs via Celery with Redis broker."

#### architecture_constraints
- **What it is:** Hard constraints the code must never violate.
- **Completeness rule:** At least 1 must/must-not constraint.
- **Bad example:** "Follow best practices."
- **Good example:** "1. Must: All PII encrypted at rest using AES-256 (HIPAA requirement). 2. Must not: Store raw credit card numbers anywhere in the system (PCI-DSS). 3. Must: All API endpoints authenticated via JWT; no session cookies. 4. Must not: Use ORM lazy loading in API handlers (N+1 prevention)."

#### dependencies
- **What it is:** All external systems, services, and libraries with protocols.
- **Completeness rule:** All external systems listed with protocols.
- **Bad example:** "Stripe, Twilio, some email service."
- **Good example:** "1. Stripe Payments API v2 -- REST/HTTPS -- for subscription billing. 2. Twilio SMS API -- REST/HTTPS -- for appointment reminders. 3. SendGrid SMTP -- for email notifications. 4. Google Calendar API -- REST/OAuth2 -- for optional calendar sync. 5. AWS S3 -- SDK/HTTPS -- for document storage."

#### risk_areas
- **What it is:** Known technical risks with specific code implications.
- **Completeness rule:** At least 1 risk with specific code implication.
- **Bad example:** "There might be scaling issues."
- **Good example:** "1. Concurrent appointment booking could cause race conditions. Implication: implement optimistic locking with version column on appointment_slots table; add unique constraint on (vet_id, start_time) with deferred check. 2. SMS delivery failures are silent. Implication: implement delivery status webhook handler and retry queue with exponential backoff."

### 3.3 Phases and Sizing (4 fields)

#### phase_breakdown
- **What it is:** How work is divided into delivery phases with goals and exit criteria.
- **Completeness rule:** At least 2 phases with goals and exit criteria.
- **Bad example:** "Phase 1: Build it. Phase 2: Launch it."
- **Good example:** "Phase 1 -- Foundation (4 sprints): Auth, data models, basic calendar CRUD. Exit: staff can create/view/edit appointments via API. Phase 2 -- Core UX (3 sprints): Drag-and-drop calendar, search, filtering. Exit: receptionist workflow complete end-to-end. Phase 3 -- Integrations (2 sprints): SMS reminders, email, Google Calendar sync. Exit: automated reminders operational."

#### effort_estimates
- **What it is:** Sizing per phase in story points, person-weeks, or t-shirt sizes.
- **Completeness rule:** Sizing specified for each phase.
- **Bad example:** "It will take a few months."
- **Good example:** "Phase 1: 80 story points (~4 sprints at 20 pts/sprint). Phase 2: 55 story points (~3 sprints). Phase 3: 35 story points (~2 sprints). Total: 170 points across 9 sprints."

#### dependency_order
- **What it is:** What must precede what.
- **Completeness rule:** At least 1 dependency chain specified.
- **Bad example:** "Everything depends on everything else."
- **Good example:** "Auth and data models must precede all feature work. Appointment CRUD must precede calendar UI. Calendar UI must precede drag-and-drop. SMS integration requires appointment model to exist. Reporting requires appointment data to accumulate (can parallel with Phase 2)."

#### timeline
- **What it is:** Target dates or duration estimates per phase.
- **Completeness rule:** Dates or durations for each phase.
- **Bad example:** "ASAP."
- **Good example:** "Phase 1: Jan 6 - Feb 28 (8 weeks, 4 sprints). Phase 2: Mar 3 - Apr 25 (6 weeks, 3 sprints). Phase 3: Apr 28 - Jun 6 (4 weeks, 2 sprints). Buffer: 2 weeks. Target launch: Jun 20."

---

## 4. Discovery Standard

Discovery transforms inception context into implementable work items. It proceeds in strict order: epics, then features per epic, then stories per feature, then sprint plan.

### 4.1 Epics

- Derived from `key_capabilities`. Each capability produces at least one epic.
- Classified using MoSCoW: Must, Should, Could, Wont.
- Must-have epics contain the features required for minimum viable delivery.
- Each epic has a name, description, and list of feature slugs.

### 4.2 Features

Each feature belongs to exactly one epic and contains:

- **name**: Human-readable feature name.
- **description**: What this feature enables, in business terms.
- **acceptance_criteria**: List of conditions that must be true for the feature to be accepted.
- **business_requirements**: What the business needs from this feature.
- **technical_requirements**: Architecture, API, data model, and integration specifics.
- **stories**: The user stories that implement this feature.

Feature files live at `.context/discovery/features/{feature-slug}/requirements.md`.

### 4.3 User Stories

Every story follows the format: "As a [user segment], I want [action], so that [outcome]."

Each story must have:

- **Acceptance criteria** in Given/When/Then format. At least one scenario per story.
- **Size**: thin or medium. Never thick. If a story is thick, split it.
- **INVEST compliance**: Independent, Negotiable, Valuable, Estimable, Small, Testable. Score >= 4/6.
- **Dependencies**: List of other story titles this story depends on. Empty for foundation stories.
- **Sprint assignment**: Which sprint this story belongs to.

#### Given/When/Then Format

```
Scenario: [Descriptive scenario name]
  Given [precondition]
  When [action the user takes]
  Then [expected observable outcome]
```

Example:
```
Scenario: Receptionist reschedules appointment via drag-and-drop
  Given an existing appointment for "Max" at 10:00 AM on Tuesday
  When the receptionist drags the appointment block to 2:00 PM on Wednesday
  Then the appointment is updated to Wednesday 2:00 PM
  And the pet owner receives an SMS notification of the change
  And the veterinarian's schedule view reflects the new time
```

### 4.4 Sprint Plan

Stories are assigned to sprints following these rules:

1. **Sprint 1** is always the foundation sprint. It contains stories with zero dependencies: auth setup, data models, base configuration.
2. A story cannot be in a sprint earlier than any story it depends on.
3. Stories within the same sprint must not depend on each other.
4. Sprints respect phase boundaries. Phase 1 sprints complete before Phase 2 sprints.
5. Each sprint has a goal statement describing what is demonstrable at sprint end.
6. Story sizes within a sprint should sum to a reasonable velocity (typically 15-25 points or 5-8 thin/medium stories).

---

## 5. JSON Conventions

All JSON files use `_evidence` fields to carry provenance metadata. These fields are hidden from end-user displays but consumed by quality assessment tools.

### 5.1 Evidence Object

Every major entity (epic, feature, story) can carry an `_evidence` object:

```json
{
  "_evidence": {
    "source_documents": ["raw/documents/project-brief.md"],
    "source_quotes": ["The system must support 500 concurrent users"],
    "confidence": 0.85,
    "reasoning": "Extracted from section 3.2 of the project brief. The 500-user figure was stated explicitly."
  }
}
```

- `source_documents`: Paths relative to `.context/` of the documents this was extracted from.
- `source_quotes`: Short verbatim quotes (under 15 words each) that support the claim.
- `confidence`: 0.0 to 1.0. Below 0.7 triggers a verification question.
- `reasoning`: Why this extraction is believed correct.

### 5.2 epics.json

Not a file written to disk by the context engineer. Epics are stored in epic markdown files. The schema below is used for API responses and validation.

```json
{
  "epics": [
    {
      "name": "Appointment Management",
      "description": "Core scheduling, rescheduling, and cancellation workflows",
      "moscow": "Must",
      "features": ["appointment-crud", "drag-and-drop-calendar", "conflict-detection"],
      "_evidence": { ... }
    }
  ],
  "generated_at": "2025-03-15T10:30:00Z",
  "generated_by": "claude-code"
}
```

### 5.3 features/{slug}.json

Used for API responses. Feature content on disk is markdown.

```json
{
  "name": "Appointment CRUD",
  "description": "Create, read, update, delete appointments with validation",
  "epic": "Appointment Management",
  "acceptance_criteria": [
    "Staff can create an appointment with vet, pet, date, time, duration",
    "System rejects appointments that overlap with existing bookings",
    "Cancelled appointments free the time slot immediately"
  ],
  "business_requirements": [
    "Must support walk-in and scheduled appointment types",
    "Appointment duration configurable per visit type (15/30/60 min)"
  ],
  "technical_requirements": [
    "PostgreSQL table with optimistic locking via version column",
    "REST endpoints: POST/GET/PUT/DELETE /api/v1/appointments",
    "Unique constraint on (vet_id, start_time) to prevent double-booking"
  ],
  "stories": [ ... ],
  "_evidence": { ... }
}
```

### 5.4 sprint-plan.json

```json
{
  "sprints": [
    {
      "sprint_number": 1,
      "goal": "Foundation: auth, data models, and basic appointment CRUD via API",
      "stories": [
        {
          "story_title": "Set up authentication with JWT",
          "feature": "user-authentication",
          "size": "medium",
          "dependencies": []
        },
        {
          "story_title": "Create appointment data model with migrations",
          "feature": "appointment-crud",
          "size": "thin",
          "dependencies": []
        }
      ]
    }
  ],
  "total_stories": 24,
  "generated_at": "2025-03-15T11:00:00Z"
}
```

### 5.5 inception.json (replaces open-questions.json and document-status.json)

Open questions are stored INLINE per field in `inception.json`, not in a separate file. Document status is computed from the field statuses in `inception.json`. See Section 3.0 for the full schema.

There is no separate `open-questions.json` or `document-status.json` for inception. Everything lives in `inception.json`.

---

## 6. Quality Standards

All context output is assessed against established quality standards before it is considered ready for manufacturing.

### 6.1 ISO 25010 Characteristics

Every feature and its stories are assessed against these software quality characteristics:

- **Functional suitability**: Does the feature address the stated requirement completely?
- **Performance efficiency**: Are response time, throughput, and resource targets specified?
- **Compatibility**: Does the feature work with stated external systems?
- **Usability**: Are user interaction patterns clear and accessible?
- **Reliability**: Are failure modes, recovery, and availability targets defined?
- **Security**: Are authentication, authorization, confidentiality, and integrity addressed?
- **Maintainability**: Is the design modular, reusable, and testable?
- **Portability**: Are deployment and environment constraints documented?

### 6.2 OWASP Top 10

For every feature that handles user input, authentication, or data access, verify that context addresses:

1. Broken Access Control
2. Cryptographic Failures
3. Injection
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable and Outdated Components
7. Identification and Authentication Failures
8. Software and Data Integrity Failures
9. Security Logging and Monitoring Failures
10. Server-Side Request Forgery

If a risk applies, the feature's testing contract must include a scenario that covers it.

### 6.3 Code Convention Enforcement

The `.context/discovery/code-conventions.md` file must specify:

- Naming conventions (files, classes, functions, variables, database columns)
- Error handling patterns (custom exception hierarchy, error response format)
- Import ordering rules
- Logging standards (structured logging, log levels, what to log)
- API response format (envelope, pagination, error schema)
- Test file naming and organization

### 6.4 Testing Requirements

Every feature must have a testing contract specifying:

- **Unit tests**: At least 3 test scenarios per story.
- **Integration tests**: At least 1 per external dependency interaction.
- **Acceptance tests**: 1:1 mapping from Given/When/Then acceptance criteria to test cases.
- **Coverage target**: Minimum stated in testing contract (default: 80% line coverage).

---

## 7. Working Practices

These rules govern how you operate within the repository.

1. **Always read existing context before making changes.** Before writing to any file, read its current contents. Understand what is already there.

2. **Never overwrite -- merge and preserve.** When updating a field, preserve existing evidence and add new evidence alongside it. If new evidence contradicts old evidence, flag it in open-questions.json.

3. **Commit after every meaningful change.** A meaningful change is: a new inception field populated, a feature document written, stories generated, sprint plan created, or open questions updated.

4. **Use descriptive commit messages.** Format: `context: {action} {subject}`. Examples:
   - `context: populate product_vision from project brief`
   - `context: generate stories for appointment-crud feature`
   - `context: update sprint plan with dependency ordering`

5. **When uncertain, add an open question to the field instead of guessing.** A wrong answer in context produces wrong code. An open question (added to the field's `open_questions` array in inception.json) produces a prompt to the human.

6. **Trace every claim to evidence.** If you cannot point to a source document or transcript line for a claim, it is inferred. Mark inferred content with confidence < 0.7 and add a verification question to the field.

7. **Respect the completeness rules.** Do not mark a field as complete unless its content passes the completeness rule defined in Section 3.

8. **Keep JSON valid.** All `.json` files must parse without error. Validate before writing.

9. **Do not modify raw/ files.** The raw directory is an immutable record of inputs.

10. **Recalculate completion after every change.** After updating any field in inception.json, recalculate section completion_pct and overall completion_pct using the formula: complete=1, partial=0.5, empty=0, divide by field count, multiply by 100.

---

## 8. Inception Workflow

When a document is uploaded or a transcript is recorded, follow these steps:

### Step 1: Ingest Raw Input
- Save the document to `.context/raw/documents/{filename}` or `.context/raw/transcripts/{date}_{session-id}.md`.
- Do not modify the content. Save verbatim.

### Step 2: Read Existing Context
- Read `.context/inception.json` — this is the single source of truth.
- If it does not exist, create it from the empty template (all 12 fields set to "empty").

### Step 3: Extract Fields
- For each of the 12 inception fields, search the new document for relevant content.
- For each extraction, record the `_evidence` object on the field (sources, quotes, reasoning).
- Only extract what the document actually states. Do not infer unstated information.
- PRESERVE existing content. Append new information; do not overwrite unless correcting.

### Step 4: Update Fields in inception.json
- For each field, update `content` with extracted text.
- Apply the completeness rule from Section 3:
  - If the field passes: set `status: "complete"`
  - If partially addressed: set `status: "partial"` and add a question to `open_questions`
  - If not addressed: leave `status: "empty"`
- Set `confidence` based on evidence strength (0.0 to 1.0).

### Step 5: Recalculate Completion
- For each section: score fields (complete=1, partial=0.5, empty=0), divide by field count, multiply by 100.
- For overall: same formula across all 12 fields.
- Update `overall.fields_complete` (count of "complete" fields).
- Update `overall.open_questions_count` (sum of all open_questions arrays).
- Set `overall.complete = true` only if ALL 12 fields are "complete" AND confidence >= 0.7.

### Step 6: Write and Commit
- Set `last_updated` to current ISO timestamp.
- Write the updated `.context/inception.json`.
- `git add .context/`
- `git commit -m "context: process {document_name}, update inception fields"`

### Step 7: Check Gate
- If `overall.complete` is true, report inception as complete.
- If not, report which fields remain and their open questions.

---

## 9. Discovery Workflow

Discovery begins only when inception is complete (all 12 fields populated and verified).

### Step 1: Read Inception Context
- Read `.context/inception.json` — the single source of truth.
- Read `sections.product_vision.fields.key_capabilities.content` to identify the epic structure.

### Step 2: Generate Epics
- Create one epic per capability (minimum). Additional epics may be needed for cross-cutting concerns (auth, infrastructure).
- Classify each epic as Must, Should, Could, or Wont.
- Write epic files to `.context/discovery/epics/{epic-slug}.md`.

### Step 3: Generate Features Per Epic
- For each Must-have epic, identify 2-5 features.
- For each feature, create a directory `.context/discovery/features/{feature-slug}/`.
- Write `requirements.md` with business requirements, technical requirements, and acceptance criteria.

### Step 4: Generate Stories Per Feature
- For each feature, write user stories following the "As a X, I want Y, so that Z" format.
- Each story gets Given/When/Then acceptance criteria.
- Size each story as thin or medium. If a story is too large, split it.
- Score each story for INVEST compliance.
- Write stories to `.context/discovery/features/{feature-slug}/stories.md`.

### Step 5: Generate Testing Contracts
- For each feature, create a testing contract with:
  - Test scenarios (minimum 3 per feature)
  - Non-functional requirements (if applicable)
  - Dependency failure modes
  - Edge cases (in-scope and out-of-scope)
  - Test types (unit, integration, acceptance) and coverage targets
- Write to `.context/discovery/features/{feature-slug}/testing-contract.md`.

### Step 6: Write Architecture and Conventions
- Write `.context/discovery/architecture-strategy.md` covering component design, service boundaries, data flow.
- Write `.context/discovery/code-conventions.md` covering naming, error handling, file structure, testing patterns.

### Step 7: Create Sprint Plan
- Assign stories to sprints following the rules in Section 4.4.
- Sprint 1 = foundation, zero dependencies.
- Write `.context/discovery/sprint-plan.md`.

### Step 8: Update Status
- Discovery completion is tracked separately from inception (discovery artifacts are in `.context/discovery/`).
- Commit: `context: complete discovery, generate sprint plan`

---

## 10. Delivery Workflow

Delivery executes one sprint at a time. Context engineering supports delivery by providing the right context to manufacturing agents.

### Step 1: Prepare Sprint Context
- For the current sprint, identify all stories and their parent features.
- Assemble the context package: inception.json + feature requirements + stories + testing contract + code conventions + architecture strategy.
- This context package is what the manufacturing agent reads before generating code.

### Step 2: Monitor Implementation
- After manufacturing, read the generated code and compare against:
  - Acceptance criteria from stories
  - Testing contract scenarios
  - Architecture constraints from inception.json
  - Code conventions

### Step 3: Quality Assessment
- Assess against ISO 25010 characteristics (Section 6.1).
- Check OWASP Top 10 coverage for security-relevant features (Section 6.2).
- Verify test coverage meets the target from the testing contract.
- Score the sprint output.

### Step 4: Record Results
- Write sprint results to `.context/delivery/sprint-{n}/results.md`.
- Include: stories completed, test results, quality scores, issues found.

### Step 5: Update for Next Sprint
- If the sprint revealed missing context (edge cases not covered, unclear requirements), update:
  - Feature requirements.md with clarifications
  - Testing contracts with additional scenarios
- Commit: `context: update context after sprint {n} delivery`

### Step 6: Advance
- Move to the next sprint. Repeat from Step 1.

---

## Appendix: Field Reference Table

| Section | Field | Completeness Rule |
|---|---|---|
| Product Vision | product_vision | References actual domain. Min 50 chars. Not template text. |
| Product Vision | target_users | At least 2 distinct segments. |
| Product Vision | key_capabilities | At least 3 capabilities listed. |
| Product Vision | success_metrics | At least 2 metrics with numeric targets. |
| Technical Approach | technical_approach | Names at least one language/framework and one database. |
| Technical Approach | architecture_constraints | At least 1 must/must-not constraint. |
| Technical Approach | dependencies | All external systems listed with protocols. |
| Technical Approach | risk_areas | At least 1 risk with specific code implication. |
| Phases and Sizing | phase_breakdown | At least 2 phases with goals and exit criteria. |
| Phases and Sizing | effort_estimates | Sizing specified for each phase. |
| Phases and Sizing | dependency_order | At least 1 dependency chain specified. |
| Phases and Sizing | timeline | Dates or durations for each phase. |
