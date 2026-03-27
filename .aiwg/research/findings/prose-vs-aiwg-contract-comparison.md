# OpenProse Contract Model vs AIWG YAML Metalanguage RFC — Gap Analysis

**Research Type**: Comparative architecture analysis
**Date**: 2026-03-27
**Related Issues**: roctinam/aiwg#447 (YAML metalanguage RFC), roctinam/aiwg#618 (RLM addon)
**Related ADR**: ADR-020 (JSON Schema for YAML Metalanguage)
**Status**: For architecture team review

---

## Executive Summary

OpenProse and AIWG's YAML metalanguage RFC (ADR-020) both address the problem of specifying agent workflows in a structured, portable form — but they approach it from opposite ends of the abstraction spectrum. OpenProse treats the LLM as an intelligent interpreter and optimizes for model comprehension; AIWG's RFC treats the schema as a machine artifact and optimizes for tooling and validation. Neither approach is strictly superior: each fills gaps the other cannot close without significant architectural change.

The most consequential finding is that OpenProse's `ensures:` construct — a natural language obligation rather than a structural description — achieves something AIWG's YAML schemas do not: it causes the model to treat output requirements as commitments rather than type annotations. This distinction, rooted in Tenet #4 of OpenProse's design, directly affects output quality in ways that JSON Schema validation cannot replicate at runtime.

Conversely, AIWG has capabilities Prose lacks that are practically significant: multi-platform deployment, structured lifecycle phases with gate criteria, cost tracking, and an imperative CLI layer. Prose programs are largely platform-agnostic but require a Prose-complete runtime; AIWG deploys to nine different provider environments from a single source.

The most actionable recommendation is to adapt the `ensures:`-as-obligation pattern into AIWG's skill and flow definitions as a prompt engineering convention, grounding it in AIWG's existing `output:` YAML field rather than replacing that field.

---

## Background

### What OpenProse Is

OpenProse is a contract-based programming model for LLM orchestration. Its core claim — stated in `prose.md` and backed by Tenet #11 from `tenets.md` — is that a Markdown file loaded into an LLM's context causes the LLM to simulate the system that file describes. This is not a metaphor: "simulation with sufficient fidelity is implementation." The runtime is therefore the LLM itself; the spec is both documentation and executable.

The programming model has two phases:

- **Phase 1 (Wiring)**: The Forme container reads component `.md` files, matches `requires:` against `ensures:` declarations by semantic understanding rather than type matching, and produces a `manifest.md`.
- **Phase 2 (Execution)**: The Prose VM reads the manifest, spawns subagent sessions via the Task tool, passes data between them through filesystem pointers, and returns the program's output.

Components declare what they `requires` (inputs), what they `ensures` (outputs, as obligations), what their `invariants` are (properties holding regardless of outcome), and how they handle `errors`. The Forme container auto-wires components into a dependency graph without requiring explicit service references between components — a component declares what data it needs, not which component provides it.

The `rlm-self-refine` example illustrates the model succinctly:

```yaml
ensures:
- result: the refined artifact scoring 85+ against criteria

strategies:
- when score is below 85: refine targeting the specific issues identified
- max 5 refinement iterations
```

This is an obligation with a quality threshold and a refinement strategy, all expressed as prose the model reads and acts on.

### What AIWG's YAML RFC Is (ADR-020)

ADR-020, accepted 2026-03-23, establishes JSON Schema as the formal schema language for AIWG's YAML metalanguage covering flows, hooks, outcomes, and provider adapter manifests. The schemas reside in `agentic/code/frameworks/sdlc-complete/schemas/`.

The motivation is multi-provider tooling: AIWG deploys to nine provider platforms and needs a provider-independent expression layer that can be validated before deployment and transformed into each platform's native format. The `providers:` map in each hook definition captures platform-specific wiring in a single source-of-truth document.

Current AIWG workflow definitions live in Markdown prose files (`.claude/commands/flow-*.md`). ADR-020 does not replace these — it adds a machine-readable layer alongside them. The intent is a 40-60% token reduction through YAML formalization of structural elements while keeping natural language for semantic content, as identified in the declarative-yaml-agent-orchestration finding.

