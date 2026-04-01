# Simple Language Translations

Maps **non-obvious** natural language requests to AIWG skills, commands, rules, and workflows. Used by the NL router and by agents interpreting user intent.

**Design principle**: Claude Code natively matches primary phrases against skill `description:` fields. This document focuses on alternate expressions, domain jargon, abbreviations, and compound intents that Claude would not automatically resolve.

---

## SDLC Domain Terminology

| User Says | Meaning | Maps To |
|-----------|---------|---------|
| "LO" / "LOM" | Lifecycle Objective — Inception exit gate | `flow-gate-check inception` |
| "LA" / "ABM" | Lifecycle Architecture / Architecture Baseline Milestone | `flow-gate-check elaboration` |
| "IOC" | Initial Operational Capability — Construction exit gate | `flow-gate-check construction` |
| "PRM" | Product Release Milestone — Transition exit gate | `flow-gate-check transition` |
| "SAD" | Software Architecture Document | `orchestrate-project` / Architecture Designer agent |
| "ADR" | Architecture Decision Record | `tot-decide` |
| "RTM" | Requirements Traceability Matrix | `traceability-check` |
| "DOD" | Definition of Done — gate criteria | `gate-evaluation` |
| "NFR" | Non-Functional Requirement | Requirements Analyst agent |
| "RAG status" / "RED/AMBER/GREEN" | Risk dashboard summary | `risk-cycle` |
| "V&V matrix" | Verification & Validation coverage | `traceability-check` |
| "RACI for [X]" | Responsibility assignment | `approval-workflow` |

## Operations & Incident Shorthand

| User Says | Meaning | Maps To |
|-----------|---------|---------|
| "P0" / "P1" / "SEV1" / "SEV2" | Severity-based incident triage | `flow-incident-response` |
| "we got paged" | Production incident response | `incident-triage` |
| "war room" | Incident coordination setup | `flow-incident-response` |
| "postmortem [incident]" | Post-incident review | `flow-retrospective-cycle` |
| "ship it" | Deploy to production | `flow-deploy-to-production` |
| "burn it down" | Rollback workspace to clean state | `workspace-reset` |
| "clean the bench" | Purge working directory | `workspace-prune-working` |
| "mc start" / "mc dispatch" / "mc status" | Mission Control operations | `mission-control` |
| "background this" | Dispatch as background mission | `mission-control` |

## Security & Forensics Jargon

| User Says | Meaning | Maps To |
|-----------|---------|---------|
| "STRIDE [component]" | Threat model using STRIDE framework | `security-assessment` |
| "OWASP check" | OWASP Top 10 validation | `security-assessment` |
| "SAST" / "DAST" | Static/dynamic application security testing | `security-assessment` |
| "CVE scan" | Known vulnerability enumeration | `security-assessment` |
| "IOCs" / "indicators" | Indicator of compromise extraction | `ioc-extraction` |
| "STIX" / "STIX 2.1" | Structured threat intelligence output | `ioc-extraction` |
| "ATT&CK [technique]" / "MITRE [TID]" | Technique-specific threat hunt | `sigma-hunting` |
| "T1059" / "T1053" (etc.) | ATT&CK technique ID lookups | `sigma-hunting` |
| "vol3" / "volatility" | Volatility 3 memory analysis | `memory-forensics` |
| "LSASS" | Credential extraction analysis | `memory-forensics` |
| "chain of custody" | Forensic evidence handling | `evidence-preservation` |
| "bag and tag" | Evidence collection shorthand | `evidence-preservation` |
| "SBOM" | Software bill of materials analysis | `supply-chain-forensics` |
| "Falco" / "Tetragon" / "Tracee" | eBPF runtime monitoring tools | `container-forensics` |
| "CloudTrail" / "Activity Log" | Cloud provider audit log analysis | `cloud-forensics` |

## Testing & Quality Jargon

| User Says | Meaning | Maps To |
|-----------|---------|---------|
| "stryker" / "pitest" / "mutmut" | Tool-specific mutation testing | `mutation-test` |
| "are my tests catching bugs" | Test effectiveness check | `mutation-test` |
| "intermittent failures" / "CI keeps failing randomly" | Flaky test identification | `flaky-detect` |
| "red-green-refactor" | TDD cycle enforcement | `tdd-enforce` |
| "test first" | TDD mode activation | `tdd-enforce` |
| "orphan tests" | Tests without matching source | `test-sync` |
| "coverage holes" / "what's not tested" | Coverage gap analysis | `test-coverage` |
| "lcov" / "istanbul" / "c8" | Coverage tool-specific queries | `test-coverage` |
| "MCP tool testing" | Tool-level acceptance tests | `uat-mode` |
| "fixtures for [model]" / "faker data" | Test data factory generation | `generate-factory` |

## Writing & Voice Domain

| User Says | Meaning | Maps To |
|-----------|---------|---------|
| "sounds robotic" / "too AI-ish" / "sounds like ChatGPT" | AI pattern detection | `ai-pattern-detection` |
| "humanize this" | AI pattern remediation | `ai-pattern-detection` |
| "AI smell test" | Quick authenticity check | `ai-pattern-detection` |
| "make me sound like [reference]" | Reference-based voice creation | `voice-create` |
| "voice fingerprint" | Voice profile extraction from text | `voice-analyze` |
| "rewrite in [voice name]" | Voice transformation | `voice-apply` |
| "70/30 [voice A]/[voice B]" | Ratio-based voice blending | `voice-blend` |
| "SOUL.md" / "project identity" | Project soul/identity definition | `soul-create` |
| "soul score" | Soul quality metrics | `soul-validate` |
| "mode collapse" | RLHF pattern mitigation | `diversity-tuning` |

