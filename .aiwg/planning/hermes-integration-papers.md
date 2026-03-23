# Research Papers: Hermes Integration & Context Architecture

**Date**: 2026-03-23
**Purpose**: Supporting literature for Hermes Agent + AIWG integration design decisions

---

## 1. Retrieval-Augmented Agent Memory

### A-MEM: Agentic Memory for LLM Agents
- **Authors**: Wujiang Xu, Zujie Liang, Kai Mei, Hang Gao, Juntao Tan, Yongfeng Zhang
- **Year**: 2025
- **URL**: https://arxiv.org/abs/2502.12110
- **Relevance**: Zettelkasten-inspired external memory where each unit is a structured note with contextual descriptions, keywords, and tags. Related memories dynamically linked via semantic similarity — an interconnected knowledge graph. Maps directly to AIWG's `.aiwg/` artifact store design and supports the "pointer not body" memory boundary rule for Hermes.

### Memory in the Age of AI Agents: A Survey
- **Authors**: Shichun Liu et al.
- **Year**: 2025 (December)
- **URL**: https://arxiv.org/abs/2512.13564
- **Relevance**: Proposes taxonomy: factual, experiential, and working memory (semantic, episodic, procedural). The distinction between semantic memory (stable knowledge substrate) and episodic memory (event-specific with temporal context) maps to AIWG's split between baselined artifacts (architecture docs, requirements) and working/transient files.

---

## 2. Context Window Management for Local Models

### ACON: Optimizing Context Compression for Long-horizon LLM Agents
- **Authors**: Minki Kang et al.
- **Year**: 2025 (October)
- **URL**: https://arxiv.org/abs/2510.00615
- **Relevance**: Reduces memory usage by **26-54%** while preserving >95% accuracy. When distilled into smaller compressors, enables up to **46% performance improvement** for smaller LMs as long-horizon agents. Uses natural-language compression guidelines optimized from paired success/failure trajectories. Directly supports the case for running AIWG workflows on 9B-27B local models with aggressive context management.

### Context Cascade Compression (C3): Exploring the Upper Limits of Text Compression
- **Year**: 2025 (November)
- **URL**: https://arxiv.org/abs/2511.15244
- **Relevance**: Two-stage cascade where a small LLM compresses long context into latent tokens consumed by a larger model. Relevant to the Hermes `summary_model` pattern where a small efficiency-tier model (qwen3.5:9b) handles context summarization for a larger coding model (qwen2.5-coder:14b).

### Pretraining Context Compressor for Large Language Models
- **Year**: 2025 (ACL 2025)
- **URL**: https://aclanthology.org/2025.acl-long.1394.pdf
- **Relevance**: Condenses long context into embedding-based memory slots for fast inference. The compressed representations act as semantic cache, reducing token budget per query while retaining retrieval quality.

---

## 3. MCP-Based Tool Integration Patterns

### MCP-Diag: A Deterministic, Protocol-Driven Architecture for AI-Native Network Diagnostics
- **Year**: 2026 (January)
- **URL**: https://arxiv.org/abs/2601.22633
- **Relevance**: First academic paper building a production system on MCP. Validates the sidecar pattern — each external integration runs as an isolated process communicating via JSON-RPC 2.0. Directly validates AIWG's `aiwg mcp serve` as an MCP sidecar connected to Hermes.

### MCP Architecture (Anthropic, 2024)
- **URL**: https://modelcontextprotocol.io/docs/learn/architecture
- **Relevance**: Canonical reference. MCP solves the N-by-M integration problem. Sidecar pattern: each external integration as a dedicated MCP server, isolated process, standardized JSON-RPC.

---

## 4. Artifact-Backed Workflow State

### AFlow: Automating Agentic Workflow Generation (ICLR 2025 Oral)
- **Authors**: Zhang, Xiang et al.
- **Year**: 2024/2025
- **URL**: https://arxiv.org/abs/2410.10762
- **Relevance**: Reformulates workflow optimization as search over code-represented workflows, persisted as artifacts with defined operators (Generate, Review & Revise, Ensemble, Test). Demonstrates weaker models outperform stronger models with optimized workflow structures. Validates AIWG's file-based workflow state in `.aiwg/` as a superior pattern vs. in-memory state.

### A Survey on Agent Workflow — Status and Future
- **Authors**: Chaojia Yu et al.
- **Year**: 2025
- **URL**: https://arxiv.org/abs/2508.01186
- **Relevance**: Identifies shift toward "flow engineering" with explicit state transitions, guardrails, checkpointing, and human approvals as persistent workflow artifacts. Aligns with AIWG's artifact-driven phase transitions vs. in-memory state.

---

## 5. Multi-Agent Memory Boundaries

### Multi-Agent Memory from a Computer Architecture Perspective: Visions and Challenges Ahead
- **Year**: 2026 (March)
- **URL**: https://arxiv.org/abs/2603.10062
- **Relevance**: Frames multi-agent memory as a computer architecture problem. Proposes three-layer hierarchy (I/O, cache, memory) with shared vs. distributed paradigms. Identifies cache sharing and structured memory access control as critical protocol gaps. Directly relevant to AIWG's multi-agent orchestration where parallel reviewers must read/write `.aiwg/` artifacts without conflicts.

### Collaborative Memory: Multi-User Memory Sharing in LLM Agents with Dynamic Access Control
- **Year**: 2025 (May)
- **URL**: https://arxiv.org/abs/2505.18279
- **Relevance**: Private/shared memory tiers with access control graphs. Maps to AIWG's pattern: each agent has `working/` for scratch state, reads from shared baselined artifacts.

### Intrinsic Memory Agents: Heterogeneous Multi-Agent LLM Systems through Structured Contextual Memory
- **Year**: 2025 (August)
- **URL**: https://arxiv.org/abs/2508.08997
- **Relevance**: Role-aligned memory that evolves intrinsically with agent outputs. Each agent maintains domain-specific context rather than sharing a monolithic store. Supports AIWG's agent design: Security Architect, Test Engineer, Requirements Analyst each maintain specialized context.

---

## Key Design Implications

### For the Hermes integration specifically:

| Paper | Implication |
|---|---|
| A-MEM | `.aiwg/` artifact store is already the right pattern — structured linked notes, not raw blobs |
| ACON | Use `delegate_task` + lean AGENTS.md + 5-tool whitelist → 26-54% effective context reduction |
| MCP-Diag | Validates MCP sidecar as production-grade architecture, not experimental |
| AFlow | Artifact-backed workflow state outperforms in-memory state even with weaker models |
| Multi-Agent Memory CompArch | Cache sharing is the unsolved problem — AIWG's baselined artifact model partially addresses this |
