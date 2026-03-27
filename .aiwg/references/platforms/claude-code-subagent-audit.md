# Claude Code Subagent Type Audit

> Audit of AIWG subagent_type catalog against Claude Code built-in types.
> **Issue**: #572 | **Date**: 2026-03-27 | **Claude Code Version**: v2.1.33

---

## Summary

Claude Code's Agent tool exposes all available subagent_types as a flat list. This audit separates **built-in types** (shipped with Claude Code) from **AIWG-deployed agents** (loaded from `.claude/agents/`).

**Result**: 5 built-in types + ~170 AIWG agents = ~175 total subagent_types.

---

## 1. Claude Code Built-in Types (5)

These are hardcoded in Claude Code and available in every project, regardless of AIWG installation.

| Type | Case | Purpose | Tools Available |
|------|------|---------|-----------------|
| `general-purpose` | kebab | Flexible multi-step tasks, research, code search | All tools |
| `Explore` | PascalCase | Fast codebase exploration (find files, search code) | Read, Glob, Grep (no Edit, Write, Agent) |
| `Plan` | PascalCase | Implementation planning, architecture design | Read, Glob, Grep (no Edit, Write, Agent) |
| `claude-code-guide` | kebab | Answer questions about Claude Code features, Agent SDK, Claude API | Glob, Grep, Read, WebFetch, WebSearch |
| `statusline-setup` | kebab | Configure Claude Code status line setting | Read, Edit |

### Usage Patterns

- **`Explore`**: Use for quick codebase searches. Fastest option when you need to find files by pattern or search for keywords. Supports thoroughness levels: "quick", "medium", "very thorough".
- **`Plan`**: Use for designing implementation strategies. Returns step-by-step plans, identifies critical files, considers trade-offs. Read-only — cannot make changes.
- **`general-purpose`**: Fallback for complex multi-step tasks. Has access to all tools including Agent (can spawn sub-subagents). Most expensive option.
- **`claude-code-guide`**: Specialized for answering "How do I..." and "Does Claude support..." questions. Has web access for documentation lookups.
- **`statusline-setup`**: Niche — only for configuring the status line display. Rarely needed.

---

## 2. AIWG-Deployed Agents (~170)

These are loaded from `.claude/agents/*.md` at session start. Claude Code resolves them by both filename (kebab-case) and display name (from `name` frontmatter field).

### By Domain

#### Development & Architecture (35)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `architecture-designer` | opus | System architecture, technical decisions |
| `architecture-documenter` | opus | SAD, ADRs, technical diagrams |
| `api-designer` | sonnet | API contracts, interface design |
| `api-documenter` | sonnet | OpenAPI specs, SDK generation |
| `code-reviewer` | sonnet | Quality, security, performance reviews |
| `debugger` | sonnet | Error diagnosis, test failures |
| `frontend-specialist` | sonnet | UI architecture, web vitals, WCAG |
| `software-implementer` | sonnet | Production code with tests and docs |
| `react-expert` | sonnet | React 19+, Server Components |
| `django-expert` | sonnet | Django ORM, DRF, Celery |
| `spring-boot-expert` | sonnet | Spring Security, JPA, GraalVM |
| `legacy-modernizer` | opus | Refactoring, framework migration |
| `mobile-developer` | sonnet | React Native, Flutter, native |
| `blockchain-developer` | sonnet | Solidity, Solana, DeFi |
| `database-optimizer` | sonnet | Query optimization, indexing |
| `data-engineer` | sonnet | Spark, dbt, Airflow, streaming |
| `ai-ml-engineer` | sonnet | MLOps, training pipelines |
| `accessibility-specialist` | sonnet | WCAG 2.1, ARIA, keyboard nav |
| `performance-engineer` | sonnet | Profiling, caching, load testing |
| `technical-debt-analyst` | sonnet | Complexity metrics, refactoring ROI |
| `cost-optimizer` | sonnet | Cloud spend, build performance |
| `dead-code-analyzer` | sonnet | Unused code, orphaned files |
| `migration-planner` | sonnet | Framework upgrades, rollback strategies |
| `component-owner` | sonnet | Component health, roadmap |
| `domain-expert` | opus | Subject-matter insight, domain rules |
| `system-analyst` | sonnet | Requirements-to-technical bridge |
| `business-process-analyst` | sonnet | Process modeling, stakeholder mapping |
| `product-designer` | sonnet | UX flows, interface specs |
| `product-strategist` | sonnet | Product vision, outcome goals |
| `ux-lead` | sonnet | UX strategy, usability |
| `prompt-optimizer` | opus | Prompt engineering, AIWG principles |
| `writing-validator` | sonnet | AI pattern detection, authentic writing |
| `technical-researcher` | sonnet | Technical evaluation, API analysis |
| `technical-writer` | sonnet | Documentation clarity, consistency |
| `documentation-agent` | opus | Paper summaries, RAG, literature notes |