AIWG's RLM addon schema (`rlm-task-tree.yaml`) is a concrete implementation of this approach: a JSON Schema-validated YAML document defining `TaskNode`, `QualityGate`, `ExecutionConfig`, and related types. The schema explicitly notes its `QualityGate` type was "inspired by OpenProse's ensures: result scoring 85+ against criteria obligation pattern" — a prior point of convergence.

### Why This Comparison Matters

The declarative-yaml-agent-orchestration research finding established that "NL prose as workflow control-flow language is novel and unoccupied in literature" — OpenProse's core research claim has no prior academic treatment. AIWG's RFC is the closest production analog to that claim, implemented with a different toolability-vs-expressiveness trade-off. Understanding the gap between them informs whether AIWG should move further toward Prose's model, stay the course with the JSON Schema approach, or pursue a hybrid.

---

## Comparison Dimensions

### 1. Contract Language: `ensures:` Obligation vs YAML `output:` Description

**OpenProse**: The `ensures:` keyword was chosen deliberately for its effect on model behavior. Tenet #4 states: "`ensures` is a commitment — a model reading 'ensures findings from 3+ sources' treats it as something it must make true." The language optimizes for model comprehension over developer familiarity. This means `ensures:` is not a type annotation or output schema; it is an assertion the model holds itself to during generation.

