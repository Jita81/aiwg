# Skill: Analyse Codebase

Analyse the connected repository to build a technical understanding of the existing
system. This runs when a customer connects their repo and before any code manufacturing
begins.

## Your Role

You are a senior software architect conducting a codebase review. Your job is to
understand the system well enough that any future code changes are consistent with
the existing architecture, conventions, and patterns.

## Process

### Step 1: Survey the structure

Map the top-level directory layout. Identify:
- Language(s) and framework(s) (check package.json, requirements.txt, go.mod, Cargo.toml, *.csproj, etc.)
- Build system (webpack, vite, gradle, maven, cargo, dotnet, etc.)
- Monorepo vs single project
- Source directories vs config vs docs vs tests

Write findings to `.context/codebase-analysis.json` under `structure`.

### Step 2: Identify architecture patterns

Read key files to understand the architecture:
- Entry points (main.py, index.ts, Program.cs, main.go, etc.)
- Routing/controller layer
- Service/business logic layer
- Data access layer (ORM models, repositories, DAOs)
- Shared utilities and helpers

Classify the architecture: MVC, layered, hexagonal, microservices, serverless, monolith, etc.

Write findings under `architecture`.

### Step 3: Map dependencies and integrations

Read dependency files and identify:
- External services (databases, caches, message queues, APIs)
- Third-party libraries and their purposes
- Internal module dependencies
- Configuration patterns (env vars, config files, feature flags)

Write findings under `dependencies`.

### Step 4: Extract conventions

Read 5-10 representative source files and identify:
- Naming conventions (camelCase, snake_case, PascalCase)
- File organisation patterns
- Error handling approach
- Logging patterns
- Test patterns (unit, integration, e2e — which framework)
- Code style (indentation, line length, import ordering)
- Comment/doc conventions

Write findings under `conventions`.

### Step 5: Assess quality signals

Look for and report on:
- Test coverage indicators (test directories, CI config, coverage reports)
- Linting/formatting config (.eslintrc, .prettierrc, ruff.toml, etc.)
- CI/CD pipeline (GitHub Actions, Azure Pipelines, GitLab CI, etc.)
- Documentation quality (README, API docs, architecture docs)
- Security patterns (auth middleware, input validation, secrets management)
- Known tech debt indicators (TODO/FIXME comments, deprecated code)

Write findings under `quality`.

### Step 6: Produce the summary

Write an executive summary (200 words max) that a developer joining the project
would read first. Cover: what it is, how it's built, what to watch out for, and
what's well-done.

Write to `summary` field.

## Output Schema

Write ALL findings to `.context/codebase-analysis.json`:

```json
{
  "analysed_at": "ISO8601 timestamp",
  "summary": "200-word executive summary",
  "structure": {
    "languages": ["python", "typescript"],
    "frameworks": ["fastapi", "react"],
    "build_system": "vite",
    "project_type": "monorepo",
    "source_dirs": ["apps/", "factory/"],
    "test_dirs": ["tests/"],
    "config_files": [".env", "pyproject.toml", "package.json"]
  },
  "architecture": {
    "pattern": "layered",
    "layers": ["API routes", "service layer", "data access", "external integrations"],
    "entry_points": ["apps/athena/server.py"],
    "key_abstractions": ["AgentModule", "IntegrationGateway", "ContextStore"]
  },
  "dependencies": {
    "external_services": ["PostgreSQL", "Redis", "DeepSeek API"],
    "key_libraries": [{"name": "fastapi", "purpose": "HTTP API framework"}],
    "internal_modules": ["factory.llm_client", "apps.athena.context_store"],
    "config_pattern": "environment variables via .env"
  },
  "conventions": {
    "naming": "snake_case for Python, camelCase for TypeScript",
    "file_organisation": "feature-based directories",
    "error_handling": "try/except with logging, HTTP exceptions for API",
    "test_framework": "pytest",
    "style_tools": ["ruff", "eslint", "prettier"]
  },
  "quality": {
    "test_coverage": "moderate — unit tests exist but no integration tests",
    "ci_cd": "GitHub Actions with lint + test + build",
    "documentation": "README + API docs, no architecture decision records",
    "security": "JWT auth, input validation via Pydantic, secrets in env vars",
    "tech_debt": ["12 TODO comments", "deprecated endpoints in v1 routes"]
  }
}
```

## Rules

- Read actual files — never guess. If you can't determine something, say "unknown" with a reason.
- Keep the summary concise — this is a reference document, not a novel.
- Focus on patterns, not exhaustive listings. "Uses React with functional components and hooks" is better than listing every component.
- Note anything that would affect code manufacturing: unusual patterns, strict linting rules, required test patterns, naming conventions that Claude Code must follow.
- Commit after writing: `git add .context/codebase-analysis.json && git commit -m "context: codebase analysis complete"`

## Step 7: Update README.md

After completing the codebase analysis, update the project's README.md to reflect the
technical understanding you've built. If a README.md exists, update its architecture,
tech stack, project structure, and documentation links. If it doesn't exist, create one.

Include:
- Architecture overview from your analysis
- Tech stack table (languages, frameworks, tools)
- Project structure tree (key directories with descriptions)
- Links to documentation files found in the repo
- Getting started instructions if you can determine them from the build system
- Key numbers (file counts, test counts, API endpoint counts)

**Write/update README.md and commit: "docs: update README from codebase analysis"**
