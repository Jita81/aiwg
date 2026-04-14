---
type: gap-analysis
framework: sdlc-complete
methodology: 12-factor-app
date: 2026-04-13
issue: "#821"
---

# 12-Factor App Methodology: SDLC Framework Gap Analysis

## Summary

| Factor | Coverage | Severity |
|--------|----------|----------|
| I. Codebase | Partial | Low |
| II. Dependencies | Good | None |
| III. Config | Partial | Medium |
| IV. Backing Services | Partial | Medium |
| V. Build, Release, Run | Good | None |
| VI. Processes | Gap | High |
| VII. Port Binding | Gap | Medium |
| VIII. Concurrency | Partial | Medium |
| IX. Disposability | Gap | High |
| X. Dev/Prod Parity | Partial | Medium |
| XI. Logs | Gap | High |
| XII. Admin Processes | Gap | Medium |

**Strong coverage** (I, II, IV, V, X): artifact management, dependency policy, staged deployment, environment templates.

**Weak coverage** (VI, VII, VIII, IX, XI, XII): process-level concerns — statelessness, port binding, disposability, log streams, admin one-offs.

The framework emphasizes *artifact* and *deployment* concerns well but is lighter on *runtime process* concerns. That's the shape of the remediation plan.

---

## Per-Factor Analysis

### I. Codebase — One codebase tracked in VCS, many deploys

**Current coverage**:
- `agents/configuration-manager.md` — baseline + change control across repos
- `templates/management/dependency-card.md` — tracks artifacts and versions
- `rules/versioning.md` — CalVer, tagging

**Gap**: Multi-deploy model (same codebase → dev/staging/prod) is implicit in deployment flows but never stated as a principle. No template section that says "this codebase deploys to N environments — enumerate them."

**Severity**: Low. The pattern is correct by default; AIWG's own release flow demonstrates it.

**Remediation**:
- Add a "Deployments" table to `deployment-plan-template.md` enumerating environments the codebase targets
- Add line to `configuration-management-plan` stating "one codebase, multiple deployments"

---

### II. Dependencies — Explicitly declare and isolate

**Current coverage**:
- `templates/security/dependency-policy-template.md` — pinning, SBOM, CVEs, license blocklist
- `templates/management/dependency-card.md` — tracking per dependency
- `agents/build-engineer.md` — dependency scanning + provenance
- `skills/intake-from-codebase/SKILL.md` — detects multi-service dependencies

**Gap**: None significant. Coverage is good.

**Severity**: None.

**Remediation**: Optional — add a lint rule checking that `package.json` / `requirements.txt` / `go.mod` / `Cargo.toml` exists at project root and has no wildcard versions in critical dependencies.

---

### III. Config — Store config in the environment

**Current coverage**:
- `rules/token-security.md` — prohibits hardcoded tokens, CLI arg tokens, logging tokens
- `templates/configuration/aiwg-config-template.md` — framework configuration paths
- `agents/configuration-manager.md` — configuration governance

**Gap**: Token security rule covers secrets specifically. General config-in-env principle (non-secret config: feature flags, service URLs, log levels) is not formalized. No template section requiring "configuration values that differ by environment must come from environment variables."

**Severity**: Medium. Config drift between environments is a common production bug.

**Remediation**:
- New rule: `rules/config-in-environment.md` — non-secret config belongs in env vars, not source
- Add lint rule: detect hardcoded URLs, ports, feature-flag values in source files
- Add section to `deployment-environment-template.md`: "Environment Variables" table listing all env vars per environment

---

### IV. Backing Services — Treat backing services as attached resources

**Current coverage**:
- `templates/deployment/infrastructure-definition-template.md` — network, data layer, security infra
- `templates/analysis-design/software-architecture-doc-template.md` — circuit breakers, external dependencies
- `agents/integration-engineer.md` — integration management

**Gap**: The "attached resource" principle (DB, cache, queue are all URLs swappable without code change) is not explicitly stated. SAD template mentions external dependencies but doesn't enforce the locator-via-config pattern.

**Severity**: Medium. Hard-coded backing service addresses are a common 12-factor violation.

**Remediation**:
- Add section to `software-architecture-doc-template.md`: "Backing Services — Resource Locator Table" with service name + env var + swap criteria
- Add lint rule: detect hardcoded DB/cache/queue connection strings in source

---

### V. Build, Release, Run — Strict stage separation

**Current coverage**:
- `skills/flow-deploy-to-production/SKILL.md` — orchestrates deployment + rollback
- `agents/build-engineer.md` — pipeline design
- `agents/deployment-manager.md` — release readiness
- `templates/deployment/ci-cd-pipeline-template.md` — pipeline definition
- `templates/deployment/deployment-plan-template.md` — staged deployments

