# AIWG Model Evaluation Suite

Evaluate local and cloud models for AIWG compatibility across 6 dimensions.

## Quick Start

```bash
cd tools/eval
npm install
npx tsx src/index.ts hermes3:latest --verbose
```

## Dependencies

`tools/eval` depends on `@matric/eval-client` from the private Gitea npm registry. The `.npmrc` in this directory configures the `@matric` scope automatically — `npm install` picks it up without extra setup.

`@matric/eval-client` is a TypeScript client for the Python [matric-eval](https://git.integrolabs.net/roctinam/matric-eval) framework. When the `matric-eval` binary is installed and on `$PATH`, standard benchmark scores (HumanEval, GSM8K, ARC, etc.) can be included alongside AIWG-specific dimension scores.

## Dimensions

| Dimension | Weight | What it tests |
|-----------|--------|---------------|
| Tool Use | 25% | Correct tool selection and parameter formatting |
| Instruction Following | 25% | Constraint adherence, multi-part requests |
| Coding | 20% | Code generation quality and correctness |
| Structured Output | 15% | JSON/YAML/Markdown generation |
| Reasoning | 10% | Task decomposition and planning |
| Context Handling | 5% | Long-context accuracy |

## Scoring

- **90-100**: opus tier — fully compatible
- **70-89**: sonnet tier — good with minor limitations
- **50-69**: haiku tier — partial compatibility
- **Below 50**: not recommended

## CLI Options

```bash
npx tsx src/index.ts <model-id> [options]

Options:
  --backend <type>      ollama or api (default: ollama)
  --dimensions <list>   Comma-separated dimensions to evaluate
  --output <format>     json or markdown (default: markdown)
  --ollama-url <url>    Ollama API URL (default: http://localhost:11434)
  --verbose             Show detailed progress
```

## Adding Test Cases

Test cases live in `datasets/<dimension>/` as YAML files:

```yaml
id: unique-test-id
dimension: tool-use
difficulty: basic
prompt: |
  The prompt sent to the model...
expected:
  tool_calls:
    - tool: Read
      params_contain: { file_path: "example.ts" }
  contains: ["keyword"]
  must_not_contain: ["forbidden"]
  valid_json: true
scoring:
  correct_tool: 0.4
  correct_params: 0.4
  no_hallucination: 0.2
```
