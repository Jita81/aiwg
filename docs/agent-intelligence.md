# Agent Intelligence: Constraint Learning and Grounding

**Issues:** #146 (constraint learning), #184 (grounding agents)
**Version:** 2026.2.0
**Status:** Active

## Overview

AIWG includes two systems that improve agent quality beyond static prompt engineering: constraint learning (agents that improve their own behavior based on feedback) and grounding agents (agents that verify output against factual domain knowledge).

These systems address different problems. Constraint learning fixes recurring mistakes that accumulate over time. Grounding prevents hallucination by anchoring claims to a searchable knowledge base.

## Constraint Learning (#146)

### What It Does

Constraint learning collects feedback from agent executions — validation failures, review rejections, low quality scores, human corrections — and analyzes it for recurring patterns. When a pattern occurs frequently enough, the system generates a proposed constraint update for that agent's prompt and presents it for human review before applying it.

The result: agents that improve their behavior based on actual project experience, not just initial prompt engineering.

### How It Works

**Feedback collection** happens automatically when:
- A validation step rejects an artifact
- A human reviewer corrects agent output
- Quality scoring falls below threshold
- A test failure is attributed to agent-generated code

Each feedback entry records the agent, artifact path, feedback type, severity, and context. Feedback is stored in `.aiwg/feedback/{agent}/`.

**Pattern analysis** clusters feedback entries by description similarity. Clusters with two or more occurrences become candidates for constraint proposals. Only clusters with three or more occurrences (or single critical occurrences) generate actionable proposals.

**Constraint proposals** are human-gated. The system generates a proposal showing:
- Which patterns were detected
- How often each occurred
- The suggested constraint text
- A diff of what would change in the agent prompt

Operators approve, reject, or defer each proposal. Approved proposals are applied as a new prompt version. Previous versions are retained for rollback.

### Prompt Versioning

Each agent can have multiple versioned prompts in `.aiwg/.prompts/{agent}/`:

```
v1.md    ← Initial prompt
v2.md    ← After applying constraint batch A
v3.md    ← After applying constraint batch B
```

If a new version performs worse, rolling back to a previous version takes one command and logs the rollback event. Performance tracking compares quality scores and error rates between versions.

### Storage Layout

```
.aiwg/
├── feedback/
│   ├── architecture-designer/
│   │   ├── fbc-00001.json
│   │   └── fbc-00002.json
│   └── test-engineer/
│       └── fbc-00001.json
├── .lessons/
│   └── architecture-designer/
│       └── lesson-001.json
└── .prompts/
    └── architecture-designer/
        ├── v1.md
        └── v2.md
```

### Source Files

- `src/quality/feedback-collector.ts` — Feedback collection, pattern analysis, constraint proposal generation
- `agentic/code/frameworks/sdlc-complete/schemas/research/agent-learning.yaml` — Schema for feedback entries, lessons, and prompt versions

### Configuration

```yaml
# .aiwg/config/constraint-learning.yaml
feedback_collection:
  sources:
    - type: validation_failure
      auto_collect: true
    - type: human_correction
      severity_threshold: all
  retention:
    max_entries_per_agent: 1000
    max_age_days: 90

learning_pipeline:
  analysis:
    min_samples: 5
    clustering:
      min_cluster_size: 3

prompt_evolution:
  approval_gate:
    required: true
    approvers: [human]
  rollback:
    max_versions: 10
```

## Grounding Agents (#184)

### What They Do

Grounding agents verify claims and retrieve relevant knowledge from domain knowledge bases before agents generate output. They prevent hallucination by ensuring that domain-specific statements are checked against known-good content rather than generated from context alone.

This pattern implements the AutoGen (REF-022) grounding approach, which shows improved domain accuracy when agents have access to a structured knowledge base for their domain.

### How It Works

A grounding agent covers a specific domain (security, performance, compliance, technology). When an agent working in that domain is about to make a claim or recommendation, the grounding agent:

