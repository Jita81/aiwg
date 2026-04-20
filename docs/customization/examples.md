# Customization Examples

Five things people actually do after they set up personal customization mode.

---

## 1. Add a personal context rule

**Intent**: Claude always knows who you are and how you work — without you having to explain it every session.

**Tell the Steward**:
> "Add a rule that always knows I'm a senior backend engineer, I prefer direct answers without summaries at the end, and I work in Go and TypeScript"

**What gets created**: `agentic/code/addons/aiwg-utils/rules/my-context.md`

```markdown
---
description: Personal context — who I am and how I work
alwaysApply: true
---

I'm a senior backend engineer. My primary languages are Go and TypeScript.

- Give direct answers. Don't summarize what you just said at the end of a response.
- When I ask for code, default to idiomatic Go or TypeScript unless I specify otherwise.
- I prefer simple solutions. If there's a complex approach and a simple one that both work, mention the simple one first.
```

**Confirm it's live**: "Apply my changes" → active in next session.

---

## 2. Add a team conventions rule

**Intent**: Claude knows your team's specific conventions without you pasting them into every prompt.

**Tell the Steward**:
> "Add a rule with our team's conventions: we use trunk-based development, conventional commits, and our error handling pattern is always wrap with context using fmt.Errorf"

**What gets created**: `agentic/code/addons/aiwg-utils/rules/team-conventions.md`

```markdown
---
description: Team engineering conventions
alwaysApply: true
---

## Git Workflow
We use trunk-based development. No long-lived feature branches. All work goes to main via short-lived branches (< 2 days) or direct commits for small changes.

## Commit Format
Conventional commits: `type(scope): description`. Types: feat, fix, chore, docs, refactor, test.

## Error Handling (Go)
Always wrap errors with context:
```go
if err != nil {
    return fmt.Errorf("operation description: %w", err)
}
```

Never swallow errors. Never return bare `err` without wrapping.
```

**Confirm it's live**: "Apply my changes" → active in next session.

---

## 3. Create a domain-specific agent

**Intent**: A specialist persona that deeply understands your problem domain — not a generic assistant.

**Tell the Steward**:
> "Create a domain specialist agent for financial compliance work — someone who knows SOX, GDPR, PCI-DSS, and can review code for compliance gaps without me having to explain the frameworks every time"

**What gets created**: `agentic/code/addons/aiwg-utils/agents/compliance-specialist.md`

```markdown
---
name: compliance-specialist
description: Financial compliance specialist — SOX, GDPR, PCI-DSS code and process review
model: sonnet
tools:
  - Read
  - Grep
  - Glob
category: domain
---

You are a financial compliance specialist with deep expertise in SOX (Sarbanes-Oxley), GDPR, and PCI-DSS. You review code, processes, and documentation for compliance gaps...
```

**Confirm it's live**: "Apply my changes" → `@compliance-specialist` is available in next session.

---

## 4. Add a custom trigger to an existing skill

**Intent**: An existing skill does what you want, but you want to invoke it with different words.

**Tell the Steward**:
> "I want to be able to say 'ship it' to trigger the commit-and-push skill — that's just how I talk"

**What gets created**: `agentic/code/addons/aiwg-utils/skills/commit-and-push/SKILL.md` is updated (or a thin wrapper skill is added) with the new trigger phrase:

```markdown
## Triggers

- "commit and push"
- "commit my changes"
- "push this up"
- "ship it"           ← your addition
```

**Confirm it's live**: "Apply my changes" → saying "ship it" now triggers the commit-and-push skill.

---

## 5. Override a default agent's behavior

**Intent**: An existing AIWG agent is almost right for how you work, but you want to adjust its behavior for your context.

**Tell the Steward**:
> "The code reviewer agent always suggests adding docstrings, but my team doesn't write them — adjust it so it never brings up docstrings or documentation comments unless I specifically ask"

**What happens**: The Steward copies the agent definition into your fork's addon directory and makes the adjustment — your local copy takes precedence over the upstream default.

**What gets created**: `agentic/code/addons/aiwg-utils/agents/code-reviewer.md` (your modified copy)

The override is explicit in `git diff upstream/main` so you always know what you've changed vs the default, and you'll see if upstream changes the base agent in ways that might matter.

**Confirm it's live**: "Apply my changes" → your adjusted code reviewer is active.

---

## Next Steps

- [Back to customization overview](README.md)
- [Fork Workflow](fork-workflow.md) — How upstream sync and PR-back work
