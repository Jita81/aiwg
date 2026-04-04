# Research Finding: Agent-Oriented Estimation

**Filed**: 2026-04-04  
**Status**: Synthesized from corpus  
**Relevant REFs**: REF-086, REF-088, REF-127, REF-169  
**Action**: ADR accepted, rule implemented (no-time-estimates.md)

---

## Finding

Time-based effort estimation is structurally incompatible with human-AI centaur development configurations. The research corpus provides sufficient grounding to replace time estimates with five agent-oriented metrics: scope count, agent count/roles, parallelism map, pass estimate, and quality gate.

---

## Evidence from Corpus

### Velocity is Non-Scalar in Centaur Configurations (REF-169)

Evans et al. 2026 introduce "centaur configurations" — human-AI composite actors where one human directs many agents, one AI serves many humans, or many of each collaborate dynamically. This fission-fusion dynamic makes the notion of "developer velocity" meaningless: the same operator with different tooling produces wildly different throughput. Traditional effort estimation assumes a stable individual velocity baseline that does not exist in centaur configurations.

Key claim: "The path to more powerful AI runs through composing richer social systems rather than building singular colossal oracles." The implication for estimation: you cannot estimate the output of a social system by estimating the output of one node.

### Agent Count Has Non-Linear Relationship with Output (REF-086)

DeepMind's multi-agent scaling research shows performance is determined by the interaction of four factors: agent quantity, coordination structure/topology, model capability, and task properties. Critically:

- Above 4 concurrent agents in "bag of agents" architecture: 17.2× error amplification
- Communication overhead: n*(n-1)/2 paths (6 at 4 agents, 15 at 6)
- Single-agent baseline above 45%: adding agents may introduce more noise than value
- Optimal configuration requires matching topology to task type, not just adding agents

The implication: "We have 5 agents working on this" does not predict throughput without knowing topology, model, and task structure.

### Duration Has Negative Returns Beyond Threshold (REF-127)

Zylos 2026 empirically documents:
- 35-minute degradation threshold: agent performance degrades measurably beyond this
- Doubling agent run duration quadruples (4×) failure rate
- Planner-Worker decomposition dominant pattern for long-horizon tasks
- Structured recovery required (checkpointing, context compaction) to sustain beyond threshold

The implication: "More time" does not equal "more progress." Duration estimates are predictors of nothing useful.

### Parallelism Compresses Time But Is Topology-Dependent (REF-088)

DEV Multi-Agent Guide documents:
- Parallel execution can cut sequential timelines by 60-80%
- But this is conditional on task independence and correct topology selection
- 3-7 agents is the empirical sweet spot before coordination overhead exceeds benefit
- Communication overhead grows exponentially; monitoring for >200ms latency is critical

The implication: Parallelism potential (how many work units are truly independent) is more actionable than any time estimate, because it directly informs orchestration decisions.

---

## Research Gaps

The corpus lacks:

1. **Empirical study of AI-assisted software estimation accuracy**: How wrong are LLM-generated time estimates? No paper directly measures this.

2. **Operator variance in centaur configurations**: REF-169 posits variance is high, but no paper quantifies it across operators, models, and task classes.

3. **Pass estimate accuracy by domain**: Do agents correctly estimate that "this needs 3 iterations" more often for certain task types (bug fixes vs. migrations vs. new features)?

4. **Scope unit calibration**: No research on how to normalize "atomic work items" across different domains (infrastructure vs. UI vs. ML pipelines).

**Recommended searches for induction**:
- "GitHub Copilot developer productivity" (Peng et al. 2023, arXiv:2302.06590 — well-known, not yet in corpus)
- "Software effort estimation machine learning" (if measurable at all)
- "AI pair programming variance" 
- "Agile velocity AI assistance impact"

---

## Implications for AIWG

1. **Rule**: `no-time-estimates.md` — prohibits time-based estimates, requires agent-oriented metrics
2. **ADR**: Decision captured in `.aiwg/architecture/adr-agent-oriented-estimation.md`
3. **Templates**: Phase plan and iteration plan templates need updating to remove duration fields, add parallelism map and pass estimate sections
4. **Training data**: Future AIWG evals should include examples where time estimate requests are redirected to scope/pass/parallelism outputs
