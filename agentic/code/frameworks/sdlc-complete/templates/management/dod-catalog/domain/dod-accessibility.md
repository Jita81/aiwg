---
dod_id: dod-accessibility
name: Accessibility Definition of Done
scope: domain
category: accessibility
version: 1.0.0
extensible: true
---

# Accessibility Definition of Done

## Purpose

Ensures user-facing changes are usable by people with disabilities before they ship. Accessibility failures discovered post-release create legal exposure, require expensive retrofits, and exclude users. Catching them at the story or feature level is far cheaper than retrofitting at release.

## Criteria

### Required

- [ ] Automated accessibility scan (axe, Lighthouse, or equivalent) reports zero WCAG 2.1 Level AA violations on all new or modified views
- [ ] All interactive elements are keyboard-navigable: reachable via Tab, activatable via Enter/Space, no keyboard trap
- [ ] All images have non-empty `alt` text; purely decorative images have `alt=""` and `role="presentation"`
- [ ] Form inputs have associated `<label>` elements or `aria-label`/`aria-labelledby` attributes
- [ ] Color is not the sole means of conveying information (error states, status indicators use text or icon in addition to color)
- [ ] Color contrast ratio meets WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and UI components
- [ ] Focus indicator is visible on all interactive elements (not removed via `outline: none` without a custom replacement)
- [ ] Screen reader announces meaningful content in logical reading order (tested with at least one screen reader)

### Recommended

- [ ] Screen reader testing performed on a representative OS/screen reader combination: NVDA+Chrome (Windows), VoiceOver+Safari (macOS/iOS), or TalkBack (Android)
- [ ] Dynamic content changes (modals, toasts, live regions) announced to screen readers via `aria-live` or focus management
- [ ] Custom interactive widgets (accordions, tabs, date pickers) implement the ARIA Authoring Practices Guide (APG) pattern for that widget type
- [ ] Reduced-motion media query (`prefers-reduced-motion`) respected for animations and transitions
- [ ] Touch targets on mobile views are at least 44x44 CSS pixels

## Verification

**Automated checks:**
- `axe-core` or `jest-axe` integrated into component test suite: zero violations on new components
- Lighthouse accessibility audit in CI: score >= 90 on new pages
- Contrast ratio checker: design system tokens verified to meet ratio requirements

**Manual steps:**
- Author keyboards through every new interactive flow and confirms no keyboard trap, no skipped elements
- Reviewer navigates the changed view with a screen reader with visual display turned off and confirms all content is announced correctly and in order
- QA verifies focus indicator is visible on all interactive elements in a browser with default OS focus styling disabled

## Tailoring Guide

**Add criteria when:**
- Public-facing product subject to ADA, Section 508, or EN 301 549: require conformance report (VPAT) updated
- Video or audio content introduced: require captions (video), transcript (audio), and audio description if visual information is conveyed
- Custom chart or data visualization: require text alternative (table or summary) alongside visual

**Remove criteria when:**
- Change is exclusively backend, API, or non-UI: all criteria may be skipped; document rationale
- Internal admin tool with known sighted-only user base: may relax screen reader testing requirement; retain keyboard nav and color contrast

## Extension Points

- `ext-accessibility-standard` — target WCAG level (A, AA, AAA) or jurisdiction-specific standard contributed by project
- `ext-accessibility-assistive-tech` — specific screen reader / browser combinations required by project
- `ext-accessibility-audit` — criteria for third-party accessibility audit evidence required at release
