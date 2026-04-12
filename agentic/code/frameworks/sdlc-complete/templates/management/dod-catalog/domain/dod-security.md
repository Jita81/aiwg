---
dod_id: dod-security
name: Security Definition of Done
scope: domain
category: security
version: 1.0.0
extensible: true
---

# Security Definition of Done

## Purpose

Ensures every change that touches a security boundary, authentication path, data handling layer, or external interface has been evaluated for known vulnerability classes before it ships. Prevents security debt from accumulating invisibly and being discovered in production or audits.

## Criteria

### Required

- [ ] Static Application Security Testing (SAST) run on all changed files with zero new critical or high findings
- [ ] Dependency vulnerability scan completed; no new dependencies with known CVE above CVSS 7.0 without a documented accepted-risk exception
- [ ] All user-supplied inputs are validated and sanitized before use (verified by code review)
- [ ] Authentication and authorization logic verified: no path bypasses access control
- [ ] Secrets and credentials are not hardcoded in source, config files, or test fixtures
- [ ] Sensitive data (PII, credentials, keys) is not written to logs
- [ ] All new HTTP endpoints require authentication unless explicitly documented as intentionally public
- [ ] Security-relevant changes reviewed by a team member with security knowledge (not just the author)

### Recommended

- [ ] Threat model updated for any new data flows, trust boundaries, or external integrations introduced
- [ ] Dynamic Application Security Testing (DAST) run against a staging environment for web-facing changes
- [ ] Security unit tests cover at least: authentication required, authorization enforced, input validation rejects malformed input
- [ ] Cryptographic operations use project-approved algorithms and key lengths (no MD5, SHA1, DES)
- [ ] Error responses do not leak internal stack traces, file paths, or system details to external callers
- [ ] Rate limiting or brute-force protection confirmed present on authentication endpoints

## Verification

**Automated checks:**
- SAST tool (e.g., Semgrep, CodeQL, Bandit): CI step passes with zero new critical/high findings
- Dependency scanner (e.g., `npm audit --audit-level=high`, Snyk, OWASP Dependency Check): no unmitigated high/critical CVEs
- Secret scanner (e.g., Gitleaks, truffleHog): no secrets detected in commit history for this branch
- Linter rules: project security lint rules (if configured) pass

**Manual steps:**
- Security-knowledgeable reviewer confirms authentication and authorization logic is correct
- Code reviewer confirms no hardcoded secrets or sensitive data in logs by inspecting changed files
- Threat model owner confirms threat model is current if new trust boundaries were introduced

## Tailoring Guide

**Add criteria when:**
- Handling PHI, PCI data, or regulated PII: require data classification verification and field-level encryption check
- External API integration added: require API key storage in secrets manager, not environment literals
- OAuth or SSO flow changed: require token validation, scope restrictions, and refresh token rotation verified
- New file upload capability: require file type validation, size limit, and storage outside web root confirmed

**Remove or relax criteria when:**
- Change is documentation, config, or tooling with no runtime code path: skip SAST and auth review; require secret scan only
- Internal backend service with no external exposure and no PII: may defer DAST; require SAST and dependency scan

## Extension Points

- `ext-security-compliance` — compliance-framework-specific criteria (HIPAA, PCI-DSS, SOC 2, FedRAMP)
- `ext-security-pentest` — criteria for changes requiring manual penetration test sign-off
- `ext-security-crypto` — organization-approved algorithm allowlist enforcement criteria
