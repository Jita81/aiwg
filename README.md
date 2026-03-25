<div align="center">

# AIWG

**Multi-agent AI framework for Claude Code, Copilot, Cursor, Warp, and 4 more platforms**

162 agents, 47 CLI commands, 86 skills, 5 frameworks, 20 addons. SDLC workflows, digital forensics, research management, marketing operations, and media curation — all deployable with one command.

```bash
npm i -g aiwg        # install globally
aiwg use sdlc        # deploy SDLC framework
```

[![npm version](https://img.shields.io/npm/v/aiwg/latest?label=npm&color=CB3837&logo=npm&style=flat-square)](https://www.npmjs.com/package/aiwg)
[![npm downloads](https://img.shields.io/npm/dm/aiwg?color=CB3837&logo=npm&style=flat-square)](https://www.npmjs.com/package/aiwg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/jmagly/aiwg?style=flat-square)](https://github.com/jmagly/aiwg/stargazers)
[![Node Version](https://img.shields.io/badge/node-%E2%89%A518.0.0-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![8 Platforms](https://img.shields.io/badge/Platforms-8-purple?style=flat-square)](#-platform-support)

[**Get Started**](#-quick-start) · [**Features**](#-what-you-get) · [**Agents**](#agents-162) · [**CLI Reference**](#-cli-reference-47-commands) · [**Documentation**](#-documentation) · [**Community**](#-community--support)

[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white&style=flat-square)](https://discord.gg/BuAusFMxdA)
[![Telegram](https://img.shields.io/badge/Telegram-Join-26A5E4?logo=telegram&logoColor=white&style=flat-square)](https://t.me/+oJg9w2lE6A5lOGFh)

</div>

---

## What AIWG Is

AIWG is a cognitive architecture that gives AI coding assistants structured memory, multi-agent ensemble validation, and closed-loop self-correction. It deploys specialized agents, workflow commands, enforcement rules, and artifact templates to any of 8 AI platforms with a single CLI command.

Unlike prompt libraries or ad-hoc workflows, AIWG implements research-backed patterns from cognitive science (Miller 1956, Sweller 1988), multi-agent systems (Jacobs et al. 1991, MetaGPT, AutoGen), and software engineering (Cooper's stage-gate, FAIR Principles, W3C PROV). The system addresses the hard problems in AI-augmented development: recovering from failures, maintaining context across sessions, preventing hallucinated citations, and ensuring reproducible workflows.

```
User intent → AIWG CLI → Deploy agents + rules + templates → AI platform
                │                                                │
                ▼                                                ▼
         "aiwg use sdlc"                              Claude Code / Copilot /
                │                                     Cursor / Warp / Factory /
                ▼                                     OpenCode / Codex / Windsurf
         ┌──────────────┐
         │ 162 Agents   │  Specialized AI personas with domain expertise
         │ 47 Commands  │  CLI + slash commands for workflow automation
         │ 86 Skills    │  Natural language workflow triggers
         │ 35 Rules     │  Enforcement patterns (security, quality, anti-laziness)
         │ 366 Templates│  SDLC artifact templates with progressive disclosure
         └──────────────┘
                │
                ▼
         .aiwg/ artifacts ← Persistent project memory across sessions
```

---

## How It Works

AIWG orchestrates multi-agent workflows where specialized agents collaborate on complex tasks:

```
You: "transition to elaboration phase"

AIWG: [Step 1] Requirements Analyst   → Analyze vision document, generate use case briefs
      [Step 2] Architecture Designer  → Baseline architecture, identify technical risks     } parallel
      [Step 3] Security Architect     → Threat model, security requirements                 }
      [Step 4] Documentation Synth.   → Merge reviews into Architecture Baseline Milestone
      [Step 5] Human Gate             → GO / CONDITIONAL_GO / NO_GO decision
      [Step 6] → Next phase or iterate
```

The orchestration pattern: **Primary Author → Parallel Reviewers → Synthesizer → Human Gate → Archive**. Agents run in parallel where possible, with human-in-the-loop checkpoints at phase transitions.

---

## Features

- **162 specialized agents** — domain experts across testing, security, architecture, DevOps, cloud, frontend, backend, data engineering, documentation, and more
- **47 CLI commands** — framework deployment, project scaffolding, iterative execution, metrics, reproducibility validation
- **86 workflow skills** — natural language triggers for regression testing, forensics, voice profiles, quality gates, and CI/CD integration
- **35 enforcement rules** — anti-laziness detection, token security, citation integrity, executable feedback, failure mitigation across 6 LLM archetypes
- **366 artifact templates** — progressive disclosure templates for requirements, architecture, testing, security, deployment, and more
- **8 platform support** — deploy to Claude Code, Copilot, Cursor, Warp, Factory AI, OpenCode, Codex, and Windsurf
- **5 complete frameworks** — SDLC, Digital Forensics, Marketing Operations, Research Management, Media Curation
- **20 addons** — RLM recursive decomposition, voice profiles, testing quality, mutation testing, UAT automation, and more
- **Ralph Loop** — iterative task execution with automatic error recovery and crash resilience (6-8 hour sessions)
- **RLM addon** — recursive context decomposition for processing 10M+ tokens via sub-agent delegation
- **YAML metalanguage** — declarative schema-validated workflow definitions (JSON Schema 2020-12)
- **MCP server** — Model Context Protocol integration for tool-based AI workflows
- **Bidirectional traceability** — @-mention system linking requirements → architecture → code → tests
- **FAIR-aligned artifacts** — W3C PROV provenance, GRADE quality assessment, persistent REF-XXX identifiers
- **Reproducibility validation** — deterministic execution modes, checkpoints, configuration snapshots

---

## Quick Start

> **Prerequisites:** Node.js >=18.0.0 and an AI platform (Claude Code, GitHub Copilot, Cursor, Warp Terminal, or others). See [Prerequisites Guide](docs/getting-started/prerequisites.md) for details.

### Install & Deploy

```bash
# Install globally
npm install -g aiwg

# Deploy to your project
cd your-project
aiwg use sdlc              # Full SDLC framework (98 agents, 23 rules, 150+ templates)
aiwg use forensics         # Digital forensics & incident response (13 agents, 10 skills)
aiwg use marketing         # Marketing operations (37 agents, 87+ templates)
aiwg use media-curator     # Media archive management (6 agents, 9 commands)
aiwg use research          # Research workflow automation (8 agents, 8-stage pipeline)
aiwg use rlm               # RLM addon (recursive context decomposition)
aiwg use all               # Everything

# Or scaffold a new project
aiwg new my-project

# Check installation health
aiwg doctor
```

### Claude Code Plugin (Alternative)

```bash
/plugin marketplace add jmagly/ai-writing-guide
/plugin install sdlc@aiwg
```

### Multi-Platform Deployment

```bash
aiwg use sdlc                          # Claude Code (default)
aiwg use sdlc --provider copilot       # GitHub Copilot
aiwg use sdlc --provider cursor        # Cursor
aiwg use sdlc --provider warp          # Warp Terminal
aiwg use sdlc --provider factory       # Factory AI
aiwg use sdlc --provider opencode      # OpenCode
aiwg use sdlc --provider openai        # OpenAI/Codex
aiwg use sdlc --provider windsurf      # Windsurf
```

---

## What You Get

### Frameworks (5)

| Framework | Agents | Templates | What It Does |
|-----------|--------|-----------|--------------|
| **[SDLC Complete](agentic/code/frameworks/sdlc-complete/)** | 98 | 150+ | Full software development lifecycle — Inception through Production with multi-agent orchestration, quality gates, and DORA metrics |
| **[Forensics Complete](agentic/code/frameworks/forensics-complete/)** | 13 | 30+ | Digital forensics and incident response — evidence acquisition, timeline reconstruction, IOC extraction, Sigma rule hunting. NIST SP 800-86, MITRE ATT&CK, STIX 2.1 |
| **[Media/Marketing Kit](agentic/code/frameworks/media-marketing-kit/)** | 37 | 87+ | End-to-end marketing operations — strategy, content creation, campaign management, brand compliance, analytics, and reporting |
| **[Media Curator](agentic/code/frameworks/media-curator/)** | 6 | 15+ | Intelligent media archive management — discography analysis, source discovery, quality filtering, metadata curation, multi-platform export (Plex, Jellyfin, MPD) |
| **[Research Complete](agentic/code/frameworks/research-complete/)** | 8 | 25+ | Academic research automation — paper discovery, citation management, RAG-based summarization, GRADE quality scoring, FAIR compliance, W3C PROV provenance |

### Addons (20)

| Addon | What It Does |
|-------|--------------|
| **[RLM](agentic/code/addons/rlm/)** | Recursive context decomposition — process 10M+ tokens via sub-agent delegation with parallel fan-out |
| **[Writing Quality](agentic/code/addons/writing-quality/)** | Content validation, AI pattern detection, authentic voice enforcement |
| **[Testing Quality](agentic/code/addons/testing-quality/)** | TDD enforcement, mutation testing, flaky test detection and repair |
| **[Voice Framework](agentic/code/addons/voice-framework/)** | 4 built-in voice profiles (technical-authority, friendly-explainer, executive-brief, casual-conversational) with create/blend/apply skills |
| **[UAT-MCP Toolkit](agentic/code/addons/uat-mcp/)** | User acceptance testing with MCP-powered test execution, coverage tracking, and regression detection |
| **[AIWG Evals](agentic/code/addons/aiwg-evals/)** | Agent evaluation framework — archetype resistance testing (Roig 2025), performance benchmarks, quality scoring |
| **[Ralph](agentic/code/addons/ralph/)** | Iterative task execution engine — automatic error recovery, crash resilience, completion tracking |
| **[Security](agentic/code/addons/security/)** | Security testing, vulnerability scanning, SAST integration, compliance validation |
| **[Context Curator](agentic/code/addons/context-curator/)** | Context pre-filtering to remove distractors — production-grade agent reliability |
| **[Verbalized Sampling](agentic/code/addons/verbalized-sampling/)** | Probability distribution prompting — 1.6-2.1x output diversity improvement |
| **[Guided Implementation](agentic/code/addons/guided-implementation/)** | Bounded iteration control for issue-to-code automation |
| **[Skill Factory](agentic/code/addons/skill-factory/)** | Dynamic skill generation and packaging at runtime |
| **[Doc Intelligence](agentic/code/addons/doc-intelligence/)** | Document analysis, PDF extraction, documentation site scraping |
| **[Color Palette](agentic/code/addons/color-palette/)** | WCAG-compliant color palette generation with trend research |
| **[Auto Memory](agentic/code/addons/auto-memory/)** | Automatic memory seed templates for new project context initialization |
| **[Agent Persistence](agentic/code/addons/agent-persistence/)** | Agent state management for session continuity |
| **[AIWG Hooks](agentic/code/addons/aiwg-hooks/)** | Lifecycle event handlers — pre-session, post-write, workflow tracing |
| **[AIWG Utils](agentic/code/addons/aiwg-utils/)** | Core meta-utilities (auto-installed with any framework) |
| **[Droid Bridge](agentic/code/addons/droid-bridge/)** | Factory Droid orchestration — multi-platform agent bridge |
| **[Star Prompt](agentic/code/addons/star-prompt/)** | Repository star prompt for success celebration |

---

### Agents (162)

Specialized AI personas deployed to your platform with defined tools, responsibilities, and operating rhythms.

#### SDLC Agents (98)

| Domain | Agents | Examples |
|--------|--------|---------|
| **Testing & Quality** | 11 | Test Engineer, Test Architect, Mutation Analyst, Regression Analyst, Laziness Detector, Reliability Engineer |
| **Security & Compliance** | 9 | Security Auditor, Security Architect, Compliance Checker, Privacy Officer, Citation Verifier |
| **Architecture & Design** | 12 | Architecture Designer, API Designer, Cloud Architect, System Analyst, Product Designer, Decision Matrix Expert |
| **DevOps & Cloud** | 8 | AWS Specialist, Azure Specialist, GCP Specialist, Kubernetes Expert, DevOps Engineer, Multi-Cloud Strategist |
| **Backend & Data** | 10 | Django Expert, Spring Boot Expert, Data Engineer, Database Optimizer, Software Implementer, Incident Responder |
| **Frontend & Mobile** | 6 | React Expert, Frontend Specialist, Mobile Developer, Accessibility Specialist, UX Lead |
| **AI/ML & Performance** | 5 | AI/ML Engineer, Performance Engineer, Cost Optimizer, Metrics Analyst |
| **Code Quality** | 11 | Code Reviewer, Debugger, Dead Code Analyzer, Technical Debt Analyst, Legacy Modernizer |
| **Documentation** | 7 | Technical Writer, Documentation Synthesizer, Documentation Archivist, Context Librarian |
| **Requirements & Planning** | 7 | Requirements Analyst, Requirements Reviewer, Intake Coordinator, RACI Expert |
| **Agent/Tool Smiths** | 9 | AgentSmith, CommandSmith, MCPSmith, SkillSmith, ToolSmith |
| **Governance & Meta** | 3 | Executive Orchestrator, Recovery Orchestrator, Migration Planner |

#### Forensics Agents (13)

| Agent | What It Does |
|-------|-------------|
| Forensics Orchestrator | Coordinates full investigation lifecycle from scoping through reporting |
| Triage Agent | Quick volatile data capture following RFC 3227 volatility order |
| Acquisition Agent | Evidence collection with chain of custody and SHA-256 hash verification |
| Log Analyst | Auth.log, syslog, journal, and application log analysis for brute force, privilege escalation, lateral movement |
| Persistence Hunter | Sweeps cron, systemd, SSH keys, LD_PRELOAD, PAM modules, kernel modules — maps to MITRE ATT&CK |
| Container Analyst | Docker, containerd, Kubernetes forensics — privilege escalation, container escapes, eBPF monitoring |
| Network Analyst | Connection state, DNS, traffic patterns — beaconing, C2, data exfiltration detection |
| Memory Analyst | Volatility 3 memory forensics — process analysis, rootkit detection, credential extraction |
| Cloud Analyst | AWS/Azure/GCP audit logs, IAM review, network flows, API activity anomaly detection |
| Timeline Builder | Multi-source event correlation — chronological incident timelines with attribution |
| IOC Analyst | IOC extraction, enrichment, STIX 2.1 formatting — actionable IOC register |
| Recon Agent | Target reconnaissance — system topology, services, users, network baselines |
| Reporting Agent | Structured forensic reports — executive summary, technical findings, timeline, remediation |

#### Marketing Agents (37)

| Domain | Agents |
|--------|--------|
| **Strategy** | Campaign Strategist, Brand Guardian, Positioning Specialist, Market Researcher, Content Strategist, Channel Strategist |
| **Creation** | Copywriter, Content Writer, Email Marketer, Social Media Specialist, SEO Specialist, Graphic Designer, Art Director |
| **Management** | Campaign Orchestrator, Production Coordinator, Traffic Manager, Asset Manager, Workflow Coordinator |
| **Analytics** | Marketing Analyst, Data Analyst, Attribution Specialist, Reporting Specialist, Budget Planner |
| **Communications** | PR Specialist, Crisis Communications, Corporate Communications, Internal Communications, Media Relations |

#### Research Agents (8)

Discovery Agent, Acquisition Agent, Documentation Agent, Citation Agent, Quality Agent, Archival Agent, Provenance Agent, Workflow Agent

#### Media Curator Agents (6)

Discography Analyst, Source Discoverer, Acquisition Manager, Quality Assessor, Metadata Curator, Completeness Tracker

---

### Rules (35)

Enforcement patterns that prevent common AI failure modes. Rules deploy automatically with their framework.

#### Core Rules (10) — Always Active

| Rule | Severity | What It Enforces |
|------|----------|-----------------|
| `no-attribution` | CRITICAL | AI tools are tools — never add attribution to commits, PRs, docs, or code |
| `token-security` | CRITICAL | Never hard-code tokens; use heredoc pattern for scoped lifetime; file permissions 600 |
| `versioning` | CRITICAL | CalVer YYYY.M.PATCH with NO leading zeros; npm rejects leading zeros |
| `citation-policy` | CRITICAL | Never fabricate citations, DOIs, or URLs; only cite verified sources; GRADE-appropriate hedging |
| `anti-laziness` | HIGH | Never delete tests to pass, skip tests, remove features, or weaken assertions; escalate after 3 failures |
| `executable-feedback` | HIGH | Execute tests before returning code; track execution history; max 3 retries with root cause analysis |
| `failure-mitigation` | HIGH | Detect and recover from 6 LLM failure archetypes: hallucination, context loss, instruction drift, safety, technical, consistency |
| `research-before-decision` | HIGH | Research codebase before acting: IDENTIFY → SEARCH → EXTRACT → REASON → ACT → VERIFY |
| `instruction-comprehension` | HIGH | Fully parse all instructions before acting; track multi-part requests to completion |
| `subagent-scoping` | HIGH | One focused task per subagent; <20% context budget; no delegation chains deeper than 2 levels |

#### SDLC Rules (23) — Active with Framework

Actionable feedback, mention wiring, HITL gates, agent fallback, provenance tracking, TAO loop, reproducibility validation, SDLC orchestration, agent-friendly code, agent generation guardrails, artifact discovery, HITL patterns, human gate display, thought protocol, reasoning sections, few-shot examples, best output selection, reproducibility, progressive disclosure, conversable agent interface, auto-reply chains, criticality panel sizing, qualified references.

#### Research Rules (2) — Active with Research

Research metadata (FAIR-compliant YAML frontmatter), index generation (auto-generated INDEX.md per FAIR F4).

---

### Skills (86)

Natural language workflow triggers. Say "what's the project status?" and the `project-awareness` skill activates.

| Category | Skills | Examples |
|----------|--------|---------|
| **Regression Testing** | 12 | regression-check, regression-baseline, regression-bisect, regression-performance, regression-api-contract, regression-cicd-hooks, regression-learning |
| **Voice & Writing** | 6 | voice-create, voice-analyze, voice-apply, voice-blend, ai-pattern-detection, brand-compliance |
| **Testing & Quality** | 8 | auto-test-execution, test-coverage, test-sync, mutation-test, flaky-detect, flaky-fix, tdd-enforce, qa-protocol |
| **Forensics & Security** | 8 | linux-forensics, memory-forensics, cloud-forensics, container-forensics, sigma-hunting, log-analysis, ioc-extraction, supply-chain-forensics |
| **SDLC & Workflow** | 10 | sdlc-accelerate, sdlc-reports, gate-evaluation, approval-workflow, iteration-control, risk-cycle, parallel-dispatch, decision-support |
| **Documentation** | 6 | doc-sync, doc-scraper, doc-splitter, llms-txt-support, pdf-extractor, source-unifier |
| **Artifacts & Traceability** | 6 | artifact-orchestration, artifact-metadata, artifact-lookup, traceability-check, claims-validator, citation-guard |
| **Research** | 2 | grade-on-ingest, auto-provenance |
| **Infrastructure** | 5 | config-validator, template-engine, code-chunker, decompose-file, workspace-health |
| **Iteration** | 4 | ralph-loop, issue-driven-ralph, cross-task-learner, reflection-injection |
| **Other** | 19 | performance-digest, competitive-intel, audience-synthesis, skill-builder, skill-enhancer, skill-packager, quality-checker, nl-router, tot-exploration, and more |

---

## Framework Deep Dives

### SDLC Complete — Full Software Development Lifecycle

The SDLC framework implements a phase-gated development lifecycle with 98 specialized agents, 23 enforcement rules, and 150+ artifact templates. Natural language commands drive phase transitions with automated quality gates.

```
 ┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐    ┌────────────┐
 │ CONCEPT  │───▶│  INCEPTION  │───▶│ ELABORATION  │───▶│CONSTRUCTION│───▶│ TRANSITION │
 │          │    │             │    │              │    │            │    │            │
 │ Intake   │    │ Vision      │    │ Architecture │    │ Code       │    │ Deploy     │
 │ Wizard   │    │ Requirements│    │ Risk Retire  │    │ Test       │    │ Hypercare  │
 │ Solution │    │ Stakeholder │    │ Prototype    │    │ Review     │    │ Handoff    │
 │ Profile  │    │ Analysis    │    │ API Design   │    │ Iterate    │    │ Knowledge  │
 └──────────┘    └──────┬──────┘    └──────┬───────┘    └─────┬──────┘    └────────────┘
                        │                  │                   │
                     ┌──▼──┐            ┌──▼──┐            ┌──▼──┐
                     │ LOM │            │ ABM │            │ IOC │    ← Quality Gates
                     │Gate │            │Gate │            │Gate │
                     └─────┘            └─────┘            └─────┘

 LOM = Lifecycle Objectives Milestone    ABM = Architecture Baseline Milestone
 IOC = Initial Operational Capability
```

**SDLC Flow Commands (24):**

| Command | Phase | What It Does |
|---------|-------|-------------|
| `/intake-wizard` | Concept | Generate project intake form from natural language description |
| `/intake-start` | Concept→Inception | Validate intake, kick off with agent assignments |
| `/intake-from-codebase` | Concept | Scan existing codebase, generate intake from analysis |
| `/flow-concept-to-inception` | Concept→Inception | Phase transition with intake validation and vision alignment |
| `/flow-inception-to-elaboration` | Inception→Elaboration | Architecture baselining and risk retirement |
| `/flow-elaboration-to-construction` | Elaboration→Construction | Iteration planning, team scaling, full-scale development |
| `/flow-construction-to-transition` | Construction→Transition | IOC validation, production deployment, operational handover |
| `/flow-discovery-track` | Any | Prepare validated requirements one iteration ahead of delivery |
| `/flow-delivery-track` | Any | Test-driven development, quality gates, iteration assessment |
| `/flow-iteration-dual-track` | Any | Synchronized Discovery + Delivery workflows |
| `/flow-deploy-to-production` | Transition | Strategy selection, validation, automated rollback, regression gates |
| `/flow-incident-response` | Operations | Triage, escalation, resolution, post-incident review (ITIL) |
| `/flow-security-review-cycle` | Any | Continuous security validation, threat modeling, vulnerability management |
| `/flow-performance-optimization` | Any | Baseline, bottleneck ID, optimization, load testing, SLO validation |
| `/flow-retrospective-cycle` | Any | Structured feedback, improvement tracking, action items |
| `/flow-change-control` | Any | Baseline management, impact assessment, CCB review, communication |
| `/flow-risk-management-cycle` | Any | Continuous risk identification, assessment, tracking, retirement |
| `/flow-compliance-validation` | Any | Requirements mapping, audit evidence, gap analysis, attestation |
| `/flow-knowledge-transfer` | Transition | Assessment, documentation, shadowing, validation, handover |
| `/flow-team-onboarding` | Any | Pre-boarding, training, buddy assignment, 30/60/90 day check-ins |
| `/flow-hypercare-monitoring` | Transition | 24/7 support, SLO tracking, rapid issue response |
| `/flow-gate-check` | Any | Multi-agent phase gate validation with comprehensive reporting |
| `/flow-handoff-checklist` | Any | Handoff validation between phases and tracks |
| `/flow-guided-implementation` | Construction | Bounded iteration with issue-to-code automation |

**SDLC Accelerate — Idea to Construction-Ready in One Command:**

```bash
# From a description
aiwg sdlc-accelerate "AI-powered code review tool with GitHub integration"

# From existing codebase
aiwg sdlc-accelerate --from-codebase .

# Resume interrupted pipeline
aiwg sdlc-accelerate --resume
```

Generates intake form, vision document, use cases, architecture baseline, risk register, test strategy, and deployment plan — all with human approval gates between phases.

**Dual-Track Iteration Model:**

```
        ┌─────────────────────────────────────────────────┐
        │                ITERATION N                       │
        │                                                  │
        │  Discovery Track          Delivery Track         │
        │  (Next iteration)         (Current iteration)    │
        │                                                  │
        │  ┌─────────────┐          ┌──────────────┐      │
        │  │ Requirements│          │ Implement    │      │
        │  │ Research    │          │ Test         │      │
        │  │ Design      │          │ Review       │      │
        │  │ Validate    │          │ Deploy       │      │
        │  └─────┬───────┘          └──────┬───────┘      │
        │        │                         │               │
        │        └────────────┬────────────┘               │
        │                     │                            │
        │              ┌──────▼──────┐                     │
        │              │ Iteration   │                     │
        │              │ Assessment  │                     │
        │              └─────────────┘                     │
        └─────────────────────────────────────────────────┘
```

**Metrics & Quality Tracking:**

| Metric Category | Metrics Tracked |
|-----------------|-----------------|
| **DORA** (4) | Deployment Frequency, Lead Time, Change Failure Rate, MTTR |
| **Velocity** (3) | Story Points, Cycle Time, Throughput |
| **Flow** (3) | WIP Limits, Flow Efficiency, Blocked Items |
| **Quality** (13) | Test Coverage (4), Defect Metrics (4), Code Quality (3), Technical Debt (2) |
| **Operational** (16) | SLO/SLI (5), Infrastructure (4), Incidents (4), Cost (3) |

### Forensics Complete — Digital Forensics & Incident Response

Full DFIR investigation workflow following NIST SP 800-86, with MITRE ATT&CK mapping and Sigma rule hunting.

```
 ┌──────────┐    ┌──────────┐    ┌────────────┐    ┌──────────┐    ┌──────────┐
 │  SCOPE   │───▶│  TRIAGE  │───▶│  ACQUIRE   │───▶│ ANALYZE  │───▶│  REPORT  │
 │          │    │          │    │            │    │          │    │          │
 │ Profile  │    │ Volatile │    │ Evidence   │    │ Log      │    │ Executive│
 │ target   │    │ data     │    │ collection │    │ Timeline │    │ summary  │
 │ system   │    │ capture  │    │ Chain of   │    │ IOC      │    │ Findings │
 │          │    │ RFC 3227 │    │ custody    │    │ Sigma    │    │ Timeline │
 └──────────┘    └──────────┘    └────────────┘    └──────────┘    └──────────┘
                                       │
                                  SHA-256 hash
                                  verification
```

**Investigation Commands:**

```bash
/forensics-profile          # Build target system profile via SSH
/forensics-triage           # Quick triage following RFC 3227 volatility order
/forensics-acquire          # Evidence acquisition with chain of custody
/forensics-investigate      # Full multi-agent investigation workflow
/forensics-timeline         # Build correlated event timeline
/forensics-hunt             # Threat hunt using Sigma rules
/forensics-ioc              # Extract and enrich IOCs
/forensics-report           # Generate forensic investigation report
/forensics-status           # Show investigation dashboard
```

**Bundled Sigma Rules (8):**

| Rule | What It Detects |
|------|----------------|
| SSH Brute Force | Repeated failed SSH authentication attempts |
| Unauthorized SUID | Unexpected SUID/SGID binaries |
| LD_PRELOAD Rootkit | Library injection via LD_PRELOAD |
| Cron Persistence | Unauthorized crontab modifications |
| Kernel Module Load | Suspicious kernel module insertion |
| PAM Backdoor | PAM configuration tampering |
| SSH Key Injection | Unauthorized authorized_keys modifications |
| Systemd Persistence | Suspicious systemd unit creation |

**Supported Evidence Sources:**

| Source | Agent | Analysis |
|--------|-------|----------|
| Auth logs | Log Analyst | Brute force, privilege escalation, lateral movement |
| Syslog / journal | Log Analyst | System events, service anomalies |
| Network connections | Network Analyst | C2 beaconing, data exfiltration, DNS tunneling |
| Docker/containerd | Container Analyst | Container escapes, image tampering, eBPF monitoring |
| Memory dumps | Memory Analyst | Process injection, rootkits, credential extraction |
| AWS/Azure/GCP | Cloud Analyst | API anomalies, IAM abuse, network flow analysis |
| File system | Persistence Hunter | Cron, systemd, SSH keys, PAM, kernel modules |

### Media/Marketing Kit — Campaign Lifecycle

```
 ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 │ STRATEGY │───▶│ CREATION │───▶│  REVIEW  │───▶│ PUBLISH  │───▶│ ANALYZE  │
 │          │    │          │    │          │    │          │    │          │
 │ Research │    │ Copy     │    │ Brand    │    │ Schedule │    │ KPIs     │
 │ Audience │    │ Design   │    │ Legal    │    │ Channels │    │ Reports  │
 │ Strategy │    │ Content  │    │ Quality  │    │ Launch   │    │ ROI      │
 └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

37 agents across strategy, creation, management, analytics, and communications. 87+ templates covering campaign intake, brand guidelines, content briefs, social playbooks, email sequences, PR kits, and analytics dashboards.

### Media Curator — Intelligent Archive Management

```bash
# Full curation pipeline
/curate "Pink Floyd"

# Step by step
/analyze-artist "Pink Floyd"           # Identify eras, catalog structure
/find-sources "Pink Floyd" "DSOTM"     # Discover across YouTube, Archive.org, Bandcamp
/acquire                               # Download with format selection
/tag-collection                        # Apply metadata, embed artwork, rename
/check-completeness                    # Gap analysis against canonical discography
/assemble "Pink Floyd live 1973"       # Build thematic compilations
/export --format plex                  # Export to Plex, Jellyfin, MPD, or archival
/verify-archive                        # SHA-256 integrity verification
```

Quality tiers: Tier 1 (Official/Lossless) → Tier 2 (High Quality) → Tier 3 (Acceptable) → Tier 4 (Avoid). Standards: ID3v2.4, Vorbis Comments, MusicBrainz, PREMIS 3.0, W3C PROV-O.

### Research Complete — Academic Research Pipeline

```
 ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 │ DISCOVER │───▶│ ACQUIRE  │───▶│ DOCUMENT │───▶│ ARCHIVE  │
 │          │    │          │    │          │    │          │
 │ Search   │    │ Download │    │ RAG      │    │ OAIS     │
 │ databases│    │ PDF      │    │ summaries│    │ lifecycle│
 │ Rank     │    │ Metadata │    │ Citations│    │ FAIR     │
 │ results  │    │ extract  │    │ GRADE    │    │ W3C PROV │
 └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

8-stage pipeline: Discovery → Acquisition → Documentation → Citation → Quality Assessment → Synthesis → Gap Analysis → Archival. Persistent REF-XXX identifiers. GRADE scoring (HIGH/MODERATE/LOW/VERY LOW). Unpaywall integration for open access papers.

---

## Voice Framework — Content Voice Consistency

4 built-in voice profiles with create, analyze, blend, and apply skills:

| Profile | When to Use | Characteristics |
|---------|-------------|----------------|
| `technical-authority` | API docs, architecture guides | Precise terminology, confident assertions, specific metrics |
| `friendly-explainer` | Tutorials, onboarding | Accessible language, analogies, encouragement |
| `executive-brief` | Status reports, proposals | Bottom-line-first, quantified impact, action-oriented |
| `casual-conversational` | Blog posts, social media | Natural rhythm, opinions, varied structure |

```bash
# Apply a voice to content
"Apply technical-authority voice to docs/architecture.md"

# Create a custom voice from existing content
/voice-create --source "blog-posts/*.md" --name "company-voice"

# Analyze writing patterns in a voice sample
/voice-analyze docs/existing-content.md

# Blend two voices
/voice-blend technical-authority casual-conversational --ratio 70:30

# Detect AI patterns and suggest authentic alternatives
/ai-pattern-detection docs/generated-content.md
```

---

## MCP Server — Model Context Protocol Integration

AIWG includes a built-in MCP server for tool-based AI workflow integration:

```bash
# Start MCP server
aiwg mcp serve

# Install into Claude Desktop
aiwg mcp install claude

# Show capabilities
aiwg mcp info
```

The MCP server exposes AIWG's artifact management, workflow execution, and project health capabilities as tools that any MCP-compatible AI platform can invoke programmatically.

---

## Agent Evaluation Framework

Test agent quality with archetype resistance testing based on Roig (2025) failure patterns:

```bash
# Evaluate a specific agent
/eval-agent security-auditor

# Test archetype resistance
/eval-agent test-engineer --category archetype

# Run performance benchmarks
/eval-agent code-reviewer --category performance
```

**Test Categories:**

| Category | Tests | What It Validates |
|----------|-------|-------------------|
| **Archetype** | 4 | Grounding (hallucination resistance), Substitution (scope adherence), Distractor (context noise), Recovery (failure handling) |
| **Performance** | 3 | Latency, token efficiency, parallel execution capability |
| **Quality** | 3 | Output format compliance, correct tool usage, scope adherence |

Target score: >=85% per agent. Results include passed/failed breakdown with evidence.

---

## Bidirectional Traceability — @-Mention System

Link requirements to architecture to code to tests with semantic @-mentions:

```markdown
<!-- In a use case document -->
This use case @implements(UC-001) the authentication flow
described in @architecture(SAD-section-3.2).

<!-- In a test file -->
// @tests(UC-001) @depends(auth-service)
describe('authentication flow', () => { ... });
```

**Mention Commands:**

```bash
/mention-wire         # Analyze codebase and inject @-mentions for traceability
/mention-validate     # Validate all @-mentions resolve to existing files
/mention-report       # Generate traceability report
/mention-lint         # Lint @-mentions for style consistency
/mention-conventions  # Display naming conventions and placement rules
```

Relationship qualifiers: `@implements`, `@tests`, `@depends`, `@derives-from`, `@blocked-by`, `@supersedes`. Enables queries like "what implements UC-001?" and "what tests cover the auth module?"

---

## Configuration & Customization

### Workspace Structure

```
your-project/
├── .aiwg/                    # SDLC artifacts (persistent project memory)
│   ├── intake/               # Project intake forms
│   ├── requirements/         # Use cases, user stories, NFRs
│   ├── architecture/         # SAD, ADRs, system diagrams
│   ├── planning/             # Phase plans, iteration plans
│   ├── risks/                # Risk register, mitigations
│   ├── testing/              # Test strategy, plans, results
│   ├── security/             # Threat models, security gates
│   ├── deployment/           # Deployment plans, runbooks
│   ├── reports/              # Generated status reports
│   ├── ralph/                # In-session Ralph loop state
│   ├── ralph-external/       # External Ralph crash-resilient state
│   ├── research/             # Research corpus and findings
│   ├── forensics/            # Investigation artifacts
│   ├── working/              # Temporary files (safe to delete)
│   └── frameworks/           # Installed framework registry
│       └── registry.json
├── .claude/                  # Claude Code deployment
│   ├── agents/               # 162 agent definitions
│   ├── commands/             # Slash commands
│   ├── skills/               # 86 skill definitions
│   └── rules/                # RULES-INDEX.md + on-demand full rules
├── .github/                  # GitHub Copilot deployment
├── .cursor/                  # Cursor deployment
├── .warp/                    # Warp Terminal deployment
└── CLAUDE.md                 # Project instructions (auto-generated)
```

### Creating Custom Extensions

```bash
# Add a custom agent
aiwg add-agent my-domain-expert

# Add a custom command
aiwg add-command my-workflow

# Add a custom skill
aiwg add-skill my-capability

# Scaffold a complete addon
aiwg scaffold-addon my-addon

# Scaffold a complete framework
aiwg scaffold-framework my-framework

# Validate all extension metadata
aiwg validate-metadata
```

### Artifact Index & Discovery

```bash
# Build searchable artifact index
aiwg index build
aiwg index build --force --verbose

# Search artifacts by keyword
aiwg index query "authentication" --json

# Show dependency graph for an artifact
aiwg index deps .aiwg/requirements/UC-001.md --json

# Index statistics
aiwg index stats --json
```

The index supports multiple graphs: project graph (`.aiwg/` artifacts) and framework graph (`agentic/code/` + `docs/`).

### Doc Sync — Bidirectional Documentation

```bash
# Audit doc drift (dry run)
aiwg doc-sync code-to-docs --dry-run

# Sync docs to match code
aiwg doc-sync code-to-docs

# Bidirectional reconciliation
aiwg doc-sync full --interactive
```

### Reproducibility Validation

```bash
# Show/set execution mode (strict = temperature 0, fixed seed)
aiwg execution-mode

# Create execution snapshot
aiwg snapshot

# Create workflow checkpoint
aiwg checkpoint

# Validate workflow reproducibility
aiwg reproducibility-validate
```

Thresholds: compliance audit (100%), security scan (100%), test generation (95%).

---

## Issue-Driven Development

AIWG integrates with issue trackers for 2-way human-AI collaboration:

```bash
# Create issues from any backend (Gitea, GitHub, Jira, Linear, local files)
/issue-create "Implement OAuth2 flow" --labels "feature,auth"

# List and filter issues
/issue-list --state open --labels "priority:high"

# Drive an issue with Ralph loop — posts status to issue thread
/issue-driven-ralph 42

# Auto-sync issues from commits and artifacts
/issue-sync

# Close with comprehensive summary and verification
/issue-close 42
```

The `/address-issues` command orchestrates issue-thread-driven Ralph loops with automatic progress posting and human feedback incorporation at each cycle.

---

## Daemon Mode & Messaging Integration

### Daemon Mode

```bash
# Background file watching, cron scheduling, IPC
aiwg daemon start
```

See [Daemon Guide](docs/daemon-guide.md) for background agent orchestration.

### Messaging Integration

Bidirectional Slack, Discord, and Telegram bots for remote agent control:

```bash
# Connect to messaging platforms
aiwg messaging connect slack
aiwg messaging connect discord
aiwg messaging connect telegram
```

See [Messaging Guide](docs/messaging-guide.md) for setup and configuration.

---

## See It In Action

```bash
# Generate project intake from natural language
/intake-wizard "Build customer portal with real-time chat"

# Accelerate from idea to construction-ready
/sdlc-accelerate "AI-powered code review tool"

# Phase transition with automated gate check
/flow-inception-to-elaboration

# Iterative task execution — "iteration beats perfection"
/ralph "Fix all failing tests" --completion "npm test passes"

# Long-running tasks with crash recovery (6-8 hours)
/ralph-external "Migrate to TypeScript" --completion "npx tsc --noEmit exits 0"

# Process massive codebases with recursive context decomposition
/rlm-query "src/**/*.ts" "Extract all exported interfaces" --model haiku
/rlm-batch "src/components/*.tsx" "Add TypeScript types" --parallel 4

# Digital forensics investigation
/forensics-investigate
/forensics-triage
/forensics-timeline

# Scan codebase for agent-readiness
/codebase-health --format text

# Decompose large files into agent-friendly modules
/decompose-file src/large-file.ts --execute

# Deploy to production with rollback gates
/flow-deploy-to-production

# Security assessment
/security-audit

# Voice transformation
"Apply technical-authority voice to docs/architecture.md"
"Create a voice profile based on our existing blog posts"
```

---

## Platform Support

All 8 platforms receive agents, commands, skills, and rules. Deployment adapts to each platform's conventions automatically.

| Platform | Status | Agents | Commands | Skills | Rules | Deploy Command |
|----------|--------|--------|----------|--------|-------|---------------|
| **Claude Code** | Tested | `.claude/agents/` | `.claude/commands/` | `.claude/skills/` | `.claude/rules/` | `aiwg use sdlc` |
| **GitHub Copilot** | Tested | `.github/agents/` | `.github/agents/` | `.github/skills/` | `.github/copilot-rules/` | `--provider copilot` |
| **Warp Terminal** | Tested | `.warp/agents/` + WARP.md | `.warp/commands/` | `.warp/skills/` | `.warp/rules/` | `--provider warp` |
| **Factory AI** | Tested | `.factory/droids/` | `.factory/commands/` | `.factory/skills/` | `.factory/rules/` | `--provider factory` |
| **Cursor** | Tested | `.cursor/agents/` | `.cursor/commands/` | `.cursor/skills/` | `.cursor/rules/` | `--provider cursor` |
| **OpenCode** | Tested | `.opencode/agent/` | `.opencode/command/` | `.opencode/skill/` | `.opencode/rule/` | `--provider opencode` |
| **OpenAI/Codex** | Tested | `.codex/agents/` | `~/.codex/prompts/` | `~/.codex/skills/` | `.codex/rules/` | `--provider openai` |
| **Windsurf** | Experimental | AGENTS.md | `.windsurf/workflows/` | `.windsurf/skills/` | `.windsurf/rules/` | `--provider windsurf` |

---

## CLI Reference (47 Commands)

| Category | Commands | Description |
|----------|----------|-------------|
| **Maintenance** | `help`, `version`, `doctor`, `update` | Installation health, updates, diagnostics |
| **Framework** | `use`, `list`, `remove` | Deploy, inspect, and remove frameworks |
| **Project** | `new` | Scaffold new project with AIWG structure |
| **Workspace** | `status`, `migrate-workspace`, `rollback-workspace` | Workspace health and migration |
| **MCP** | `mcp serve`, `mcp install`, `mcp info` | Model Context Protocol server |
| **Catalog** | `catalog list`, `catalog info`, `catalog search` | Browse available extensions |
| **Plugins** | `install-plugin`, `uninstall-plugin`, `plugin-status`, `package-plugin`, `package-all-plugins` | Plugin management |
| **Scaffolding** | `add-agent`, `add-command`, `add-skill`, `add-template`, `scaffold-addon`, `scaffold-extension`, `scaffold-framework` | Create new extensions |
| **Ralph** | `ralph`, `ralph-status`, `ralph-abort`, `ralph-resume`, `ralph-external`, `ralph-memory`, `ralph-config` | Iterative execution engine |
| **Metrics** | `cost-report`, `cost-history`, `metrics-tokens` | Token usage and cost tracking |
| **Index** | `index build`, `index query`, `index deps`, `index stats` | Artifact discovery and dependency graphing |
| **Documentation** | `doc-sync` | Bidirectional doc-code synchronization |
| **SDLC** | `sdlc-accelerate` | Idea-to-construction-ready pipeline |
| **Code Analysis** | `cleanup-audit` | Dead code and unused export detection |
| **Reproducibility** | `execution-mode`, `snapshot`, `checkpoint`, `reproducibility-validate` | Deterministic workflow validation |
| **Toolsmith** | `runtime-info` | Runtime environment detection |
| **Utility** | `prefill-cards`, `contribute-start`, `validate-metadata` | Development utilities |

### Quick Reference

```bash
# Deploy frameworks
aiwg use sdlc                    # SDLC framework
aiwg use forensics               # Forensics framework
aiwg use all                     # Everything
aiwg use sdlc --provider copilot # Deploy to GitHub Copilot

# Project management
aiwg new my-project              # Scaffold new project
aiwg status                      # Workspace health
aiwg doctor                      # Installation diagnostics

# Iterative execution (Ralph Loop)
aiwg ralph "Fix all tests" --completion "npm test passes"
aiwg ralph-status                # Check loop progress
aiwg ralph-abort                 # Cancel running loop
aiwg ralph-resume                # Resume interrupted loop
aiwg ralph-external "Migrate to TS" --completion "tsc --noEmit exits 0"

# Artifact discovery
aiwg index build                 # Build artifact index
aiwg index query "authentication" --json
aiwg index deps .aiwg/requirements/UC-001.md --json

# Documentation sync
aiwg doc-sync code-to-docs --dry-run
aiwg doc-sync full --interactive

# Metrics
aiwg cost-report                 # Session cost breakdown
aiwg metrics-tokens              # Token usage

# SDLC accelerate
aiwg sdlc-accelerate "Project description"
aiwg sdlc-accelerate --from-codebase .
```

---

## Architecture

### Extension System

AIWG uses a unified extension system with 10 extension types, all deployable across 8 platforms:

| Type | Count | Description |
|------|-------|-------------|
| **Agents** | 162 | Specialized AI personas with defined tools, responsibilities, and operating rhythms |
| **Commands** | 47 | CLI commands and slash commands for workflow automation |
| **Skills** | 86 | Natural language workflow triggers activated by conversation patterns |
| **Rules** | 35 | Enforcement patterns deployed as consolidated index with on-demand full-rule loading |
| **Templates** | 366 | Progressive disclosure document templates for all SDLC phases |
| **Frameworks** | 5 | Complete workflow systems (SDLC, Forensics, Marketing, Research, Media Curator) |
| **Addons** | 20 | Feature bundles extending frameworks (RLM, Voice, Testing Quality, UAT) |
| **Hooks** | varies | Lifecycle event handlers (pre-session, post-write, workflow tracing) |
| **Tools** | varies | External utility integrations (git, jq, npm) |
| **MCP Servers** | varies | Model Context Protocol server integrations |

### Multi-Agent Orchestration

```
                    ┌─────────────────────┐
                    │ Executive Orchestrator│
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │Primary Author│ │  Reviewer 1  │ │  Reviewer 2  │  ← Parallel
      │(e.g. Req.   │ │(e.g. Security│ │(e.g. Test    │
      │  Analyst)    │ │  Architect)  │ │  Architect)  │
      └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
             └────────────────┼────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │  Documentation      │
                    │  Synthesizer        │  ← Merge all reviews
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Human Gate         │  ← GO / NO_GO decision
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │  .aiwg/ Archive     │  ← Persistent artifacts
                    └─────────────────────┘
```

### YAML Metalanguage

AIWG is pioneering a declarative YAML metalanguage for multi-agent workflow orchestration. Schema-validated YAML defines agent topology, workflow DAGs, gate conditions, and artifact contracts — while natural language handles behavioral logic.

```yaml
# Example: flow definition (schema-validated)
flow:
  id: inception-to-elaboration
  model: opus
  entry_criteria:
    gate: LOM
    artifacts:
      - path: .aiwg/requirements/vision-document.md
        required: true
  steps:
    - id: requirements-analysis
      agent: requirements-analyst
      parallel_group: reviews
    - id: architecture-baseline
      agent: architecture-designer
      parallel_group: reviews
    - id: synthesis
      agent: documentation-synthesizer
      depends_on: [requirements-analysis, architecture-baseline]
  exit_criteria:
    gate: ABM
    decision: [GO, CONDITIONAL_GO, NO_GO]
```

JSON Schema definitions for `flow.yaml`, `agent.yaml`, `rule.yaml`, and `skill.yaml` at `agentic/code/frameworks/sdlc-complete/schemas/metalanguage/`.

### Project Artifacts (.aiwg/)

All SDLC artifacts persist in `.aiwg/` — structured project memory that survives across AI sessions:

```
.aiwg/
├── intake/           # Project intake forms, solution profiles
├── requirements/     # Use cases, user stories, NFRs
├── architecture/     # SAD, ADRs, diagrams
├── planning/         # Phase plans, iteration plans
├── risks/            # Risk register, mitigations
├── testing/          # Test strategy, test plans
├── security/         # Threat models, security gates
├── deployment/       # Deployment plans, runbooks
├── reports/          # Generated status reports
├── ralph/            # Ralph loop state and history
└── frameworks/       # Installed framework registry
```

---

## Ralph Loop — Autonomous Long-Running Agent Orchestration

The Ralph Loop is the core execution philosophy: **iteration beats perfection**. Instead of getting everything right on the first attempt, the agent executes in a retry loop where errors become learning data. Ralph supports both in-session loops and **crash-resilient external loops that run indefinitely** — surviving process crashes, terminal disconnects, and system reboots.

### In-Session Ralph (Minutes to Hours)

```bash
# Iterative task execution with automatic error recovery
/ralph "Fix all failing tests" --completion "npm test passes with 0 failures"
/ralph "Reach 80% coverage" --completion "coverage report shows >80%" --max-iterations 20

# Issue-driven Ralph — posts cycle status to issue threads, incorporates human feedback
/issue-driven-ralph 42    # Drives issue #42 with 2-way human-AI collaboration
```

### External Ralph — Crash-Resilient Autonomous Agents (Hours to Days)

External Ralph runs as a **persistent background process** with PID file tracking, crash recovery, and automatic restart. The agent continues working even if your terminal disconnects or the host reboots.

```bash
# Long-running autonomous task (6-8+ hours, survives crashes)
/ralph-external "Migrate entire codebase to TypeScript" \
  --completion "npx tsc --noEmit exits 0" \
  --timeout 480

# Autonomous code review loop
/ralph-external "Review and fix all security vulnerabilities" \
  --completion "npm audit shows 0 vulnerabilities"

# Continuous integration loop
/ralph-external "Get all tests passing on Node 18 and 22" \
  --completion "npm test passes on both versions"
```

External Ralph features:
- **Crash resilience** — PID file recovery, automatic restart on process death
- **Checkpoint system** — saves progress at each iteration boundary, resumes from last checkpoint
- **Cross-session persistence** — state stored in `.aiwg/ralph-external/`, survives terminal disconnects
- **Debug memory** — learns from failure patterns across iterations, applies lessons to subsequent attempts
- **Episodic memory** — `/ralph-reflect` shows accumulated learnings and strategy evolution
- **Completion reports** — detailed iteration history saved to `.aiwg/ralph/`

### Scheduled and Remote Agents

```bash
# Schedule recurring autonomous agent tasks
/schedule create "Run security audit" --cron "0 9 * * 1"    # Every Monday 9am
/schedule create "Check dependency updates" --cron "0 0 * *" # Monthly

# Remote agent triggers — execute on schedule from anywhere
/schedule list
/schedule run <trigger-id>
```

### Ralph Control

```bash
/ralph-status     # Check current/previous loop status
/ralph-resume     # Resume interrupted loop from last checkpoint
/ralph-abort      # Cancel running loop (optionally revert changes)
/ralph-memory     # View debug memory entries and failure patterns
/ralph-reflect    # View episodic memory and strategy evolution
/ralph-analytics  # Execution metrics and performance history
```

### How It Works

Each iteration follows the TAO loop (Thought → Action → Observation):

```
Iteration N:
  1. THINK  — Analyze current state + accumulated learnings from iterations 1..N-1
  2. ACT    — Make changes based on task + debug memory + failure patterns
  3. VERIFY — Run completion command (tests, build, lint, coverage, etc.)
  4. LEARN  — If verification fails, extract root cause → store in debug memory
  5. DECIDE — Pass? → Complete. Fail? → Iterate. Max retries? → Escalate to human.
```

The debug memory system implements executable feedback: the agent doesn't just retry — it learns *what went wrong* and *why*, then applies that knowledge to the next attempt. After 3 failed attempts at the same root cause, it escalates to a human rather than looping forever.

Research foundation: Self-Refine (Madaan et al., NeurIPS 2023), ReAct (Yao et al., ICLR 2023), METR 2025 (recovery capability dominates agentic task success), Reflexion (Shinn et al., 2023).

---

## RLM — Recursive Context Decomposition

Process codebases and documents far beyond any model's context window:

```bash
# Query: fan-out across files, gather results
/rlm-query "src/**/*.ts" "Extract all exported interfaces" --model haiku

# Batch: parallel processing with configurable concurrency
/rlm-batch "src/components/*.tsx" "Add TypeScript types" --parallel 4

# Status: monitor decomposition progress
/rlm-status
```

The RLM addon decomposes large inputs into chunks, delegates each to a sub-agent, and synthesizes results. Processes 10M+ tokens through recursive delegation.

Research foundation: Recursive Language Models (Zhang, Kraska, Khattab — MIT CSAIL, 2026).

---

## Research Foundations

AIWG's architecture is grounded in peer-reviewed research. Citations are maintained in a [dedicated research corpus](https://git.integrolabs.net/roctinam/research-papers) with 138+ papers.

| Capability | Research Foundation |
|-----------|-------------------|
| Cognitive load optimization | Miller's 7±2 (1956), Sweller's CLT (1988) |
| Multi-agent ensemble validation | Jacobs et al. mixture-of-experts (1991), MetaGPT (Hong et al., ICLR 2024) |
| Closed-loop self-correction | Self-Refine (Madaan et al., NeurIPS 2023), METR 2025 |
| Structured reasoning | ReAct (Yao et al., ICLR 2023), Chain-of-Thought (Wei et al., NeurIPS 2022) |
| Iterative execution | Self-Refine (Madaan et al., 2023), Reflexion (Shinn et al., 2023) |
| Recursive context decomposition | RLM (Zhang, Kraska, Khattab — MIT CSAIL, 2026) |
| Provenance tracking | W3C PROV (2013), FAIR Principles (Wilkinson et al., 2016) |
| Quality assessment | GRADE methodology (adopted by WHO, Cochrane, NICE — 100+ organizations) |
| Stage-gate process | Cooper's Stage-Gate (1990), RUP (Jacobson, Booch, Rumbaugh, 1999) |
| Agent-computer interface | SWE-Agent (Yang et al., 2024), Focus Agent |
| Context engineering | Anthropic Context Engineering (2025), Codified Context Infrastructure |
| Failure archetypes | METR 2025 (sophisticated reward hacking), Anthropic 2024 (13% misalignment rate) |
| Declarative agent workflows | DSPy (Khattab et al., ICLR 2024), AFlow (ICLR 2025 Oral) |
| Constrained generation | Outlines (Willard & Louf, NeurIPS 2023), LMQL (Beurer-Kellner et al., PLDI 2023) |

Full research background, citations, and methodology: [docs/research/](docs/research/)

---

## Why AIWG

### For Individual Developers

**Turn your AI coding assistant from a stateless autocomplete into a project-aware development partner.** Without AIWG, every time your AI assistant restarts you lose all context. With AIWG, the `.aiwg/` directory maintains requirements, architecture decisions, test strategies, and project history across sessions. The Ralph loop means you can hand off complex multi-step tasks ("migrate this module to TypeScript") and walk away — the agent iterates until completion or escalates when stuck.

### For Engineering Teams

**Standardize how your team works with AI across 8 platforms.** Whether your team uses Claude Code, Copilot, Cursor, or Warp, everyone gets the same agents, rules, and workflows. The 35 enforcement rules prevent common AI mistakes: deleting tests to make them pass, fabricating citations, hard-coding tokens, or silently dropping features. Human-in-the-loop gates at phase transitions ensure no AI output reaches production without human review.

### For Platform Engineers

**Deploy consistent AI-augmented workflows across your organization.** AIWG's extension system lets you create custom agents, commands, and skills specific to your domain, then deploy them to any supported platform. The scaffolding commands (`aiwg add-agent`, `aiwg scaffold-addon`, `aiwg scaffold-framework`) make it easy to build and distribute organizational capabilities.

### For Researchers

**Standards-aligned implementation of multi-agent systems with full provenance.** AIWG operationalizes FAIR Principles (G20, EU, NIH endorsement), W3C PROV for provenance tracking, and GRADE methodology for evidence quality. The research framework manages paper discovery, citation integrity, and archival lifecycles. All 138+ research paper citations are grounded in verified sources — no hallucinated references.

### For Security Teams

**Forensics-grade investigation workflows and security review automation.** The Forensics Complete framework provides 13 specialized agents for digital forensics and incident response, with NIST SP 800-86 evidence handling, MITRE ATT&CK mapping, Sigma rule hunting, and STIX 2.1 IOC formatting. Security review cycles integrate into the SDLC with automated threat modeling and vulnerability management.

---

## AIWG vs Manual AI Workflows

| Capability | Without AIWG | With AIWG |
|-----------|-------------|-----------|
| **Context persistence** | Lost on every restart | `.aiwg/` survives across sessions |
| **Multi-agent coordination** | Manual prompt switching | Orchestrated parallel reviews with synthesis |
| **Quality enforcement** | Hope for the best | 35 rules auto-enforced (anti-laziness, token security, citation integrity) |
| **Error recovery** | Start over | Ralph loop iterates with learned debug memory |
| **Long-running tasks** | Babysit the terminal | External Ralph runs 6-8+ hours crash-resilient |
| **Traceability** | Grep and hope | @-mention system with bidirectional linking |
| **Reproducibility** | Non-deterministic | Strict mode (temperature=0), checkpoints, validation |
| **Platform switching** | Rewrite all prompts | `--provider copilot` deploys identical workflows |
| **Citation integrity** | AI may hallucinate | Retrieval-first architecture, GRADE-assessed sources only |
| **Phase management** | Ad-hoc | Stage-gate with human approval at transitions |

---

## Standards & Compliance

| Standard | How AIWG Uses It |
|----------|-----------------|
| **FAIR Principles** (G20, EU, NIH) | Findable, Accessible, Interoperable, Reusable artifact management |
| **W3C PROV** | Provenance tracking for all generated artifacts |
| **GRADE** (WHO, Cochrane, NICE) | Evidence quality assessment for research citations |
| **OAIS** (ISO 14721) | Archival lifecycle management for research corpus |
| **NIST SP 800-86** | Digital forensics evidence handling |
| **MITRE ATT&CK** | Threat technique mapping in forensics framework |
| **STIX 2.1** | Indicator of Compromise formatting |
| **Sigma Rules** | Threat detection rule format |
| **IEEE 830** | Requirements specification traceability |
| **MCP** (Linux Foundation) | Model Context Protocol for tool integration |
| **CalVer** | Calendar versioning (YYYY.M.PATCH) |

---

## Documentation

### Getting Started

- **[Quick Start Guide](docs/quickstart.md)** — Install and deploy in minutes
- **[Prerequisites](docs/getting-started/prerequisites.md)** — Node.js, AI platforms, OS support
- **[CLI Reference](docs/cli-reference.md)** — All 47 commands with examples

### By Audience

**Practitioners:**
- [Quick Start Guide](docs/quickstart.md) — Hands-on workflows
- [Ralph Loop Guide](docs/ralph-guide.md) — Iterative execution with crash recovery
- [Platform Guides](docs/integrations/) — 5-10 minute setup per platform

**Technical Leaders:**
- [Extension System Overview](docs/extensions/overview.md) — Architecture and capabilities
- [Workspace Architecture](docs/architecture/workspace-architecture.md) — Multi-framework isolation
- [Multi-Agent Orchestration](agentic/code/frameworks/sdlc-complete/docs/orchestrator-architecture.md) — Ensemble patterns

**Researchers & Evaluators:**
- [Research Background](docs/research/) — Literature review and citations
- [Glossary](docs/research/glossary.md) — Professional terminology mapping
- [Production-Grade Guide](docs/production-grade-guide.md) — Failure mode mitigation

### Platform Guides

- **[Claude Code](docs/integrations/claude-code-quickstart.md)** — 5-10 min setup
- **[Warp Terminal](docs/integrations/warp-terminal-quickstart.md)** — 3-5 min setup
- **[Factory AI](docs/integrations/factory-quickstart.md)** — 5-10 min setup
- **[Cursor](docs/integrations/cursor-quickstart.md)** — 5-10 min setup
- **[All Integrations](docs/integrations/)**

### Framework Documentation

- **[SDLC Framework](agentic/code/frameworks/sdlc-complete/README.md)** — 98 agents, phase workflows, quality gates
- **[Forensics Complete](agentic/code/frameworks/forensics-complete/README.md)** — DFIR investigation workflows
- **[Marketing Kit](agentic/code/frameworks/media-marketing-kit/README.md)** — 37 agents, campaign lifecycle
- **[Media Curator](agentic/code/frameworks/media-curator/README.md)** — Media archive management
- **[Research Complete](agentic/code/frameworks/research-complete/README.md)** — 8-stage research pipeline

### Extension System

AIWG's unified extension system enables dynamic discovery, semantic search, and cross-platform deployment:

- **[Extension System Overview](docs/extensions/overview.md)** — Architecture and capabilities
- **[Creating Extensions](docs/extensions/creating-extensions.md)** — Build custom agents, commands, skills
- **[Extension Types Reference](docs/extensions/extension-types.md)** — Complete type definitions

### Advanced Topics

- **[Ralph Loop](docs/ralph-guide.md)** — Iterative task execution with crash recovery
- **[RLM Addon](agentic/code/addons/rlm/README.md)** — Recursive context decomposition for 10M+ token processing
- **[Daemon Mode](docs/daemon-guide.md)** — Background file watching, cron scheduling, IPC
- **[Messaging Integration](docs/messaging-guide.md)** — Bidirectional Slack, Discord, and Telegram bots
- **[MCP Server](docs/mcp/)** — Model Context Protocol integration
- **[Agent Design Bible](docs/AGENT-DESIGN.md)** — 10 Golden Rules for agent creation
- **[YAML Metalanguage](agentic/code/frameworks/sdlc-complete/schemas/metalanguage/)** — Declarative workflow schemas

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick contributions:**
- Found an AI pattern? [Open an issue](https://github.com/jmagly/aiwg/issues/new)
- Have a better rewrite? Submit a PR to `examples/`
- Want to add an agent? Use `aiwg add-agent` or see `docs/development/agent-template.md`
- Want to add a skill? Use `aiwg add-skill`
- Want to create an addon? Use `aiwg scaffold-addon`

---

## Community & Support

- **Website:** [aiwg.io](https://aiwg.io)
- **Discord:** [Join Server](https://discord.gg/BuAusFMxdA)
- **Telegram:** [Join Group](https://t.me/+oJg9w2lE6A5lOGFh)
- **Issues:** [GitHub Issues](https://github.com/jmagly/aiwg/issues)
- **Discussions:** [GitHub Discussions](https://github.com/jmagly/aiwg/discussions)

---

## Usage Notes

AIWG is optimized for token efficiency. Rules deploy as a consolidated index (~200 lines) instead of 35 individual files (~9,321 lines). Most users on **Claude Pro** or similar plans will have no issues. See [Usage Notes](docs/usage-notes.md) for rate limit guidance.

---

## License

**MIT License** — Free to use, modify, and distribute. See [LICENSE](LICENSE).

**Important:** This framework does not provide legal, security, or financial advice. All generated content should be reviewed before use. See [Terms of Use](docs/terms.md) for full disclaimers.

---

## Sponsors

<table>
<tr>
<td width="33%" align="center">

### [Roko Network](https://roko.network)

**The Temporal Layer for Web3**

Enterprise-grade timing infrastructure for blockchain applications.

</td>
<td width="33%" align="center">

### [Selfient](https://selfient.xyz)

**No-Code Smart Contracts for Everyone**

Making blockchain-based agreements accessible to all.

</td>
<td width="33%" align="center">

### [Integro Labs](https://integrolabs.io)

**AI-Powered Automation Solutions**

Custom AI and blockchain solutions for the digital age.

</td>
</tr>
</table>

**Interested in sponsoring?** [Contact us](https://github.com/jmagly/aiwg/discussions)

---

## Acknowledgments

**Research foundations:** Built on established principles from cognitive science (Miller 1956, Sweller 1988), multi-agent systems (Jacobs et al. 1991, MetaGPT, AutoGen), software engineering (Cooper 1990, RUP), and recent AI systems research (ReAct, Self-Refine, DSPy, SWE-Agent). Implements standards from FAIR Principles, OAIS (ISO 14721), W3C PROV, GRADE evidence assessment, and MCP protocol (Linux Foundation).

**Platforms:** Thanks to Anthropic (Claude Code), GitHub (Copilot), Warp, Factory AI, Cursor, and the OpenCode community for building the platforms that enable this work.

---

<div align="center">

**[Back to Top](#aiwg)**

Made with determination by [Joseph Magly](https://github.com/jmagly)

</div>
