# AIWG Framework Context

Framework for AI-augmented software development with structured agents, workflows, and artifact management.

## Active Framework

SDLC Complete — agents, commands, skills, and rules for full lifecycle coverage.

## Key Commands

- `aiwg status` — Show workspace health
- `aiwg use sdlc` — Deploy/refresh SDLC framework
- Natural language: "transition to elaboration", "run security review", "where are we?"

## Artifacts

All SDLC artifacts stored in `.aiwg/` — requirements, architecture, testing, deployment plans.

## Rules

- No AI attribution in commits, PRs, or code
- CalVer versioning: YYYY.M.PATCH (no leading zeros)
- Never delete tests to make them pass
- Execute tests before returning code
