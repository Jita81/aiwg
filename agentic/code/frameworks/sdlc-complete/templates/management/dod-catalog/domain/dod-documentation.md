---
dod_id: dod-documentation
name: Documentation Definition of Done
scope: domain
category: documentation
version: 1.0.0
extensible: true
---

# Documentation Definition of Done

## Purpose

Ensures documentation is updated alongside the code that changes it, not as an afterthought. Documentation drift — where code evolves but docs do not — creates support burden, onboarding friction, and incorrect usage by downstream consumers.

## Criteria

### Required

- [ ] README updated if setup steps, environment variables, or configuration options changed
- [ ] API reference updated for every added, modified, or removed endpoint, method, or parameter (no undocumented public API)
- [ ] CHANGELOG has an entry for every user-visible change in this PR using the project's changelog format
- [ ] Inline code comments updated where existing comments no longer match the logic
- [ ] All new public functions, classes, and modules have at least a one-line docstring or JSDoc/Godoc comment describing their purpose

### Recommended

- [ ] Architecture documentation updated if the change introduces a new component, integration, or data flow
- [ ] ADR written for any significant design decision made during implementation (why this approach, not just what)
- [ ] Tutorials or how-to guides updated if the user workflow changed
- [ ] Deprecated APIs or features marked with deprecation notice including removal target version
- [ ] Runbook or operational playbook updated if the change affects operational procedures

## Verification

**Automated checks:**
- Doc linter (e.g., `markdownlint`, `vale`): no new style violations in changed documentation files
- Link checker: no broken internal or external links introduced by documentation changes
- API doc generator (e.g., Swagger, TypeDoc, godoc): generates successfully with no warnings on new public symbols
- CHANGELOG format validator (if configured): new entry conforms to project changelog schema

**Manual steps:**
- Reviewer reads the updated documentation and confirms it accurately describes the current behavior (not the old behavior)
- A team member unfamiliar with the change reads the updated docs and confirms they can understand the feature without asking the author
- For API changes: reviewer confirms every parameter, return value, and error code in the code is documented

## Tailoring Guide

**Add criteria when:**
- Public-facing API or SDK: require documentation published to external docs site before release, not just in source
- Regulated domain: require documentation version-controlled with the software release and traceable to requirements
- Open-source project: require contribution guide updated if contributing process changed
- Infrastructure change: require diagram updated in architecture docs

**Remove or relax criteria when:**
- Internal refactor with no behavior change: skip changelog entry and README update; require only inline comment update
- Experimental or behind-flag feature: defer external documentation to feature activation; require internal docs only
- Config-only change: may skip API doc update; require README or config reference update instead

## Extension Points

- `ext-documentation-standards` — project documentation style guide and tooling requirements
- `ext-documentation-publishing` — external publish targets and approval gates for public-facing docs
- `ext-documentation-translation` — localization requirements for multilingual documentation
