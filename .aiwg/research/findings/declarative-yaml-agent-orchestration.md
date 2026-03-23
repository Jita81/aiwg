# Declarative YAML as Metalanguage for AI Agent Orchestration

**Research Area**: Agent orchestration, workflow specification, LLM prompt formats
**Date**: 2026-03-22
**Source**: Industry survey conducted during AIWG flow formalization analysis
**Related Issue**: roctinam/aiwg#447 — RFC: Formalize declarative YAML metalanguage for flow and outcome expression

---

## Summary Finding

YAML is the emerging declarative layer in production AI agent frameworks, but with a **universal architectural split**: YAML handles *identity, topology, and configuration* while code handles *logic, tools, and runtime behavior*. Natural language prose (embedded as strings in YAML or as standalone DSLs like OpenProse) fills the judgment/behavior layer that neither YAML nor code expresses well.

**No framework uses YAML for control flow.** This boundary is universally reserved for code (Python/TypeScript) or NL prose. AIWG occupies a hybrid position: YAML frontmatter for agent/command metadata, markdown NL prose for behavioral specification — which is the dominant industry pattern, implemented more formally in AIWG than in most frameworks.

---

## Industry Survey: 11 Frameworks

### The Universal Split

| Layer | Format | Examples |
|-------|--------|---------|
| Agent identity (name, role, goal) | YAML / frontmatter | CrewAI, Claude Code |
| Tool capability declaration | JSON Schema / OpenAPI | MCP, GPT Actions, Bedrock |
| Workflow orchestration | Python code OR NL prose | LangGraph, OpenProse |
| Deployment config | YAML | Prefect, LiteLLM |
| Prompt templates | YAML + template syntax | Semantic Kernel, Haystack |
| LLM parameters | YAML or code | CrewAI, Semantic Kernel |

### Framework Details

#### CrewAI (most mature YAML agent DSL)
- Split `agents.yaml` / `tasks.yaml` + Python orchestration via `@CrewBase` decorators
- `agents.yaml`: role, goal, backstory, llm, verbose — all support `{variable}` interpolation
- `tasks.yaml`: description, expected_output, agent reference, output_file, human_input, guardrail
- Python handles: tools, control flow, memory, knowledge sources, event-driven Flows
- Key insight: YAML is the "non-technical stakeholder layer" — persona and mission; Python is the wiring

#### Haystack 2.x (furthest toward pure YAML pipelines)
- Full pipeline definition in YAML: components (with registered type strings), connections, init_parameters
- `components[name].type` must be a registered Python class — YAML is a serialized object graph
- Custom logic requires custom registered components; no freeform behavior in YAML
- Key insight: achieves full YAML expressiveness at the cost of extensibility; everything must be pre-registered

#### Semantic Kernel (most granular: per-function YAML configs)
- Individual prompt functions as paired YAML config + template files
- `config.yaml`: name, description, template_format, input_variables (with types/defaults), execution_settings
- Template file: Handlebars/Jinja2 with `{{variable}}` placeholders
- Key insight: treats individual prompt functions as first-class declarative artifacts — closest analog to how OpenProse treats `.prose` programs

#### DSPy (most theoretically interesting: signatures)
- Declarative signatures: `"question -> answer"` or class-based with typed fields
- Decouples *specification* (signature) from *implementation* (the generated prompt)
- Compiler auto-generates and optimizes prompts from signatures
- Key insight: analogous to a compiler over a high-level spec — closest in concept to what OpenProse's runtime-as-interpreter model does

#### LangGraph (deliberate anti-YAML position)
- Code-first: graphs defined entirely in Python; `langgraph.json` only for deployment manifests
- Rationale: code provides Turing-complete control flow, IDE support, type checking, debugging
- LangGraph graphs cannot be authored by non-programmers, cannot be read/executed directly by LLM
- Key insight: the strongest counter-argument to declarative YAML for workflows

#### AutoGen
- Python class instantiation; JSON `config_list` for LLM routing
- `system_message` (NL) is the primary agent behavioral specification
- AutoGen 0.4 introduced JSON serialization for agents, enabling some declarative composition
- Key insight: conversation-first design — agents define themselves through behavior, not config

#### Smolagents (anti-YAML, pro-code)
- Python type hints + docstrings as the tool schema (`@tool` decorator introspects function signature)
- Research finding: code-based agent actions empirically outperform JSON/structured output actions
- Key insight: Python's own type system IS the declarative schema — no separate YAML needed

#### MCP (most rigorous tool schema standard)
- JSON-RPC 2.0 with JSON Schema for `inputSchema` declarations
- Three primitives: Tools (executable), Resources (data), Prompts (templates)
- Convergence point: OpenAPI YAML → MCP JSON → LLM function calling all use JSON Schema
- Key insight: MCP is becoming the standard wire protocol; JSON Schema is the type system