#### DevOps & Infrastructure (18)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `devops-engineer` | sonnet | CI/CD, IaC, deployment strategies |
| `cloud-architect` | opus | Multi-cloud design, IaC, cost optimization |
| `aws-specialist` | sonnet | EC2, Lambda, CloudFormation, Well-Architected |
| `azure-specialist` | sonnet | ARM, Functions, Cosmos DB, AKS |
| `gcp-specialist` | sonnet | Cloud Run, GKE, BigQuery, Vertex AI |
| `multi-cloud-strategist` | sonnet | Cross-cloud architecture, vendor lock-in |
| `kubernetes-expert` | sonnet | Cluster design, GitOps, service mesh |
| `build-engineer` | sonnet | Build automation, CI pipelines |
| `deployment-manager` | sonnet | Release planning, operational readiness |
| `integration-engineer` | sonnet | Build pipelines, branch integration |
| `environment-engineer` | sonnet | Process assets, tooling, automation |
| `configuration-manager` | sonnet | Version control, baselines, change processes |
| `reliability-engineer` | sonnet | SLO/SLI, capacity testing, ORR |
| `incident-responder` | sonnet | Production outages, post-mortems |
| `ops-inventory` | sonnet | Fleet inventory, host reconciliation |
| `ops-runbook-executor` | sonnet | Runbook execution, safety gates |
| `support-lead` | sonnet | Customer support readiness, knowledge management |
| `mcpsmith` | sonnet | Dynamic MCP server creation via Docker |

#### Security & Compliance (12)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `security-architect` | sonnet | Threat modeling, security requirements |
| `security-auditor` | sonnet | Vulnerability review, OWASP compliance |
| `security-gatekeeper` | sonnet | Security gate enforcement, pass/fail reports |
| `security-grounding-agent` | sonnet | OWASP/CWE knowledge injection |
| `compliance-checker` | sonnet | GDPR, SOC2, HIPAA, PCI-DSS |
| `compliance-grounding-agent` | sonnet | Regulatory gap verification |
| `privacy-officer` | sonnet | DPIA, data processing compliance |
| `legal-liaison` | sonnet | Legal/regulatory/contractual compliance |
| `technology-grounding-agent` | sonnet | API/framework claim verification |
| `performance-grounding-agent` | sonnet | Benchmarking knowledge injection |
| `laziness-detector` | sonnet | Anti-avoidance behavior detection |
| `prompt-reinforcement` | sonnet | Anti-laziness directive injection |

#### Testing & Quality (12)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `test-architect` | sonnet | Test strategy, coverage models |
| `test-engineer` | sonnet | Unit, integration, E2E test suites |
| `test-documenter` | sonnet | Test plans, strategies, cases |
| `mutation-analyst` | sonnet | Mutation testing, weak test identification |
| `regression-analyst` | sonnet | Version comparison, behavioral changes |
| `quality-agent` | sonnet | GRADE framework, FAIR compliance |
| `quality-assessor` | sonnet | Media quality scoring |
| `quality-controller` | sonnet | Marketing asset accuracy |
| `uat-planner` | sonnet | UAT plan design from MCP manifests |
| `uat-executor` | sonnet | UAT execution, pass/fail tracking |
| `ralph-verifier` | sonnet | Ralph loop completion validation |
| `progress-tracker` | sonnet | Iteration progress, regression detection |

#### SDLC Process (14)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `executive-orchestrator` | opus | Lifecycle direction, gate enforcement |
| `requirements-analyst` | sonnet | User stories, acceptance criteria |
| `requirements-reviewer` | sonnet | Completeness, consistency, risk |
| `requirements-documenter` | sonnet | Use cases, specs, NFRs |
| `intake-coordinator` | sonnet | Intake validation, agent assignments |
| `traceability-manager` | sonnet | Requirements-to-code-to-tests mapping |
| `metrics-analyst` | sonnet | Delivery and product metrics |
| `decision-matrix-expert` | sonnet | Data-driven trade-off facilitation |
| `raci-expert` | sonnet | Responsibility assignments |
| `vision-owner` | sonnet | Product vision coherence |
| `documentation-archivist` | sonnet | Working drafts, version history |
| `documentation-synthesizer` | opus | Multi-agent feedback synthesis |
| `context-librarian` | sonnet | Artifact index, digest building |
| `context-curator` | haiku | Context pre-filtering (Archetype 3) |

