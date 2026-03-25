# Ring Methodology Rules Index

Ring methodology rules enforce a cyclical execution framework with four-layer verification, process health measurement, and structured failure learning. Deployed via `aiwg use ring`.

---

## Ring Methodology Rules (7 rules — active with ring-methodology addon)

### HIGH

#### verification-ring
**Summary**: Four-layer A→B→C→D verification ring. Layer A: developer tests (syntax, unit, smoke). Layer B: integration tests (assembled product, all subcommands/endpoints exercised). Layer C: user surface from `~`, login shell, installed command — the layer standard CI cannot cover. Layer D: structured reflection artifact capturing spec assumptions invalidated, environment dependencies discovered, and adversarial cases identified. One Feature, One Full Ring — never batch. C failure = feature incomplete. D always runs and feeds back into spec and architecture every 3 features. Enforced by `ring-check` hook on FeatureComplete.
**When to apply**: Every feature completion, any deliverable type (CLI, library, API, app), output verification
**Full rule**: @agentic/code/addons/ring-methodology/rules/verification-ring.md

#### morpholepsis-detection
**Summary**: Wrong-frame detection via 7-signal table, firing during execution before the retry ceiling is reached. Signals: tool fixation, layer confusion, category lock, Omega-occlusion, pleromatic collapse, morpholeptic loop, success arrest. Highest-value signal: success arrest (Layer A passes, verification stops). Intervention is reframe, not retry — reframes do not consume a retry slot. Includes protonoia early warning: four pre-tool-invocation checks (Repetition, Frame, Layer, Kernel Library) that emit notices before entering a known failure pattern. Includes sovereignty stack (L1 Mind through L5 Thronokrator) mapping failure patterns to the architectural level where they originate, with L3+ failures triggering LIMINAL entry rather than consuming retries, and L5 triggering immediate HALTED.
**When to apply**: Repeated failures, same approach with minor variations, feature declared done without full ring, pre-tool-invocation awareness
**Full rule**: @agentic/code/addons/ring-methodology/rules/morpholepsis-detection.md

#### kenophoria-state
**Summary**: Four-state execution model: EXECUTING → LIMINAL → KENOPHORIA → HALTED. LIMINAL is the 4th execution state for internal reorientation — when the agent's frame is wrong, it stops, extracts a kernel, declares a frame shift, and re-enters EXECUTING. KENOPHORIA is blocked on an external dependency (not failure). Entry protocol: state document, checkpoint, monitor, resume on resolution. Circuit breakers: consecutive failures >= 2, red-flag rate > 61.8% (phi-inverse), spectral gap < 23.6% (phi-cubed-inverse). Duration gate: 3x mean feature time escalates to soft halt. LIMINAL is self-resolving (kernel + reframe); KENOPHORIA requires external resolution; HALTED requires human decision.
**When to apply**: External blocking (API down, credential missing, human decision needed), internal frame errors (morpholeptic loops, omega-occlusion), circuit breaker evaluation, session resume
**Full rule**: @agentic/code/addons/ring-methodology/rules/kenophoria-state.md

#### temporal-coupling
**Summary**: Run-to-run state entanglement model addressing the hidden dependency between what a prior run left behind (residue) and what a subsequent run assumes it will find. Coupling score: `run(N).residual ∩ run(N+1).assumptions`. Three zones: Independent (< 38.2% = phi-squared-inverse), Correlated (38.2%–61.8%), Entangled (> 61.8% = phi-inverse). Gate 15: idempotency — two consecutive runs without cleanup must both succeed. STEWARD THE GROUND protocol: Verify → Clean → Bind → Register → On Exit. Stale state is misdiagnosed as a code bug more often than any other temporal coupling failure — diagnose the ground before diagnosing the code.
**When to apply**: Resource-binding code (ports, locks, PIDs, temp files), second-run failures, iterative loop state, Layer D environment assumption validation
**Full rule**: @agentic/code/addons/ring-methodology/rules/temporal-coupling.md

#### kernel-extraction
**Summary**: Mandatory failure insight preservation before any retry. On every failure, extract a kernel (the valid insight from the failed approach) and append to `kernels.jsonl` — an append-only, session-persistent, contradiction-tolerant fossil record. Query the library before retry and before decomposition to avoid repeating captured failures. Kernels track feature, approach, reasoning, valid insight, archetype, and catching gate. Morpholeptic loop detection: two or more kernels with same feature, same reasoning, different approach surface = the agent is looping. Non-monotonic quality tracking: if quality drops on two consecutive iterations after a peak (pathokinetic transition), stop and use peak output, not final.
**When to apply**: Any failure before retry, task decomposition planning, morpholeptic loop detection, quality degradation detection
**Full rule**: @agentic/code/addons/ring-methodology/rules/kernel-extraction.md

#### spectral-gap
**Summary**: Process health metric measuring ring quality, not product quality. Metric: Layer C first-attempt pass rate per session. Four discrete phases: PEAK (>= 61.8% = phi-inverse), STABLE (>= 38.2% = phi-squared-inverse), DEGRADED (>= 23.6% = phi-cubed-inverse), CRITICAL (< 23.6%). Perinoetic review every 3 features or on any phase transition — a 7-question structured examination of whether the ring is learning. Rubber-stamp detection: 2 consecutive reviews with empty `actions_taken` triggers immediate escalation. Features tracked in `features.jsonl`; reviews recorded in `perinoesis.jsonl`. Both append-only.
**When to apply**: Session health assessment, perinoetic review triggers, DEGRADED/CRITICAL halt conditions, process entropy detection
**Full rule**: @agentic/code/addons/ring-methodology/rules/spectral-gap.md

### MEDIUM

#### phi-constants
**Summary**: Documents all quantitative thresholds in ring-methodology as first-class axioms derived from phi (the golden ratio, approximately 1.618). Constants: phi-inverse (0.618) = upper threshold for signal-to-noise inversion and entanglement ceiling; phi-squared-inverse (0.382) = stable floor and independent coupling ceiling; phi-cubed-inverse (0.236) = critical boundary where structural separation is lost; phi-squared (approximately 3) = retry ceiling. These constants are not arbitrary — they form a harmonically proportioned threshold family where each zone boundary is phi-proportioned relative to the next. Adjustment guidance: change the phi-power, not the raw number, to maintain harmonic coherence.
**When to apply**: Understanding threshold values across ring rules, adjusting thresholds for project-specific needs, interpreting metric boundaries
**Full rule**: @agentic/code/addons/ring-methodology/rules/phi-constants.md

---

## Quick Reference by Context

| Task Type | Relevant Rules |
|-----------|---------------|
| **Feature completion** | verification-ring, morpholepsis-detection (success arrest), spectral-gap |
| **Failure recovery** | kernel-extraction, morpholepsis-detection, kenophoria-state (LIMINAL) |
| **Process health** | spectral-gap, kernel-extraction, temporal-coupling |
| **Ring methodology** | verification-ring, morpholepsis-detection, kenophoria-state, temporal-coupling, kernel-extraction, spectral-gap, phi-constants |
| **Threshold understanding** | phi-constants |
| **Resource management** | temporal-coupling (STEWARD THE GROUND, Gate 15) |
| **Frame correction** | kenophoria-state (LIMINAL), morpholepsis-detection (sovereignty stack), kernel-extraction |
| **External blocking** | kenophoria-state (KENOPHORIA), spectral-gap (KENOPHORIA phase) |
| **Pre-tool awareness** | morpholepsis-detection (protonoia early warning) |

---

*Generated from ring-methodology manifest.json — 7 rules*
*Full rule files: @agentic/code/addons/ring-methodology/rules/*