#### OpenAI GPT Actions / AWS Bedrock Agents
- OpenAPI 3.x YAML spec defines agent capabilities (endpoints, schemas, auth)
- Same spec documents API for humans AND declares it as an agent tool
- Key insight: OpenAPI YAML is the de facto standard for declarative agent capability declaration

#### Prefect
- `@flow` and `@task` Python decorators for workflow logic
- `prefect.yaml` for deployment manifests only (entrypoint, schedules, worker pools)
- Same pattern as LangGraph: runtime/deployment layer is YAML; workflow logic is code

#### LiteLLM Proxy
- `config.yaml` for LLM routing, model lists, fallbacks, load balancing
- Infrastructure config, not agent definition
- Enables model-agnostic agent definitions: declare `llm: gpt-4-production`, proxy handles provider selection

---

## OpenAPI/JSON Schema Convergence

A significant cross-framework finding: **OpenAPI YAML is becoming the standard tool declaration format**:
- OpenAI GPT Actions: require OpenAPI 3.x spec
- AWS Bedrock: action groups use OpenAPI specs
- Semantic Kernel: supports OpenAPI plugin import
- MCP: uses JSON Schema (same schema language as OpenAPI, different wire format)
- A2A (Google): Agent Cards declare capabilities via structured JSON

This creates an opportunity for AIWG: adopting OpenAPI/JSON Schema for agent tool declarations in `.agent.yaml` would make AIWG agents compatible with the entire GPT Actions / Bedrock / MCP ecosystem.

---

## AIWG-Specific Findings

### Current Token Cost
| Component | Files | Est. Tokens | % to YAML |
|-----------|-------|-------------|-----------|
| Agents | 162 | ~1.1M | ~50% |
| Skills | 85 | ~0.65M | ~40% |
| Commands | 167 | ~1.0M | ~55% |
| Rules | 35 | ~0.1M | ~15% |
| **Total** | **449** | **~2.85M** | |

### What's Already Implicitly Declarative (extractable to YAML)
1. **Flow DAGs** — agent invocations with parallel_group and depends_on relationships
2. **Artifact contracts** — explicit input/output paths per flow step
3. **Gate conditions** — entry/exit criteria as structured rule lists
4. **Agent operating rhythms** — phase sequences with tool assignments
5. **Responsibilities** — enumerated capability domains
6. **Trigger patterns** — skill activation via NL phrase lists

### What Must Remain Natural Language
1. Judgment clauses (`**if the user seems frustrated**`)
2. Few-shot example *reasoning* (why, not just input/output)
3. Design philosophy and agent identity/soul
4. Complex conditional error recovery strategies

### Proposed Migration Target
40-60% token reduction through YAML formalization of structural elements while preserving NL for semantic content.

---

## Research Gaps (Novel Contribution Opportunities)

Three gaps with no existing literature found:

1. **Token efficiency benchmark**: No published study comparing token costs of equivalent workflows expressed in YAML vs NL markdown vs Python pseudocode for LLM task performance. AIWG is positioned to run and publish this benchmark.

2. **NL-as-control-flow**: No academic paper claims natural language prose can serve as a workflow control-flow language. This is OpenProse's core research claim and is unoccupied in the literature.

3. **Multi-agent workflow YAML schema standard**: Every framework defines its own schema; no convergence or cross-framework compatibility exists. AIWG formalizing its schemas could become a reference implementation.

---

## Papers for Induction (see research-papers issues)

| # | Paper | Year | Venue | Relevance |
|---|-------|------|-------|-----------|
| 1 | DSPy: Compiling Declarative Language Model Calls into State-of-the-Art Pipelines | 2023 | Stanford NLP | Declarative signatures; specification-implementation decoupling |
| 2 | AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation | 2023 | Microsoft Research | Conversable agent patterns; conversation vs declarative config |
| 3 | MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework | 2023 | ICLR 2024 | Structured output schemas as communication contracts |
| 4 | Executable Code Actions Elicit Better LLM Agents | 2024 | HuggingFace | Code actions outperform JSON/structured output empirically |
| 5 | ReAct: Synergizing Reasoning and Acting in Language Models | 2023 | Princeton/Google | TAO loop foundation; structured reasoning patterns |
| 6 | Self-Refine: Iterative Refinement with Self-Feedback | 2023 | CMU | Ralph loop foundation; iterative improvement patterns |

---

## Implications for AIWG

1. **Define and publish YAML schemas** as first-class AIWG deliverables (issue #447)
2. **Adopt OpenAPI/JSON Schema** for agent tool declarations — ecosystem compatibility
3. **Run the token efficiency benchmark** — publishable research contribution, no prior art
4. **AIWG is the reference implementation** of the YAML-topology / NL-behavior pattern that the industry uses informally
5. **Visual tooling becomes possible** once flows are machine-parseable YAML (dependency graphs, gate dashboards, flow diagrams)