1. Searches the knowledge base for relevant entries matching the query
2. Returns the most relevant fragments with source attribution
3. Provides a verification result: `verified: true/false` with confidence score and source references

If no relevant knowledge exists, the grounding agent returns `confidence: 0` and a correction message indicating the knowledge base has no relevant entries — which prompts the generating agent to hedge its claim appropriately.

### Knowledge Base Structure

Domain knowledge lives in `.aiwg/knowledge/{domain}/` as JSON files:

```
.aiwg/
└── knowledge/
    ├── security/
    │   ├── auth-patterns.json
    │   └── owasp-controls.json
    ├── performance/
    │   └── benchmarks.json
    └── compliance/
        └── soc2-controls.json
```

Each JSON file contains entries with this shape:

```json
{
  "entries": [
    {
      "id": "sec-001",
      "topic": "JWT token validation",
      "content": "JWT tokens must be validated against a public key, never against the payload itself.",
      "source": "OWASP JWT Security Cheat Sheet",
      "keywords": ["jwt", "token", "validation", "signature"]
    }
  ]
}
```

### Interfaces

```typescript
interface GroundingAgent {
  domain: string;
  verify_claim(claim: string): Promise<VerificationResult>;
  retrieve_knowledge(query: string, options?: { limit?: number }): Promise<KnowledgeFragment[]>;
}

interface VerificationResult {
  claim: string;
  verified: boolean;
  confidence: number;
  sources: string[];
  correction?: string;
}
```

### Adding Knowledge Bases

```bash
# Add a knowledge file to a domain
aiwg ground-add security ./my-security-controls.json

# Check which domains are loaded
aiwg ground-status

# Validate a file against grounding rules
aiwg ground-check src/auth/token-handler.ts

# Validate a specific category
aiwg ground-check src/auth/ --category security
```

### Configuration

Grounding agents are configured per-agent or globally:

```yaml
# .aiwg/config/grounding.yaml
grounding:
  enabled: true
  enforcement: strict       # strict | advisory | disabled
  agents:
    - domain: security
      apply_to: [security-architect, security-auditor]
      trigger: auto
      knowledge_path: .aiwg/knowledge/security/
    - domain: performance
      apply_to: [architecture-designer]
      trigger: manual
      knowledge_path: .aiwg/knowledge/performance/
```

Under `strict` enforcement, claims that fail grounding verification block agent output and request revision. Under `advisory`, violations are annotated as warnings but do not block. Under `disabled`, the grounding agent is loaded but never invoked.

### Source Files

- `src/agents/grounding/knowledge-base.ts` — `KnowledgeStore` class: load, search, and verify against knowledge bases
- `src/agents/grounding/types.ts` — `GroundingAgent`, `VerificationResult`, `KnowledgeFragment`, `KnowledgeBase` interfaces
- `agentic/code/frameworks/sdlc-complete/schemas/flows/grounding-agents.yaml` — Grounding configuration schema and validation result structure

## How They Relate

Constraint learning and grounding agents address different timescales:

| System | When It Acts | What It Improves |
|--------|-------------|------------------|
| Grounding | At generation time | Factual accuracy of current output |
| Constraint learning | Over time | Recurring behavioral patterns |

A grounding agent catches a specific claim that cannot be verified. Constraint learning notices that the architecture-designer has made unverifiable claims about JWT handling three times in the past month and proposes adding a constraint to always check the security knowledge base before making auth-related claims.

The two systems reinforce each other: grounding provides immediate feedback that feeds into constraint learning's feedback collection.

## References

- `src/quality/feedback-collector.ts` — Constraint learning implementation
- `src/agents/grounding/knowledge-base.ts` — Grounding implementation
- `agentic/code/frameworks/sdlc-complete/schemas/research/agent-learning.yaml` — Learning schema
- `agentic/code/frameworks/sdlc-complete/schemas/flows/agent-efficiency.yaml` — Agent efficiency framework (includes grounding config)
- @agentic/code/frameworks/sdlc-complete/rules/failure-mitigation.md — Related failure archetype mitigations
