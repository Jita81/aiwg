# Community Model Testing Guide

How to test models with AIWG and submit your results to help other users.

---

## Why Contribute

Every model validation expands the tested compatibility matrix. Your setup — hardware, model, quantization, backend — may be the exact combination another user needs confirmed before committing to a local deployment.

---

## What to Test

### Minimum Viable Test

Run AIWG with your model and report what works:

1. **Basic CLI** — Does `aiwg use sdlc` deploy without errors?
2. **Agent delegation** — Can agents be spawned and return results?
3. **Tool use** — Does the model produce valid tool calls (Read, Edit, Grep)?
4. **Structured output** — Can it generate valid JSON, YAML, markdown tables?
5. **Commit messages** — Does `/commit-and-push` produce correctly formatted output?

### Extended Test (Optional)

For more thorough validation:

6. **SDLC workflows** — Phase transitions, artifact generation
7. **Multi-step reasoning** — Agent loops, implementation planning
8. **Context handling** — Quality at different session lengths
9. **Code generation** — TypeScript/JavaScript quality, test writing

---

## How to Test

### Setup

```bash
# 1. Install and start your model
ollama pull <model-id>
ollama serve

# 2. Point AIWG at the local endpoint
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_API_KEY="ollama"

# 3. Deploy AIWG
aiwg use sdlc --provider codex
```

### Run Through Test Cases

Try each capability and note what works, what fails, and any quality observations:

```bash
# Test tool use — ask agent to read and edit a file
# Test structured output — ask for JSON or YAML generation
# Test coding — ask to write a function with tests
# Test reasoning — ask for a phased implementation plan
```

### Record Results

Fill out the submission template below with your findings.

---

## Submission Template

Copy this template and submit as a PR to `docs/models/supported-models.md`, or post it as a GitHub/Gitea issue.

```markdown
## Model Test Report

**Model**: <!-- e.g., hermes-3-llama-3.1:8b -->
**Quantization**: <!-- e.g., Q5_K_M, default, F16 -->
**Backend**: <!-- e.g., Ollama 0.5.4, llama.cpp b4567, vLLM 0.6.2 -->
**Hardware**: <!-- e.g., RTX 4070 Ti 12GB VRAM, M2 Pro 16GB unified -->
**OS**: <!-- e.g., Ubuntu 24.04, macOS 15.3 -->
**AIWG Version**: <!-- e.g., 2026.3.2 -->
**Date**: <!-- e.g., 2026-03-20 -->

### Configuration

<!-- Paste your models.json (redact any real API keys) -->

```json
{
  "shorthand": {
    "opus": "your-model-id",
    "sonnet": "your-model-id",
    "haiku": "your-model-id"
  }
}
```

### Results

| Capability | Status | Notes |
|------------|--------|-------|
| Basic CLI | ✅/⚠️/❌ | |
| Agent delegation | ✅/⚠️/❌ | |
| Tool use | ✅/⚠️/❌ | |
| Structured output | ✅/⚠️/❌ | |
| Commit messages | ✅/⚠️/❌ | |
| SDLC workflows | ✅/⚠️/❌ | |
| Multi-step reasoning | ✅/⚠️/❌ | |
| Context handling | ✅/⚠️/❌ | |
| Code generation | ✅/⚠️/❌ | |

### What Worked Well

<!-- Which AIWG features/workflows succeeded, any positive observations -->

### What Didn't Work

<!-- Failures, limitations, quality issues, error messages -->

### Tips and Workarounds

<!-- Anything you discovered: settings that helped, prompts that work better, etc. -->

### Suggested Tier Mapping

<!-- Based on your testing, which AIWG tier does this model fit? -->
- Recommended tier: haiku / sonnet / opus
- Reasoning:
```

---

## Submission Process

### Option 1: Pull Request (Preferred)

1. Fork the repository
2. Add your model to the "Local Models — Validated" table in `docs/models/supported-models.md`
3. Include your full test report in the PR description
4. Submit the PR

### Option 2: Issue

1. Open an issue titled `model-test: <model-name> on <hardware>`
2. Paste the filled-out submission template
3. A maintainer will add the results to the supported models list

### Option 3: Eval Suite (When Available)

Once the AIWG eval suite is available (see roadmap):

```bash
aiwg eval <model-id> --backend ollama --submit
```

This will run standardized tests and optionally submit results directly.

---

## Minimum Required Information

Every submission must include:

- [ ] Model ID and version (exact Ollama/HuggingFace identifier)
- [ ] Inference backend and version
- [ ] Hardware specs (GPU model and VRAM, or CPU if CPU-only)
- [ ] Quantization level (if applicable)
- [ ] AIWG version tested against
- [ ] At least 3 capability results from the test matrix
- [ ] Any issues or limitations encountered

Submissions missing required fields will be asked for clarification before being added to the supported models list.

---

## See Also

- [Supported Models](../models/supported-models.md) — Where results are published
- [Local Model Deployment](../models/local-models.md) — Setup instructions
- [Contributor Quickstart](contributor-quickstart.md) — General contribution guide