**Gap**: None significant. Stage separation is well-enforced through the CI/CD and deployment-manager pipelines.

**Severity**: None.

**Remediation**: Optional — add explicit 12-factor principle citation to the CI/CD pipeline template intro.

---

### VI. Processes — Execute as one or more stateless processes

**Current coverage**:
- `agents/reliability-engineer.md` — SLO/SLI, failure testing (implies statelessness but doesn't enforce)

**Gap**: **High**. No rule, template section, or agent prompt addresses process statelessness. Session state, in-memory caches, and local-disk reliance are not flagged. This is one of the most commonly violated 12-factor rules.

**Severity**: High. Stateful processes break horizontal scaling and disposability.

**Remediation**:
- New rule: `rules/stateless-processes.md` — processes must not rely on local disk state or in-process session cache; external state must go to backing services
- Add section to `software-architecture-doc-template.md`: "Process State Model" table listing each process type + state location
- Add architecture review checklist item in `flow-architecture-evolution`: "Is any process type relying on local state?"
- Lint candidate (structural): detect file writes outside `/tmp`, `/var/lib/<app>`, or declared volume mounts

---

### VII. Port Binding — Export services via port binding

**Current coverage**:
- `agents/api-designer.md` — API design (doesn't enforce port binding)
- `agents/multi-cloud-strategist.md` — service discovery, gateways

**Gap**: Port binding as a principle (service is self-contained, binds its own port, exports via HTTP) is not in any template. Applications relying on external web servers (Apache mod_php, IIS, Java EE app servers) violate this and AIWG doesn't flag it.

**Severity**: Medium. Modern apps typically do this correctly; legacy migrations are where it matters.

**Remediation**:
- Add section to `software-architecture-doc-template.md`: "Service Self-Containment" — does each service bind its own port? If not, justify
- ADR template for deviations (e.g. "we use Apache for reason X")

---

### VIII. Concurrency — Scale out via the process model

**Current coverage**:
- `agents/performance-engineer.md` — load testing, scaling
- `agents/multi-cloud-strategist.md` — autoscaling, service mesh

**Gap**: The concurrency *archetype model* (web, worker, scheduler, cron — each a distinct process type) is not formalized. Performance scaling is treated as an infrastructure concern, not a design principle.

**Severity**: Medium.

**Remediation**:
- Add section to `software-architecture-doc-template.md`: "Process Types" — list each process archetype (web, worker, scheduler, one-off) + scaling characteristics + concurrency limits
- Add to `performance-testing-strategy-template.md`: load tests per process type

---

### IX. Disposability — Maximize robustness with fast startup and graceful shutdown

**Current coverage**:
- `agents/reliability-engineer.md` — operational readiness, failure testing
- `templates/deployment/support-runbook-template.md` — operational procedures

**Gap**: **High**. Startup time, graceful SIGTERM handling, and safe shutdown under crash are not addressed in any template. "The app can die at any moment and resume cleanly" is a resilience fundamental not encoded in AIWG.

**Severity**: High. Undisposable processes break deployments (rolling restart dies), autoscaling (slow starts waste cost), and reliability (SIGKILL data loss).

**Remediation**:
- New rule: `rules/disposable-processes.md` — startup SLA < 10s, graceful SIGTERM handler required, work must be checkpointable
- Add "Disposability" section to `operational-readiness-checklist-template.md`: startup time measured, SIGTERM handling verified, crash recovery tested
- Add to `deployment-plan-template.md`: "Rolling Restart Strategy" section
- Lint candidate (structural): detect signal handlers in main process entry points; detect `close()`/`cleanup()` patterns

---

### X. Dev/Prod Parity — Keep dev/staging/prod similar

**Current coverage**:
- `templates/deployment/deployment-environment-template.md` — per-env config, access, monitoring
- `skills/build-poc/SKILL.md` — mentions production-like dependencies
- `skills/flow-inception-to-elaboration/SKILL.md` — lists environments

**Gap**: Environment parity is acknowledged but not enforced. No rule says "the same backing service technology (e.g. Postgres, not SQLite→Postgres) must be used in dev and prod." No checklist for tech-stack parity.

**Severity**: Medium. Dev/prod parity failures cause "works on my machine" incidents.

**Remediation**:
- Add "Tech Stack Parity Matrix" section to `deployment-environment-template.md`: table of backing service by environment showing identical tech
- Add security/quality gate check: "any tech stack substitution (dev vs prod) requires an ADR"
- Lint candidate: detect SQLite/in-memory DB usage paired with Postgres/production DB references

---

### XI. Logs — Treat logs as event streams

**Current coverage**:
- `agents/reliability-engineer.md` — monitoring, observability
- `agents/performance-engineer.md` — observability

**Gap**: **High**. No rule or template says "write logs to stdout, not files, and let the environment route them." Log file paths, rotation config, and per-app log management are not prohibited. Structured logging (JSON lines) is not required.

**Severity**: High. File-based logging breaks container/k8s log aggregation.

**Remediation**:
- New rule: `rules/logs-as-event-streams.md` — write to stdout/stderr, structured JSON preferred, no application-managed log files, let the environment route
- Add "Logging Architecture" section to `software-architecture-doc-template.md`: output destination, format (JSON), log levels, correlation IDs
- Lint candidate (structural): detect `FileHandler`, `RotatingFileHandler`, `logging.config.fileConfig` pointing at local paths
- Add to `operational-readiness-checklist-template.md`: "Are logs going to stdout? Is log format structured?"

---

### XII. Admin Processes — Run admin tasks as one-off processes

**Current coverage**:
- None dedicated

**Gap**: Migrations, data fixes, backups, and one-off scripts have no template. Where should they live? How are they invoked? How are they reviewed? AIWG is silent.

**Severity**: Medium. Ad-hoc admin scripts are a common source of production incidents.

**Remediation**:
- New template: `templates/deployment/admin-processes-template.md` — one-off task catalog, how each is invoked, who approves, how it's logged, how it's rolled back
- Add to `deployment-plan-template.md`: "Admin Tasks" section listing migrations/backfills required for this release
- Add to `change-control` flow: admin task requires same review level as application code

---

## Prioritized Remediation Plan

Based on severity and framework leverage, here is the recommended order:

### Priority 1: HIGH severity gaps (build immediately)

**#1. Factor VI — Stateless Processes**
- New rule: `rules/stateless-processes.md`
- Template addition: "Process State Model" in SAD
- Architecture review checklist item
- **Why first**: breaks everything downstream (scaling, disposability, logs)

**#2. Factor IX — Disposability**
- New rule: `rules/disposable-processes.md`
- Template addition: "Disposability" in operational-readiness-checklist
- Template addition: "Rolling Restart Strategy" in deployment-plan
- **Why second**: directly enables zero-downtime deploys

**#3. Factor XI — Logs as Event Streams**
- New rule: `rules/logs-as-event-streams.md`
- Template addition: "Logging Architecture" in SAD
- Checklist item in operational-readiness
- **Why third**: k8s/container reality requires this

### Priority 2: MEDIUM severity gaps (build next)

**#4. Factor III — Config in Environment** — new rule + template addition
**#5. Factor IV — Backing Services** — template addition + lint rule
**#6. Factor XII — Admin Processes** — new template
**#7. Factor VII — Port Binding** — template addition
**#8. Factor VIII — Concurrency Archetypes** — template addition
**#9. Factor X — Dev/Prod Parity** — template addition + gate check

### Priority 3: LOW severity (nice to have)

**#10. Factor I — Codebase** — documentation tweak
**#11. Factor II — Dependencies** — already good, optional lint polish

---

## SDLC Lint Ruleset Integration

Several factors produce *structurally verifiable* checks that fit the lint architecture (#810, #811). These are candidates for a new `sdlc-complete/lint/` ruleset:

| Rule ID | Factor | Check |
|---------|--------|-------|
| `sdlc/no-hardcoded-urls` | III, IV | Scan source for URL literals; flag unless in a config/constants file |
| `sdlc/dependency-manifest-present` | II | `package.json`/`requirements.txt`/`go.mod`/`Cargo.toml` exists at project root |
| `sdlc/no-wildcard-versions` | II | Dependency manifest has no `*` or `latest` for critical deps |
| `sdlc/no-local-log-files` | XI | No `FileHandler`/`RotatingFileHandler`/log path config |
| `sdlc/port-binding-declared` | VII | Service declares its port in config or env, not hardcoded |
| `sdlc/admin-tasks-documented` | XII | `admin-processes.md` exists if `migrations/` directory exists |
| `sdlc/env-var-documented` | III | Every `process.env.FOO` / `os.getenv("FOO")` appears in `.env.example` |
| `sdlc/stateful-writes-declared` | VI | File writes outside `/tmp` and declared volume mounts are flagged |
| `sdlc/sigterm-handler-present` | IX | Main process entry point registers SIGTERM handler (structural check) |
| `sdlc/tech-stack-parity` | X | Dev and prod backing service tech match (compare docker-compose to deployment manifests) |

These rules follow the same declarative YAML pattern used by the research-complete ruleset.

---

## Agent Prompt Updates

| Agent | Current focus | 12-factor prompt addition |
|-------|--------------|---------------------------|
| `architecture-designer` | Architecture, components, technology decisions | Explicitly enumerate process types, state model, backing service locator table, port binding, logging architecture |
| `deployment-manager` | Release readiness, execution, post-deploy | Verify disposability (startup/shutdown), rolling restart strategy, env var population across environments |
| `reliability-engineer` | SLO/SLI, failure testing | Explicitly validate graceful SIGTERM, stdout log stream routing, crash recovery |
| `security-architect` | Threat modeling, security gates | Extend token-security review to general config-in-env audit; flag any hardcoded environment-specific values |
| `performance-engineer` | Load testing, scaling | Explicit concurrency archetype testing (web, worker, scheduler each load-tested independently) |

---

## Phased Implementation Roadmap

### Phase A: Rules (fast, high leverage)
- [ ] `rules/stateless-processes.md`
- [ ] `rules/disposable-processes.md`
- [ ] `rules/logs-as-event-streams.md`
- [ ] `rules/config-in-environment.md`

### Phase B: Template additions (extend existing artifacts)
- [ ] SAD template: Process State Model, Process Types, Logging Architecture, Backing Services, Port Binding
- [ ] operational-readiness-checklist: Disposability, Logging, Tech Stack Parity sections
- [ ] deployment-plan: Rolling Restart, Admin Tasks, Deployments Table sections
- [ ] deployment-environment: Tech Stack Parity Matrix, Environment Variables table

### Phase C: New templates
- [ ] `templates/deployment/admin-processes-template.md`

### Phase D: SDLC lint ruleset
- [ ] Create `sdlc-complete/lint/ruleset.yaml`
- [ ] 10 declarative YAML rule files per the table above
- [ ] Wire into existing lint infrastructure (#810)

### Phase E: Agent prompt updates
- [ ] Update 5 agents with 12-factor-aware sections

**Gate**: Phase A unlocks Phase B (rules are referenced from templates). Phase C is independent. Phase D requires #811-style pattern (research-complete is the prototype). Phase E depends on A+B.

---

## Decision Points for Stakeholders

1. **Do we build a full `sdlc-complete/lint/` ruleset now (Phase D), or ship rules + templates first and defer lint to a follow-up?**
   Recommendation: defer lint. Rules + templates deliver immediate value; lint is optimization.

2. **Do we enforce 12-factor compliance as a phase gate (fail if SAD is missing Process State Model), or as guidance?**
   Recommendation: guidance initially, promote to gate after 2–3 projects validate the templates.

3. **Do we ship an opinionated stance on each factor, or note tradeoffs (e.g. stateful services are sometimes correct — event-sourced systems)?**
   Recommendation: opinionated default + ADR escape hatch for justified deviations.

---

## References

- **12factor.net** — https://12factor.net/ (the canonical source)
- **Issue #821** — this gap analysis
- **Issue #810** — lint architecture (consumes the structural rules from Phase D)
- **Issue #811** — research-complete lint ruleset (prototype for Phase D pattern)
- **CLAUDE.md** — contains token security rule (already addresses part of Factor III)
- **AIWG.md** — SDLC orchestration overview

## Files to Create/Modify (inventory)

**New files (rules)**:
- `agentic/code/frameworks/sdlc-complete/rules/stateless-processes.md`
- `agentic/code/frameworks/sdlc-complete/rules/disposable-processes.md`
- `agentic/code/frameworks/sdlc-complete/rules/logs-as-event-streams.md`
- `agentic/code/frameworks/sdlc-complete/rules/config-in-environment.md`

**New files (templates)**:
- `agentic/code/frameworks/sdlc-complete/templates/deployment/admin-processes-template.md`

**Modified files (templates)**:
- `agentic/code/frameworks/sdlc-complete/templates/analysis-design/software-architecture-doc-template.md`
- `agentic/code/frameworks/sdlc-complete/templates/deployment/deployment-plan-template.md`
- `agentic/code/frameworks/sdlc-complete/templates/deployment/deployment-environment-template.md`
- `agentic/code/frameworks/sdlc-complete/templates/deployment/operational-readiness-checklist-template.md`

**Modified files (agents)**:
- `agentic/code/frameworks/sdlc-complete/agents/architecture-designer.md`
- `agentic/code/frameworks/sdlc-complete/agents/deployment-manager.md`
- `agentic/code/frameworks/sdlc-complete/agents/reliability-engineer.md`
- `agentic/code/frameworks/sdlc-complete/agents/security-architect.md`
- `agentic/code/frameworks/sdlc-complete/agents/performance-engineer.md`

**New files (lint — Phase D, deferred)**:
- `agentic/code/frameworks/sdlc-complete/lint/ruleset.yaml`
- `agentic/code/frameworks/sdlc-complete/lint/*.yaml` (10 rules)