The three-channel design (Tenet #9) distinguishes `ensures` (success output as obligation), `errors` (signals when the service cannot produce anything), and `invariants` (properties holding regardless of outcome). This creates a richer contract surface than most frameworks provide.

**AIWG (ADR-020)**: AIWG's YAML schemas define `output:` as a structural description — field names, types, required/optional flags. The RLM task tree schema's `QualityGate` type comes closest to an obligation: it specifies `min_score`, `scoring_criteria`, `max_iterations`, and a `fallback` strategy. But the quality gate is a nested validation object attached to a task node, not the primary output declaration. The model reading a YAML schema field sees a structural constraint, not an obligation.

AIWG's flow Markdown files do contain natural language obligations today — "ensure all tests pass before transitioning" — but these are unstructured prose rather than a formalized contract slot.

| Dimension | OpenProse `ensures:` | AIWG YAML `output:` |
|-----------|----------------------|---------------------|
| Semantic intent | Obligation (model commits) | Description (structural shape) |
| Machine-parseable | No (NL prose) | Yes (JSON Schema) |
| Model-readable | High (optimized for comprehension) | Moderate (structured but not obligation-framed) |
| Validation at author time | No (no static checker) | Yes (`aiwg validate-metadata`) |
| Quality threshold expression | Native (`scoring 85+`) | Via nested `QualityGate` type |
| Error channel separation | Three channels | Single `output` field; errors implicit |
| Conditional output | `ensures` with `strategies:` | Not currently in schema |

**Assessment**: Prose's `ensures:` is more expressive as a behavioral specification; AIWG's `output:` is more useful for tooling. These are not substitutes for each other — they operate at different layers. AIWG needs both: the JSON Schema layer for validation and transformation, and an obligation-framing convention for the natural language portions of flow definitions that the model actually executes.

---

### 2. Interpreter Spec Pattern

**OpenProse**: Tenet #11 is the foundational claim: "The spec IS the implementation." `forme.md` and `prose.md` are Markdown files that, when loaded into an LLM's context, cause it to behave as specific kinds of machines. The `prose.md` document explicitly states this mechanism: "Large language models are simulators. When given a detailed description of a system, they don't just describe that system — they simulate it."

This pattern is used at two levels:
- `prose.md` makes the LLM behave as an execution VM.
- `forme.md` makes the LLM behave as a DI container.

Each new system capability is added by writing another interpreter spec, not by writing code. The behavioral spec is the artifact.

**AIWG**: AIWG uses this pattern empirically but does not formalize it. CLAUDE.md, agent `.md` files, skill definitions, and rule files all work by the same mechanism — loading them into the LLM's context changes how it behaves. But AIWG does not state this as a design principle. The distinction between "loading context that influences behavior" and "defining an interpreter spec" is not explicit in AIWG's current documentation.

The `agentic/code/frameworks/sdlc-complete/docs/orchestrator-architecture.md` describes AIWG's orchestration model, but the orchestrator is described in terms of agent roles and tool usage rather than as a VM that simulates a defined machine.

| Dimension | OpenProse | AIWG |
|-----------|-----------|------|
| Formalism | Explicit: interpreter spec pattern named and documented | Implicit: used but not named |
| Agent definitions | `.md` files are full interpreter specs | `.md` files define persona + tools; behavior via NL instructions |
| Extensibility | New capability = new interpreter spec | New capability = new agent/skill/command file |
| Documentation | `tenets.md` explains the why | CLAUDE.md explains the what |
| Runtime coupling | Requires Prose-complete runtime | Works with any Claude Code compatible environment |

**Assessment**: AIWG benefits from making the interpreter spec pattern explicit. Framing AIWG agent definitions as interpreter specs — rather than "persona files" — sets a clearer design target for what level of behavioral specificity an agent definition should achieve.

---

### 3. Forme Container vs AIWG SDLC Flow Orchestration

This is the dimension with the largest architectural gap.

**OpenProse (Forme)**: The Forme container reads component contracts and auto-wires a dependency graph from them without requiring explicit agent references in the program entry point. A component declares `requires: topic: a non-empty string describing what to research` and `ensures: findings: research findings from 3+ sources`. Forme matches these by semantic understanding. Components "don't discover each other — Forme discovers them" (Tenet #16). The manifest it produces is the explicit wiring, but authoring the wiring is optional — it is what the auto-wiring would produce, and authors can pin it if they need explicit control.

This model also means components are decoupled: a component does not reference other components by name. The wiring lives in the manifest, not in the component. This enforces loose coupling by design.

**AIWG**: AIWG's flow orchestration uses explicit agent naming. Flow files reference specific agents by name (`@requirements-analyst`, `@security-architect`). There is no auto-wiring from contracts; the flow author is responsible for specifying which agent handles which step. The `aiwg mc dispatch` system allows parallel task execution, but task composition is authored explicitly.

The AIWG SDLC flow model has capabilities Forme does not: phase gates (entry/exit criteria), phase-scoped artifact management, lifecycle tracking, and cross-flow traceability. Forme has no concept of SDLC phases; it is a general-purpose orchestration model.

| Dimension | OpenProse Forme | AIWG SDLC Flows |
|-----------|-----------------|-----------------|
| Wiring | Auto-wired from contracts | Explicit agent references |
| Coupling | Loose (components reference data shapes, not agents) | Tight (flows name specific agents) |
| Lifecycle phases | None | Five phases with gate criteria |
| Artifact management | Filesystem bindings (workspace/bindings split) | `.aiwg/` structured directories |
| Phase gates | None | Explicit gate criteria per phase |
| Traceability | None | Requirements-to-code-to-test traceability |
| Multi-program composition | Via `services:` list and Forme wiring | Via `aiwg mc dispatch` missions |
| Reusability | High (components portable across programs) | Moderate (agents portable, flows are project-specific) |
| Error recovery | `errors:` channel + conditional `ensures` | Implicit (agent-level retry logic) |

**Assessment**: AIWG's explicit agent naming in flows trades reusability for clarity. For an SDLC framework where agent roles are well-defined and phase context matters, this is defensible. However, AIWG lacks Forme's contract-driven composition model, which means adding a new step to a flow requires explicit wiring changes. A lightweight version of contract-based agent selection — where a flow specifies the data shape it needs and AIWG selects the appropriate agent from a catalog — would preserve AIWG's explicitness while reducing authoring burden.

---

### 4. YAML Schemas vs NL Contract Language

These represent fundamentally different positions on the toolability-vs-expressiveness trade-off.

**OpenProse**: Contract language is natural language embedded in YAML frontmatter. `requires:` and `ensures:` fields contain prose descriptions. Tenet #17 explains the collapse of type signature and contract: "In a language where the runtime reads prose, this distinction is unnecessary. The model doesn't need both." There is no static validator because the "type system" is model comprehension. Prose has a `prose compile` command that validates syntax but cannot validate semantic correctness.

**AIWG (ADR-020)**: JSON Schema provides static validation. `aiwg validate-metadata` enforces schema compliance before deployment. IDE plugins provide autocomplete. Provider-specific transformations are generated from the schema. The cost is expressiveness: JSON Schema can describe structural shapes and enumerate valid values, but it cannot express "findings from 3+ sources" as a meaningful constraint at validation time.

The RLM schema's `QualityGate.scoring_criteria` field is a string with an example: "Accuracy of extracted data, completeness of coverage, clarity of analysis." The schema validates that this is a string; it cannot validate whether the string is a good quality criterion.

| Dimension | OpenProse NL Contracts | AIWG JSON Schema |
|-----------|------------------------|------------------|
| Static validation | No (syntax only via `prose compile`) | Yes (full JSON Schema validation) |
| IDE autocomplete | No | Yes |
| Provider transformation | N/A (runtime is the LLM) | Yes (YAML → Claude Code hooks, Copilot instructions, etc.) |
| Semantic expressiveness | High (prose carries full intent) | Low (structural shapes only) |
| Model interpretation at runtime | Optimized (obligation language) | Not optimized (structural descriptions) |
| Schema evolution | Breaking changes = prose edits | Breaking changes detectable via `$schema` version |
| Learning curve | Low for prose authors | Moderate (JSON Schema composition) |
| Non-programmer accessibility | High | Low |

**Assessment**: The choice is not arbitrary — it reflects AIWG's multi-provider deployment requirement. A contract language the LLM interprets is not transformable into GitHub Actions YAML or Cursor rules without the LLM performing that transformation at deploy time. AIWG's JSON Schema approach is the right choice for its deployment target. However, AIWG could adopt obligation-framing conventions within its NL fields (the `description:` and `output:` prose in flow definitions) without changing the schema validation layer.

---

### 5. Ops Implementation Examples

Three comparisons ground the architectural differences in concrete programs.

#### captains-chair vs AIWG Concierge / Mission Control

The `captains-chair` example in OpenProse implements a six-phase feature development workflow: planning, parallel research, plan synthesis with critic review, implementation with review, testing, and final integration. The captain agent is invoked multiple times in different roles (planning, synthesis, final review); the program uses conditional logic (`if plan-review has critical concerns`) to drive revision loops; and the entire workflow is expressed in approximately 78 lines of readable prose with explicit data flow.

AIWG's equivalent is Mission Control (`aiwg mc dispatch`) combined with SDLC flow commands. The equivalent workflow would be distributed across a flow Markdown file (the orchestration), multiple agent definitions, and potentially a Ralph loop for the revision cycles. The data flow between steps is implicit in the agent prompt context rather than explicitly named as `let implementation-plan = call captain`.

The Prose version is more readable as a standalone document: a developer can trace the data flow without consulting agent definitions. The AIWG version has better infrastructure: cost tracking, persistent state, multi-session resilience via Ralph external loops, and provider portability. Prose's captains-chair is a more elegant program; AIWG's approach is more operationally robust.

#### the-forge vs AIWG SDLC Construction Phase

The `the-forge` example builds a working web browser in Rust across nine phases, with explicit `loop until <condition> (max: N)` patterns for each subsystem. Each loop runs a test agent (`quench`), checks for failures, and conditionally invokes a fix agent (`hammer`). The entire program is approximately 200 lines.

AIWG's SDLC Construction phase (`flow-construction-to-transition`) provides equivalent coverage but through a different model: agents are invoked by the orchestrator based on phase criteria, not by explicit `call` statements. AIWG's construction flow includes automated testing gates, security validation steps (SAST/DAST), and performance benchmarks — capabilities not present in `the-forge`. The-forge is more flexible (it can build anything); AIWG's construction flow is more complete for its specific domain (software delivery).

The key structural difference: the-forge's `loop until all networking tests pass (max: 5)` is an NL termination condition the model evaluates. AIWG's Ralph loop uses a `--completion` flag with a similar NL criterion. These are architecturally equivalent, but Prose's version is expressed inline as part of the program rather than as a CLI argument to a separate tool invocation.

#### language-self-improvement vs AIWG Dogfooding

The `language-self-improvement` example is directly analogous to AIWG's dogfooding pattern. It performs corpus excavation (parallel archaeologist and clinician calls), synthesis, proposal generation, spec patching, test creation, risk assessment, and migration guide writing — all in a single 70-line program. The program uses itself (the language spec files) as its input corpus.

AIWG dogfoods via the `aiwg sync` and `aiwg use` workflow, and via the SDLC framework applied to AIWG's own development. The difference is that AIWG's self-improvement workflow is distributed across multiple agent definitions and flow files, not expressed as a single self-contained program. The Prose version is more transparent about what the improvement workflow does; the AIWG version is more integrated with the operational tooling (version management, deployment, registry).

---

## Gap Analysis

### Gaps in AIWG That Prose Addresses

**Gap 1: Obligation-framed output declarations**
AIWG's `output:` fields in schemas and flow definitions describe structure; they do not commit the model to produce specific qualities. Prose's `ensures:` is a behavioral assertion. The RLM task tree schema's `QualityGate` type partially addresses this for task nodes (it was explicitly inspired by Prose's pattern), but quality obligations are not present in agent definitions, skill definitions, or flow output declarations.

**Gap 2: Contract-driven auto-wiring**
AIWG flows require explicit agent naming. Prose's Forme container infers wiring from `requires`/`ensures` compatibility. This means adding a new agent to an AIWG flow requires editing the flow definition. Prose components are portable across programs without modification because they don't reference other components by name.

**Gap 3: Formal error channel separation**
Prose distinguishes three channels: `ensures` (success output), `errors` (failure signals), and `invariants` (unconditional properties). AIWG's error handling is implicit — agents may fail, Ralph loops have retry logic, but the distinction between "degraded success" and "genuine failure" is not formalized in AIWG's skill or flow schemas. Tenet #9 explains why this matters: the orchestrator needs to distinguish between a service that produced partial output with caveats vs a service that could not produce anything.

**Gap 4: Inline conditional output via strategies**
Prose's `strategies:` block allows a component to declare alternative execution paths as part of its contract (e.g., `when score is below 85: refine targeting the specific issues identified`). AIWG has no equivalent inline conditional output declaration in its schema types. Conditional behavior in AIWG flows is implicit in agent prompts or expressed as separate flow branches.

**Gap 5: Program-level data flow legibility**
Prose programs express data flow explicitly via `let name = call service` assignments with named context parameters. AIWG flow files describe agent invocation sequences in prose, but the data dependencies between steps are implicit. A developer reading a Prose program can trace exactly what data flows where; a developer reading an AIWG flow must infer data dependencies from prose descriptions.

**Gap 6: Component decoupling via data shape references**
Prose components reference data shapes, not agent names. AIWG flows reference agent names directly. This creates tighter coupling in AIWG: if an agent is renamed or replaced, flow files must be updated. Prose programs are resilient to agent implementation changes as long as the data shapes remain compatible.

---

### Gaps in Prose That AIWG Addresses

**Gap 1: Multi-platform deployment**
Prose programs require a Prose-complete runtime. AIWG deploys to nine provider environments (Claude Code, Codex, Copilot, Factory, Cursor, OpenCode, Warp, Windsurf, OpenClaw) from a single source. The `providers:` map pattern in ADR-020 is specifically designed for this requirement, which Prose has no equivalent for.

**Gap 2: SDLC lifecycle phases and gate criteria**
Prose has no concept of lifecycle phases, phase transitions, gate criteria, or milestone tracking. AIWG's five-phase model (Inception → Elaboration → Construction → Transition → Production) with explicit gate conditions is domain-specific infrastructure that Prose's general-purpose model does not provide.

**Gap 3: Structured artifact management**
AIWG's `.aiwg/` directory structure provides organized storage for SDLC artifacts with predictable paths for requirements, architecture, testing, security, and deployment documents. Prose uses a `bindings/` filesystem model for inter-component data exchange, but has no concept of long-lived structured artifact directories. AIWG's artifact directory supports traceability (requirements → code → tests → deployment) that Prose cannot express.

**Gap 4: Cost tracking and model tiering**
AIWG has a cost tracking system (Issue #326) with `aiwg cost-report` and `aiwg cost-history`. The RLM task tree schema includes `preferred_model` (haiku/sonnet/opus) and `CostTracking` types per node. Prose's patterns document has a `model-tiering` section with task-to-model mappings, but this is advisory documentation rather than schema-enforced configuration. Prose has no cost tracking infrastructure.

**Gap 5: Schema validation and tooling**
Prose has no static validator for contract quality. `prose compile` validates syntax but not semantic correctness of `ensures:` obligations. AIWG's JSON Schema approach provides IDE autocomplete, `aiwg validate-metadata` enforcement, and provider-specific code generation. For enterprise adoption and contributor tooling, static validation has significant operational value.

**Gap 6: Imperative CLI and automation layer**
AIWG's 50-command CLI (`aiwg use`, `aiwg new`, `aiwg mc`, `aiwg ralph`, etc.) provides an automation layer for deployment, project scaffolding, and workflow management. Prose's `prose run` CLI is focused on program execution; there is no equivalent project management layer.

**Gap 7: Persistence across model transitions**
AIWG's Ralph external loop is designed for crash-resilient iterative execution across multiple model sessions. Prose programs run within a single Prose-complete session; multi-session resilience is not addressed. AIWG's `.aiwg/ralph-external/` state management handles session boundary recovery.

---

### Areas of Overlap

**Overlap 1: NL prose as the behavioral specification layer**
Both systems use natural language loaded into LLM context as the primary behavioral specification mechanism. The declarative-yaml-agent-orchestration finding noted that "AIWG occupies a hybrid position: YAML frontmatter for agent/command metadata, markdown NL prose for behavioral specification — which is the dominant industry pattern, implemented more formally in AIWG than in most frameworks." Prose formalizes this pattern more explicitly (via the interpreter spec pattern) but uses the same underlying mechanism.

**Overlap 2: Quality gate / self-refinement loops**
Both systems implement iterative refinement with quality thresholds. Prose's `rlm-self-refine` example uses `ensures: result scoring 85+ against criteria` with `max 5 refinement iterations`. AIWG's `QualityGate` schema type specifies `min_score`, `scoring_criteria`, `max_iterations`, and `fallback` behavior. The RLM task tree schema's `QualityGate` was explicitly modeled on Prose's pattern, and the implementations are structurally equivalent.

**Overlap 3: Parallel agent execution**
Prose's `parallel:` block and `parallel for` pattern map directly to AIWG's multi-Task tool calls issued in a single message. The `subagent-scoping.md` rule requires parallel reviewers to be launched in a single message to achieve true parallelism. The operational behavior is identical; only the syntax differs.

**Overlap 4: Model tiering by task complexity**
Both systems assign model tiers based on task complexity. Prose's patterns document defines Sonnet for orchestration and Opus for complex reasoning. AIWG's RLM task tree schema defines `preferred_model` as `haiku` (screening), `sonnet` (orchestration/synthesis), or `opus` (hard reasoning/final judgment). The categories are closely aligned, with AIWG adding the haiku tier for simple tasks.

**Overlap 5: Filesystem-based inter-agent data exchange**
Prose uses `workspace/` (private) and `bindings/` (public, declared `ensures` outputs). AIWG uses the filesystem extensively for inter-agent data exchange, with `.aiwg/working/` for temporary state and structured subdirectories for baselined artifacts. Tenet #5 explicitly rejects shared mutable state in favor of service-to-service communication via filesystem, which aligns with AIWG's practice.

**Overlap 6: RLM-inspired iterative patterns**
The REF-089 analysis found that AIWG's Ralph TAO loop is structurally equivalent to RLMs' iterative REPL loop. OpenProse's `rlm-self-refine`, `rlm-divide-conquer`, `rlm-filter-recurse`, and `rlm-pairwise` examples operationalize the same RLM patterns that AIWG's RLM addon (Issue #321) addresses. Both systems are independently converging on the same recursive decomposition patterns identified in Zhang et al. (2026).

---

## Adoption Recommendations

### Adopt: Obligation-framing convention for NL output declarations

**Recommendation**: In AIWG's skill definitions, agent definitions, and flow output declarations, adopt obligation language for `ensures`-equivalent fields. This does not require changing the JSON Schema layer; it requires a writing convention for the prose portions.

**Specific change**: AIWG's skill `output:` field currently contains structural descriptions ("a markdown document containing..."). Reframe these as model commitments ("ensures a markdown document containing at least 3 concrete recommendations, with each recommendation grounded in evidence from the research corpus"). The schema validates the field is present; the model's interpretation of obligation vs description language determines output quality.

**Evidence basis**: Prose Tenet #4 provides the design rationale; the RLM task tree schema's `QualityGate.scoring_criteria` already uses this framing for quality thresholds.

**Implementation**: Update the AIWG development guide with an "obligation framing" convention. No schema changes required. Applicable immediately to new skill and flow definitions.

**Follow-on issue**: "Add obligation-framing convention to skill and flow authoring guide; audit existing skill output declarations for structural-vs-obligation language"

---

### Adopt: Three-channel output model (`ensures` / `errors` / `invariants`)

**Recommendation**: Formally distinguish success output, failure signals, and unconditional properties in AIWG's skill and flow schemas. The current unified `output:` field conflates all three.

**Specific change**: Add optional `invariants:` and `errors:` fields to the skill schema alongside `output:`. `invariants:` captures properties that must hold regardless of success or failure (e.g., "audit log is always appended"). `errors:` captures failure signals the orchestrator should distinguish from degraded success.

**Evidence basis**: Prose Tenet #9 explains the design reasoning. AIWG's error handling currently relies on implicit retry logic and Ralph completion criteria; a formalized three-channel model would make failure contracts explicit.

**Caution**: This is a schema change with migration implications for existing skill definitions. Introduce as optional fields with backward compatibility.

**Follow-on issue**: "RFC: Add invariants: and errors: fields to skill and agent schemas; implement three-channel output model"

---

### Adapt: Contract-based agent selection for flow composition

**Recommendation**: Do not implement full Forme-style auto-wiring (which would require the LLM to resolve wiring at deploy time — incompatible with ADR-020's static validation goal). Instead, adapt the concept: add a `capability-tags:` field to agent definitions and a `requires-capability:` field to flow steps. This allows tooling to validate that a flow step's required capability is provided by a deployed agent, without requiring LLM-based semantic matching.

**Specific change**: A flow step that currently says "invoke @requirements-analyst" could instead declare `requires-capability: requirements-analysis`. The `aiwg validate-metadata` tool checks that a deployed agent with that capability tag exists. This decouples the flow from the specific agent name while maintaining static validatability.

**Evidence basis**: Forme's auto-wiring is powerful but requires LLM execution to resolve. The adapted version gets the decoupling benefit with toolability. Prose Tenet #16 states "components don't discover each other — Forme discovers them"; the adaptation achieves loose coupling through a different mechanism.

**Follow-on issue**: "Add capability-tags to agent definitions; add requires-capability to flow step schema; implement capability validation in aiwg validate-metadata"

---

### Adapt: Inline conditional output via `strategies:` in skill definitions

**Recommendation**: Add an optional `strategies:` field to AIWG's skill schema to capture conditional execution paths as part of the skill contract rather than buried in the skill's prose instructions. This improves legibility and allows tooling to surface alternative paths.

**Specific change**: A skill's strategies block would be a list of `when: <condition> → <behavior>` pairs. The schema validates structure; the prose content remains NL. This is an adaptation of Prose's `strategies:` construct (Tenet #15) to AIWG's schema-validated context.

**Evidence basis**: The `rlm-self-refine` example shows how strategies improve legibility of conditional output contracts. AIWG's current skill definitions embed conditional behavior in prose paragraphs with no structural marker.

**Follow-on issue**: "Add strategies: field to skill schema; update authoring guide with strategy patterns"

---

### Leave: Full Forme auto-wiring

**Recommendation**: Do not implement Forme's auto-wiring model as specified in OpenProse. The LLM-based semantic contract matching is elegant but fundamentally incompatible with ADR-020's static validation requirement. The adapted capability-tag approach (above) captures the decoupling benefit without requiring LLM execution at wiring time.

**Rationale**: Forme's wiring resolves at runtime by LLM understanding. This is a deliberate bet (Tenet #2) that works in Prose's model because the runtime is the LLM. AIWG's multi-provider deployment model requires that wiring be deterministic and validatable before the LLM is invoked. These requirements are in fundamental tension.

---

### Leave: Interpreter spec as primary development model

**Recommendation**: Documenting and leveraging the interpreter spec pattern (Tenet #11) for AIWG is valuable; adopting it as the primary development model (replacing code with interpreter specs for new capabilities) is not. AIWG's TypeScript codebase provides testability, type safety, and CI/CD integration that interpreter-spec-only development does not.

**Rationale**: Prose's "the spec IS the implementation" works for agent behavior specifications. It does not work for CLI tooling, schema validation, or deployment automation — capabilities that require deterministic, testable code. AIWG should continue writing TypeScript for infrastructure and use the interpreter spec pattern for behavioral specifications.

---

### Contribute Back: Multi-platform deployment model

**Recommendation**: AIWG's `providers:` map pattern from ADR-020, and the overall model of deploying a single source artifact to multiple provider environments, is a capability Prose lacks. This could be contributed back to OpenProse as an optional `providers:` extension to the program frontmatter.

**Specific contribution**: A `providers:` block in a Prose program's frontmatter that maps to platform-specific deployment conventions (e.g., `claude-code:` specifying the `.claude/skills/` destination, `copilot:` specifying the `.github/prompts/` path). The Prose runtime would ignore this block; AIWG-compatible tooling would consume it.

**Evidence basis**: Prose programs are currently platform-tied to any Prose-complete runtime. Adding lightweight deployment metadata would make them portable across the nine provider environments AIWG supports.

---

### Contribute Back: Quality gate schema as a standard

**Recommendation**: AIWG's `QualityGate` type in the RLM task tree schema — `min_score`, `scoring_criteria`, `scorer_model`, `max_iterations`, `fallback`, `iteration_history` — is a more complete formalization of Prose's `ensures: scoring 85+` pattern than Prose itself has. Propose this as a standard Prose `quality-gate:` extension in the program frontmatter or `ensures:` block.

---

## Follow-On Issues

Based on the Adopt and Adapt recommendations above, the following issues should be created:

| Issue Title | Type | Priority | Linked ADR/Finding |
|-------------|------|----------|--------------------|
| Add obligation-framing convention to skill and flow authoring guide; audit existing skill output declarations | Docs + audit | High | ADR-020, this finding |
| RFC: Add `invariants:` and `errors:` fields to skill and agent schemas | Schema RFC | Medium | ADR-020 |
| Add `capability-tags:` to agent definitions; add `requires-capability:` to flow step schema; implement validation in `aiwg validate-metadata` | Feature | Medium | ADR-020 |
| Add `strategies:` field to skill schema; update authoring guide with strategy patterns | Schema + Docs | Low | ADR-020 |
| Propose `providers:` extension to OpenProse program frontmatter | External contribution | Low | ADR-020 |
| Propose `quality-gate:` extension to OpenProse ensures contract | External contribution | Low | RLM addon #618 |

---

## References

- ADR-020: `/mnt/dev-inbox/jmagly/aiwg/.aiwg/architecture/decisions/ADR-020-yaml-metalanguage.md`
- Declarative YAML orchestration finding: `/mnt/dev-inbox/jmagly/aiwg/.aiwg/research/findings/declarative-yaml-agent-orchestration.md`
- REF-089 RLM analysis: `/mnt/dev-inbox/jmagly/aiwg/.aiwg/research/findings/REF-089-recursive-language-models.md`
- OpenProse tenets: `/tmp/prose/skills/open-prose/guidance/tenets.md`
- OpenProse patterns: `/tmp/prose/skills/open-prose/guidance/patterns.md`
- OpenProse VM spec: `/tmp/prose/skills/open-prose/prose.md`
- Forme container spec: `/tmp/prose/skills/open-prose/forme.md`
- RLM self-refine example: `/tmp/prose/skills/open-prose/examples/40-rlm-self-refine/index.md`
- Captains-chair example: `/tmp/prose/skills/open-prose/examples/29-captains-chair/index.md`
- The-forge example: `/tmp/prose/skills/open-prose/examples/37-the-forge/index.md`
- Language self-improvement example: `/tmp/prose/skills/open-prose/examples/47-language-self-improvement/index.md`
- RLM task tree schema: `/mnt/dev-inbox/jmagly/aiwg/agentic/code/addons/rlm/schemas/rlm-task-tree.yaml`
- Zhang et al. (2026). Recursive Language Models. arXiv:2512.24601v2. (cited via REF-089 analysis — paper not directly accessed)
