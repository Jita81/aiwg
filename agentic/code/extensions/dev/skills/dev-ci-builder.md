---
name: dev-ci-builder
description: CI builder pattern setup and management — create Dockerfile.builder, workflow templates, registry config
trigger: when the operator requests CI setup, builder image creation, or pipeline scaffolding for a project
---

# CI Builder Setup

## Purpose

Set up the self-contained CI builder pattern for a project. Create the Dockerfile.builder, configure the registry, generate workflow templates, and verify the builder works.

## Workflow

### 1. Analyze Project

Determine the project's build requirements:
- Language and runtime (Node.js, Python, Go, Rust, etc.)
- Build tools (npm, pip, cargo, make, etc.)
- Test framework
- Linting tools
- Additional system dependencies

### 2. Create Dockerfile.builder

Generate `ci/Dockerfile.builder` using the ci-builder-dockerfile template:
- Select appropriate base image for the language
- Pin all dependency versions
- Install system packages
- Install language toolchain
- Set up caching layers for dependencies

### 3. Build and Test Locally

```bash
# Build the builder image
docker build -f ci/Dockerfile.builder -t {project}-builder:test .

# Run the project's test suite inside the builder
docker run --rm -v $(pwd):/workspace -w /workspace {project}-builder:test {test_command}

# Verify all tools are available
docker run --rm {project}-builder:test {tool} --version
```

### 4. Configure Registry

- Set up registry credentials (if not already configured)
- Push builder image with version tag
- Document the image location

### 5. Generate Workflow

Create CI workflow using the ci-builder-workflow template:
- Build stage using the builder image
- Test stage
- Lint stage
- Deploy stage (if applicable)
- Builder update workflow (triggered by Dockerfile.builder changes)

### 6. Verify End-to-End

- Push a test commit
- Verify pipeline runs successfully with the builder image
- Confirm all stages pass

## Output

- `ci/Dockerfile.builder` — Self-contained builder
- `.github/workflows/ci.yml` (or `.gitea/workflows/ci.yml`) — CI workflow
- `.github/workflows/builder.yml` — Builder update workflow
- Pipeline documentation (using pipeline template)
