---
id: generate-architecture
version: 1
tier: tier2
description: |
  Given the project's confirmed context fields, propose a sensible
  end-to-end architecture for a multi-tenant Automated Agile Enterprise / similar
  SaaS platform. Used by the Architecture Strategy page's
  "Generate from context" action — Sprint 2 wires this skill behind
  POST /architecture/projects/{id}/architecture/generate-from-context.

  Output shape mirrors `ArchitecturePlan.plan_content` exactly:
  `{summary, components[], technology_decisions[], deployment,
  data_architecture, security, risks}`. Components must carry stable
  `id`s (`comp_1`, `comp_2`, ...) and `position` hints so the diagram
  renderer (Sprint 1, `architecture-diagram` skill) can lay them out
  without further input.
system: |
  You are a senior solution architect designing a production-grade
  cloud SaaS architecture from a stakeholder context pack. You favour
  managed services, you justify every technology choice against a
  context fact, you call out the real risks instead of pretending the
  system has none, and you write in British English. Return ONLY a
  valid JSON object with no prose, no markdown, no code fences.
model: deepseek-chat
temperature: 0.3
max_tokens: 4500
output_schema:
  # Only summary + components are required at the contract level. The rest
  # ride along when the model has something useful to say. Strict per-field
  # requirements were rejecting otherwise-good output (positions, protocols
  # the model couldn't usefully invent without diagram intent). We compute
  # positions in the frontend; protocols default to "https".
  type: object
  required: [summary, components]
  properties:
    summary:
      type: string
      description: Two- to four-sentence narrative of the overall architecture.
    components:
      type: array
      items:
        type: object
        # `name` is required because the architecture page renders it; everything
        # else is optional so the model is free to express identity through the
        # combination of `technology` + `rationale` when that's clearer.
        required: [id, name, type]
        properties:
          id:
            type: string
            description: Stable identifier `comp_1`, `comp_2`, ... matching connections.
          name:
            type: string
          type:
            type: string
            enum: [frontend, backend, service, database, cache, queue, message_bus, gateway, cdn, external, security]
          description:
            type: string
          technology:
            type: string
            description: Concrete tech choice (e.g. "React 18 + Vite", "PostgreSQL 16").
          rationale:
            type: string
            description: One sentence pointing back to a context field.
          connections:
            type: array
            items:
              type: object
              required: [target_id]
              properties:
                target_id:
                  type: string
                relationship:
                  type: string
                protocol:
                  type: string
    technology_decisions:
      type: array
      items:
        type: object
        required: [area, choice, rationale]
        properties:
          area: {type: string}
          choice: {type: string}
          rationale: {type: string}
    deployment:
      type: object
      properties:
        cloud_provider: {type: string}
        regions:
          type: array
          items: {type: string}
        environments:
          type: array
          items: {type: string}
        scaling_strategy: {type: string}
    data_architecture:
      type: object
      properties:
        primary_store: {type: string}
        caching: {type: string}
        event_streaming: {type: string}
        data_flow: {type: string}
    security:
      type: object
      properties:
        authentication: {type: string}
        authorization: {type: string}
        encryption: {type: string}
        compliance:
          type: array
          items: {type: string}
    risks:
      type: array
      items:
        type: object
        required: [risk, mitigation, severity]
        properties:
          risk: {type: string}
          mitigation: {type: string}
          severity:
            type: string
            enum: [low, medium, high, critical]
---

# generate-architecture

## Goal

Propose a coherent, production-grade architecture for the project
described by the confirmed context fields. The output must be a single
JSON object that drops straight into the `ArchitecturePlan.plan_content`
column and renders correctly via the Sprint 1 `architecture-diagram`
skill.

## Inputs

- `context_fields`: a rendered list of `field_name: value` lines from
  the project's `ContextField` table (status = confirmed). Each line is
  a fact you may rely on; do not invent context that is not there.
- `horizon` *(optional)*: one of `mvp`, `mmp`, `full`. Scopes the
  architecture you propose to what the product delivers **by the end of
  that horizon**. Defaults to `full` (the union view — the production
  shape of the system once every horizon has shipped). See
  "Per-horizon guidance" below.