## Marketing Domain

| User Says | Meaning | Maps To |
|-----------|---------|---------|
| "brand police" | Brand guideline enforcement | `brand-compliance` |
| "on-brand check" | Brand consistency validation | `brand-compliance` |
| "launch checklist" / "pre-flight check" | Pre-launch validation | `qa-protocol` |
| "battle card" | Competitive comparison document | `competitive-intel` |
| "ICP" | Ideal Customer Profile | `audience-synthesis` |
| "buyer persona" | Audience persona creation | `audience-synthesis` |
| "KPIs" / "MQL" / "SQL" / "CAC" / "LTV" | Marketing metrics shorthand | `performance-digest` |
| "ETL [source] to [dest]" | Data pipeline creation | `data-pipeline` |

## Compound Intent (Multi-Skill Routing)

These phrases map to a sequence of skills or a compound workflow:

| User Says | Meaning | Skill Sequence |
|-----------|---------|----------------|
| "zero to construction" | Full Inception + Elaboration pipeline | `sdlc-accelerate` |
| "audit everything" | Security + brand + compliance sweep | `security-assessment` → `brand-compliance` → `flow-compliance-validation` |
| "is this release-ready" | Gate check + test coverage + security | `gate-evaluation` → `test-coverage` → `security-assessment` |
| "full retro" | Retrospective + risk update + learnings | `flow-retrospective-cycle` → `risk-cycle` → `cross-task-learner` |
| "harden the codebase" | Security audit + dependency scan + dead code | `security-audit` → `supply-chain-forensics` → `cleanup-audit` |
| "bootstrap and go" | Project scaffold + SDLC ramp-up | `aiwg use sdlc` → `sdlc-accelerate` |

## Disambiguation (Same Phrase, Different Skill)

These phrases route to different skills depending on context:

| User Says | Context | Maps To |
|-----------|---------|---------|
| "check coverage" | Testing context | `test-coverage` |
| "check coverage" | Requirements/traceability context | `traceability-check` |
| "what's blocking" | Project status context | `project-awareness` |
| "what's blocking" | Risk management context | `risk-cycle` |
| "validate this" | Configuration files | `config-validator` |
| "validate this" | Marketing asset | `qa-protocol` |
| "validate this" | SOUL.md file | `soul-validate` |
| "review" | Pull request context | `pr-review` |
| "review" | Multi-agent document review | `review-synthesis` |
| "review" | Security context | `security-assessment` |
| "scan" | Security context | `security-assessment` |
| "scan" | Log/forensics context | `log-analysis` |
| "scan" | Codebase health context | `codebase-health` |
| "sync" | Documentation context | `doc-sync` |
| "sync" | AIWG framework context | `aiwg-sync` |
| "sync" | Issue tracker context | `issue-auto-sync` |

## Clarification & Recovery Patterns

These activate rules rather than skills:

| User Says | Meaning | Rule Activated |
|-----------|---------|----------------|
| "re-read my instructions" | Instruction reparse | `instruction-comprehension` |
| "that's not what I asked" | Correction + reparse | `instruction-comprehension` |
| "I already told you" | Drift detection | `instruction-comprehension` |
| "don't guess, look it up" | Explicit research demand | `research-before-decision` |
| "investigate before you fix" | Root cause analysis | `research-before-decision` |
| "follow my instructions exactly" | Strict compliance demand | `instruction-comprehension` |

## Rule Activation Mapping

When these patterns are detected, the corresponding rules are activated in the agent's context:

| Pattern Category | Rule | Effect |
|-----------------|------|--------|
| Research keywords detected | `research-before-decision` | Agent must search/read before modifying |
| Clarification/correction keywords | `instruction-comprehension` | Agent must reparse original instructions |
| Code modification without prior search | `research-before-decision` | Agent is reminded to research first |
| User repeats same instruction | `instruction-comprehension` | Drift detection triggered |
| Multiple failed attempts at same action | `research-before-decision` | Whack-a-mole detection triggered |
| AIWG maintenance/sync/deploy keywords | `self-maintenance` | CLI-first principle enforced; pre-flight check reminded |
| Background orchestration keywords | `self-maintenance` | Mission Control pattern activated |

## References

- @agentic/code/addons/aiwg-utils/skills/nl-router/SKILL.md - NL router implementation
- @agentic/code/addons/aiwg-utils/rules/research-before-decision.md - Research rule
- @agentic/code/addons/aiwg-utils/rules/instruction-comprehension.md - Instruction rule
- @agentic/code/frameworks/sdlc-complete/rules/thought-protocol.md - Thought types
- @.claude/commands/address-issues.md - Issue-driven agent loop command
- @.claude/skills/issue-driven-al/SKILL.md - Issue-driven Al skill
- @agentic/code/frameworks/sdlc-complete/rules/self-maintenance.md - Self-maintenance rule
- @agentic/code/agents/aiwg-steward.md - AIWG Steward agent
