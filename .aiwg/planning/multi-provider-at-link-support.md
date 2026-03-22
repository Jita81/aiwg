# Multi-Provider @-Link Support Research

**Issue**: #444
**Date**: 2026-03-22
**Status**: Initial findings — needs verification per provider

## Summary

This document captures what is known (and unknown) about @-link eager loading support for each of the 8 AIWG-supported platforms. The hook file architecture (#439) depends on each provider's ability to eagerly load a referenced file when an `@filename` directive is present in the main context file.

## Provider Matrix

| Provider | Context File | @-link Support | Confidence | Hook Approach |
|----------|-------------|----------------|------------|---------------|
| Claude Code | `CLAUDE.md` | ✅ Confirmed | HIGH | `@AIWG.md` directive |
| Warp Terminal | `WARP.md` | ❓ Unverified | LOW | Section or full inject |
| Windsurf | `AGENTS.md` | ❓ Unverified | LOW | Needs testing |
| GitHub Copilot | `.github/copilot-instructions.md` | ❓ Unverified | LOW | Needs testing |
| Cursor | `.cursorrules` | ⚠️ Partial | MEDIUM | Supported in some configs |
| Factory AI | `AGENTS.md` | ❓ Unverified | LOW | Likely full inject |
| OpenCode | `.opencode/context.md` | ❓ Unverified | LOW | Needs testing |
| Codex | `CODEX.md` | ❌ Not supported | HIGH | Full inject required |

## Detailed Findings

### Claude Code ✅ Confirmed

**Evidence**: Claude Code explicitly supports `@filename` eager loading in CLAUDE.md and other context files. When a line `@AIWG.md` appears in CLAUDE.md, the content of AIWG.md is fully loaded into context at session start — identical behavior to inline content.

**Implementation**: `@AIWG.md` directive in CLAUDE.md.

**Verification source**: Claude Code documentation + observed behavior in production.

### Warp Terminal ❓ Unverified

**Current behavior**: WARP.md is loaded as a full context file. It is unclear whether Warp parses `@file` directives within WARP.md.

**Recommendation**: Until verified, use a dedicated AIWG section within WARP.md that can be commented/uncommented as a toggle. The section approach requires no @-link support.

**Hook approach (conservative)**:
```markdown
## AIWG Framework Context
<!-- AIWG-START: managed by aiwg hook-enable/disable — do not edit manually -->
[content of AIWG-warp.md inlined here]
<!-- AIWG-END -->
```

**Hook approach (if @-link confirmed)**:
```markdown
@AIWG-warp.md
```

**Verification needed**: Test by placing `@AIWG-warp.md` in WARP.md and confirming content loads.

### Windsurf ❓ Unverified

**Current behavior**: AGENTS.md is the primary context file for Windsurf. It is unclear if Windsurf supports @-links within AGENTS.md.

**Recommendation**: Test with a minimal `@AIWG-windsurf.md` reference. Fall back to full inject if unsupported.

**Verification needed**: Create a test AGENTS.md with `@test-file.md` and confirm test file content loads.

### GitHub Copilot ❓ Unverified

**Current behavior**: `.github/copilot-instructions.md` is loaded as-is. Copilot's support for file references within this file is undocumented.

**Recommendation**: Default to full injection. Investigate Copilot's context file reference syntax — it may use `@workspace` or `#file` syntax rather than bare `@filename`.

**Verification needed**: Check GitHub Copilot documentation for custom instructions file reference syntax.

### Cursor ⚠️ Partial

**Current behavior**: `.cursorrules` supports `@file` references in some configurations. Cursor's MDC (`.mdc`) rule format supports `glob` patterns and `alwaysApply` flags. The `.cursorrules` format (legacy) may or may not support file includes.

**Recommendation**: Test both the legacy `.cursorrules` format and the newer `.cursor/rules/*.mdc` format. The MDC format may offer better support.

**Hook approach (if supported)**:
```
@AIWG-cursor.md
```

**Verification needed**: Test `@AIWG-cursor.md` in both `.cursorrules` and a `.cursor/rules/aiwg.mdc` file.

### Factory AI ❓ Unverified

**Current behavior**: Factory AI uses AGENTS.md as its context file. @-link support within AGENTS.md is undocumented.

**Recommendation**: Default to full injection until verified.

**Verification needed**: Factory AI documentation review or empirical test.

### OpenCode ❓ Unverified

**Current behavior**: OpenCode uses `.opencode/context.md`. As a newer platform, its context loading behavior is not well documented.

**Recommendation**: Default to full injection. OpenCode is likely to adopt standards similar to Claude Code as it matures.

**Verification needed**: OpenCode documentation or source code review.

### Codex ❌ Not Supported

**Evidence**: Codex (OpenAI) context files (`CODEX.md` / `~/.codex/instructions.md`) do not appear to support @-link file includes. The format is plain text read as-is.

**Implementation**: Full injection required. AIWG-codex.md content is embedded directly into CODEX.md between `<!-- BEGIN AIWG -->` and `<!-- END AIWG -->` markers.

## Recommended Implementation Strategy

### Phase 1: Safe defaults (immediate)

Implement all providers with the most conservative approach that is known to work:

| Provider | Phase 1 Approach |
|----------|-----------------|
| Claude Code | `@AIWG.md` (confirmed working) |
| All others | Full injection with AIWG markers |

### Phase 2: Platform testing (follow-up)

Test @-link support for Warp, Windsurf, Copilot, Cursor, Factory, OpenCode.
Update provider implementations as each platform confirms support.

### Phase 3: Provider capability flags (after testing)

Encode results in each provider's `PROVIDER_CAPABILITIES` object:

```javascript
const PROVIDER_CAPABILITIES = {
  atLinkSupport: true,        // supports @file.md eager loading
  hookFileName: 'AIWG.md',   // generated hook file name
  hookDirective: '@AIWG.md', // directive added to context file
  hookStyle: 'directive',    // 'directive' | 'section' | 'inject'
};
```

## Testing Protocol

To verify @-link support for a provider:

1. Create a test project with the provider's context file
2. Add `@test-content.md` to the context file
3. Create `test-content.md` with distinctive content: `## TEST AIWG LINK CONFIRMED`
4. Start a session with the provider
5. Ask: "What does test-content.md say?"
6. If the agent answers correctly, @-link support is confirmed

## Open Questions

1. Does Warp's WARP.md support `@filename` style includes?
2. Does Windsurf's AGENTS.md support file references?
3. Does GitHub Copilot's instructions file support any form of file inclusion?
4. Does Cursor's newer MDC format support `@` includes better than legacy `.cursorrules`?
5. Does Factory AI have documentation on AGENTS.md context loading?

## Next Steps

- [ ] Run testing protocol for Warp, Windsurf, Copilot, Cursor, Factory, OpenCode
- [ ] Update this document with findings
- [ ] Update provider `.mjs` implementations with `atLinkSupport` capability flag
- [ ] Update `hook-enable` / `hook-disable` to handle section-style vs directive-style

## References

- #444 — This research issue
- #439 — AIWG.md hook file architecture
- #442 — `--full-inject` opt-in (fallback for providers without @-link support)