#### Forensics & Incident Response (13)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `forensics-orchestrator` | opus | Full investigation lifecycle |
| `triage-agent` | sonnet | Volatile data capture (RFC 3227) |
| `acquisition-agent` | sonnet | Evidence collection, chain of custody |
| `recon-agent` | sonnet | System profiling, topology discovery |
| `memory-analyst` | opus | Volatility 3 memory forensics |
| `log-analyst` | sonnet | Auth/syslog/journal analysis |
| `network-analyst` | sonnet | Traffic analysis, C2 detection |
| `container-analyst` | sonnet | Docker/K8s forensics, eBPF |
| `cloud-analyst` | sonnet | AWS/Azure/GCP audit log forensics |
| `persistence-hunter` | sonnet | Persistence mechanism detection (MITRE ATT&CK) |
| `ioc-analyst` | sonnet | IOC extraction, STIX 2.1 |
| `timeline-builder` | sonnet | Multi-source event correlation |
| `reporting-agent` | sonnet | Forensic report generation |

#### Marketing & Communications (30)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `creative-director` | opus | Creative vision, campaign concepts |
| `campaign-strategist` | opus | Campaign architecture, measurement |
| `campaign-orchestrator` | opus | Multi-channel coordination |
| `channel-strategist` | opus | Channel mix optimization |
| `content-strategist` | opus | Content ecosystems, editorial calendars |
| `brand-guardian` | opus | Brand guidelines enforcement |
| `positioning-specialist` | opus | Brand positioning, value propositions |
| `market-researcher` | opus | Competitive intelligence, audience research |
| `budget-planner` | opus | Marketing budgets, ROI tracking |
| `project-manager` | opus | Marketing project delivery |
| `content-writer` | sonnet | Blog posts, articles, whitepapers |
| `copywriter` | sonnet | Headlines, CTAs, channel-specific copy |
| `editor` | sonnet | Content refinement, brand consistency |
| `seo-specialist` | sonnet | SEO strategy, keyword research |
| `email-marketer` | sonnet | Email campaigns, automation sequences |
| `social-media-specialist` | sonnet | Platform-native social content |
| `pr-specialist` | sonnet | Press releases, media relations |
| `media-relations` | sonnet | Journalist relationships, interviews |
| `corporate-communications` | sonnet | Executive comms, investor relations |
| `internal-communications` | sonnet | Employee communications |
| `crisis-communications` | sonnet | Crisis response, reputational issues |
| `art-director` | sonnet | Visual concepts, layout design |
| `graphic-designer` | sonnet | Ads, infographics, presentations |
| `video-producer` | sonnet | Video production workflow |
| `scriptwriter` | sonnet | Video scripts, podcast outlines |
| `accessibility-checker` | sonnet | Marketing accessibility standards |
| `technical-marketing-writer` | sonnet | API guides, developer tutorials |
| `data-analyst` | sonnet | Marketing data analysis |
| `marketing-analyst` | sonnet | Performance data, trend insights |
| `attribution-specialist` | sonnet | Attribution models, channel effectiveness |

#### Research & Knowledge (10)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `discovery-agent` | sonnet | Academic database search, gap detection |
| `citation-agent` | sonnet | 9,000+ citation styles, bibliographies |
| `citation-verifier` | haiku | Hallucinated reference detection |
| `archival-agent` | sonnet | OAIS-compliant artifact packaging |
| `provenance-agent` | sonnet | W3C PROV tracking, lineage graphs |
| `provenance-manager` | haiku | Provenance validation, query |
| `workflow-agent` | sonnet | Multi-stage pipeline orchestration |
| `context-regenerator` | sonnet | Platform context file regeneration |
| `doc-analyst` | sonnet | Documentation analysis orchestrator |
| `documentation-agent` | opus | Paper summaries, RAG, Zettelkasten |

#### Media Curation (5)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `acquisition-manager` | sonnet | Media download orchestration |
| `completeness-tracker` | sonnet | Discography gap analysis |
| `discography-analyst` | sonnet | Artist catalog research |
| `metadata-curator` | sonnet | Metadata tagging, artwork embedding |
| `source-discoverer` | sonnet | Media source discovery, ranking |