## Procedure

1. Read every context field end to end. Group them by concern: users
   and access, data, integrations, compliance, deployment target,
   non-functional requirements, distinctive product capabilities.
2. Decide the headline shape of the system (single-tenant vs multi-
   tenant, monolith vs services, sync vs event-driven) from the facts
   in step 1. Write a two- to four-sentence `summary` capturing it.
3. Propose 5–9 `components`. A typical Automated Agile-style platform has at
   minimum: a frontend, an API / backend, a primary datastore, an auth
   / identity component, and at least one external integration. Add a
   message bus, cache, gateway or CDN only when a context field
   justifies it.
   - Give each component a stable `id` of the form `comp_1`, `comp_2`,
     ... numbered in reading order.
   - Give each component a `name` — a short, human-readable label that
     would appear on the diagram (e.g. "React SPA", "FastAPI Backend",
     "PostgreSQL Primary"). The `name` field is REQUIRED — every
     component must have one; do not collapse it into `technology` or
     `id`.
   - Pick a `type` STRICTLY from this enum: `frontend`, `backend`,
     `service`, `database`, `cache`, `queue`, `message_bus`, `gateway`,
     `cdn`, `external`, `security`. Map anything else (e.g. "API",
     "auth_provider", "analytics") to the closest enum member. Never
     invent new types.
   - Fill `technology` with a concrete, current choice (no "TBD").
   - Fill `rationale` with one sentence pointing back to a specific
     context fact (paraphrase or quote the field name).
   - Populate `connections` with `{target_id, relationship, protocol}`
     entries describing every outgoing edge. The frontend talks to the
     backend (HTTPS / REST), the backend talks to the database (TCP /
     SQL), and so on. Empty list when a component has no outgoing
     edges.
   - Provide a `position` `{x, y}` hint that lays components out in
     bands: frontend across the top (`y` ≈ 80), backend / service mid
     (`y` ≈ 240), data store row at the bottom (`y` ≈ 400). Space
     components at least 220px apart horizontally.
4. List 4–8 `technology_decisions` covering the headline picks
   (frontend framework, backend language, datastore, hosting, auth
   provider, observability stack). Each entry is `{area, choice,
   rationale}`. The rationale must point back to a context field.
5. Fill `deployment` with `cloud_provider`, `regions`,
   `environments`, and `scaling_strategy`. Default to `AWS` and a
   single region unless the context says otherwise; environments
   default to `[dev, staging, prod]`.
6. Fill `data_architecture` with `primary_store`, `caching`,
   `event_streaming`, `data_flow` — short phrases, not paragraphs.
7. Fill `security` with `authentication`, `authorization`,
   `encryption`, and `compliance` (a list — `[]` if nothing applies).
   Treat any compliance fact in the context (SOC 2, GDPR, HIPAA,
   ISO 27001, UK government) as load-bearing.
8. List 3–6 honest `risks` with `mitigation` and `severity`. Cover at
   least one of: data residency, vendor lock-in, single point of
   failure, cost, regulatory.
9. Re-read your JSON. Apply these checks. Rewrite if any fails:
   - Every `connections[*].target_id` resolves to an `id` in
     `components`.
   - Every component `id` is unique and matches `comp_<n>`.
   - Every `technology_decisions[*].rationale` and every
     `components[*].rationale` references something a context field
     said. No hallucinated context.
   - `summary` is two to four sentences, not a bullet list.
   - The shape of the JSON matches the schema in the front-matter
     exactly. No extra top-level keys.

## Per-horizon guidance

The architecture page renders three separate diagrams — MVP, MMP, and
Full Product — and invokes this skill once per horizon. Treat the
horizons as a growth story, not three unrelated designs:

- `mvp` — the thinnest shape that proves the core value proposition.
  Favour a single frontend, a single backend service, one database, and
  the minimum external integrations the context actually names. Skip
  caches, message buses, multi-region anything, and optional
  compliance flows unless the context explicitly requires them at MVP.
  4–6 components is the usual sweet spot. Risks should focus on
  "what happens when we scale past this shape".
- `mmp` — the first version we would actually sell. Adds the
  components that make MVP credible in a paying-customer context:
  authentication / identity hardening, observability, a cache or CDN
  where the traffic pattern demands it, and integrations the context
  says are table-stakes for commercial use. Expect 6–8 components.
  Start calling out the compliance story if the context names a
  regulated industry.
- `full` — the end-state architecture the context implies. Include
  message buses, multi-region scaling, downstream analytics, full
  compliance posture, and any enterprise-grade components (SSO, audit
  log pipelines, data-residency stores) the context justifies. 7–9
  components is typical; don't stretch beyond the limits unless the
  context genuinely demands it.

The `summary` must open with a one-phrase label of the horizon
(e.g. "MVP shape — …", "MMP shape — …", "Full-product shape — …") so
the reader immediately knows which horizon they are looking at. The
component `id` convention (`comp_1`, `comp_2`, …) is scoped **per
horizon** — don't try to keep ids stable across horizons, the diagrams
are rendered independently.

## C4 rendering notes

The downstream renderer (`apps/athena/architecture/c4_renderer.py`) maps
this JSON into a **C4-PlantUML Container diagram** — no LLM in the loop
— and POSTs the source to the PlantUML server for an SVG. Shape your
output so that mapping produces a clean diagram:

- **`type`** — prefer one of the canonical hints the renderer
  recognises directly: `web-ui`, `api`, `database`, `cache`, `queue`,
  `external-system`, `subprocess`, `worker`. You may still emit any of
  the existing enum values (`frontend`, `backend`, `service`,
  `message_bus`, `gateway`, `cdn`, `external`, `security`) — the
  renderer has fallback mappings for all of them — but a canonical hint
  gives the cleanest box.
- **`id`** — the renderer sanitises these to PlantUML-safe identifiers
  (`[A-Za-z_][A-Za-z0-9_]*`), but life is easier if you emit safe ids
  from the start: short, lowercase, snake_case (`web_ui`, `api`,
  `primary_db`, `stripe`). Avoid spaces, hyphens, and leading digits.
- **`name`** — keep short. The C4 container box is ~200px wide;
  anything beyond ~24 characters wraps awkwardly.
- **`technology`** — a free-form string (framework + language +
  version is the sweet spot — e.g. `"FastAPI / Python 3.12"`,
  `"PostgreSQL 16"`, `"React 18 + Vite"`). C4 Containers take a
  dedicated technology parameter and render it under the name in a
  smaller font, so use this field for the concrete stack rather than
  folding it into `name` or `description`.
- **`description`** — one-sentence purpose statement. C4 calls this
  the "responsibility". Keep it under ~140 characters.
- **`connections`** — every outgoing edge gets a `Rel(...)` line.
  Populate `relationship` with what the edge *does* (e.g. `"reads /
  writes"`, `"publishes events to"`, `"charges cards via"`) and
  `protocol` with the transport (`"HTTPS / JSON"`, `"TCP / SQL"`,
  `"AMQP"`). Both render on the edge label — the protocol appears in
  italics under the relationship text.

Don't worry about position hints for the C4 render — PlantUML
auto-layouts the graph. The `position` field is still used by the
interactive editor on the architecture page, so keep emitting it for
the editor's benefit.

## Anti-patterns to avoid

- **The blank-rationale architecture** — components with rationale
  text like "needed for the system" that does not name any context
  fact. If you cannot tie a component to a context field, drop it.
- **The TBD architecture** — `technology` values like "TBD",
  "depends", or "various". Pick something concrete; the user can edit
  later.
- **The orphan-edge architecture** — connections pointing to
  `target_id`s that do not exist in the components list. Fix the
  graph before returning.
- **The everything-microservice architecture** — splitting a small
  product into eight microservices because microservices feel modern.
  Default to a modular monolith plus the data store unless the
  context demands otherwise.
- **The compliance-shrug architecture** — empty `security.compliance`
  when the context names a regulated industry. Carry the compliance
  framework through.

## Inputs (rendered)

### Horizon

{{horizon}}

### Confirmed context fields

{{context_fields}}

## Output

Return a single JSON object matching the schema in the front-matter.
Every required key must be present. No prose. No markdown. No code
fences.