#### AIWG Internal (10)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `aiwg-developer` | sonnet | AIWG addon/framework development |
| `aiwg-steward` | sonnet | AIWG CLI self-maintenance |
| `agentsmith` | sonnet | On-demand agent definition creation |
| `commandsmith` | sonnet | On-demand slash command creation |
| `skillsmith` | sonnet | On-demand skill definition creation |
| `skill-architect` | sonnet | Skill design orchestration |
| `toolsmith` | sonnet | Automation tooling, developer experience |
| `toolsmith-dynamic` | sonnet | Dynamic shell/OS tool creation |
| `toolsmith-provider` | sonnet | Platform-aware tool specifications |
| `mc-conductor` | sonnet | Mission Control orchestration |

#### Recovery & Loop (4)

| Agent | Model | Key Capability |
|-------|-------|----------------|
| `ralph-loop` | opus | Iterative task loop orchestration |
| `ralph-verifier` | sonnet | Loop completion validation |
| `recovery-orchestrator` | opus | PAUSE-DIAGNOSE-ADAPT-RETRY-ESCALATE |
| `self-debug` | sonnet | Agent failure diagnosis and recovery |
| `rlm-agent` | opus | Recursive decomposition for long-context |
| `consortium-coordinator` | opus | Multi-agent consensus decisions |
| `content-diversifier` | sonnet | RLHF mode collapse prevention |

---

## 3. Naming Conflict Analysis

**No conflicts found.** Built-in types use either PascalCase (`Explore`, `Plan`) or unique kebab-case names (`general-purpose`, `claude-code-guide`, `statusline-setup`) that do not collide with any AIWG agent filename.

Claude Code resolves AIWG agents by both:
- **Filename** (kebab-case): `architecture-designer`
- **Display name** (from `name` field): `Architecture Designer`

Both forms work as `subagent_type` values.

---

## 4. Recommendations

### 4.1 Fix Reference Doc Errors

- **Remove** `Bash` from built-in types table (section 3.5) — no such type exists
- **Add** `claude-code-guide` and `statusline-setup` to built-in types table
- **Add** usage guidance for each built-in type

### 4.2 Leverage Built-in Types

| Built-in | Current AIWG Usage | Recommendation |
|----------|-------------------|----------------|
| `Explore` | Used in agent tool restrictions (`Task(Explore)`) | Continue using. Document as preferred for quick searches. |
| `Plan` | Underutilized | Use for pre-implementation planning in flow commands. Lightweight alternative to spawning full architecture-designer. |
| `general-purpose` | Used as default | Continue as fallback. Document that this is the most expensive option. |
| `claude-code-guide` | Not used | Leverage for AIWG help workflows and troubleshooting guidance. |
| `statusline-setup` | Not used | Low value for AIWG. No action needed. |

### 4.3 Agent Fallback Chains

AIWG agents should define fallback chains for portability:

```yaml
# Example: architecture-designer fallback
fallback_chain:
  - architecture-designer    # AIWG agent (if available)
  - Plan                     # Built-in (always available, read-only)
  - general-purpose          # Built-in (always available, full tools)
```

Recommended fallback mappings:

| AIWG Agent Category | Primary Fallback | Secondary Fallback |
|--------------------|-----------------|-------------------|
| Research/analysis agents | `Explore` | `general-purpose` |
| Planning/design agents | `Plan` | `general-purpose` |
| Implementation agents | `general-purpose` | — |
| Documentation agents | `general-purpose` | — |

### 4.4 Model Distribution

Current AIWG agent model distribution:

| Model | Count | Percentage | Typical Use |
|-------|-------|-----------|-------------|
| sonnet | ~140 | ~82% | Standard tasks, implementation |
| opus | ~25 | ~15% | Complex reasoning, architecture, orchestration |
| haiku | ~5 | ~3% | Fast validation, pre-filtering |

This distribution aligns well with cost optimization — opus reserved for tasks requiring deep reasoning.

---

## 5. Doc Corrections Required

### Section 3.5 (Built-in Agent Types)

**Before** (incorrect):
```
| `Explore` | Fast codebase exploration | Read, Glob, Grep |
| `Plan` | Implementation planning | Read, Glob, Grep |
| `Bash` | Command execution | Bash |
| `general-purpose` | Flexible multi-step tasks | All tools |
```

**After** (corrected):
```
| `general-purpose` | Flexible multi-step tasks | All tools |
| `Explore` | Fast codebase exploration | Read, Glob, Grep (no Edit, Write, Agent) |
| `Plan` | Implementation planning | Read, Glob, Grep (no Edit, Write, Agent) |
| `claude-code-guide` | Claude Code/SDK/API help | Glob, Grep, Read, WebFetch, WebSearch |
| `statusline-setup` | Status line configuration | Read, Edit |
```

---

## References

- Issue: #572
- Parent issue: #560
- Reference doc: `.aiwg/references/platforms/claude-code.md`
- Agent definitions: `.claude/agents/`
