---
dod_id: dod-api-design
name: API Design Definition of Done
scope: domain
category: api-design
version: 1.0.0
extensible: true
---

# API Design Definition of Done

## Purpose

Ensures API changes are backwards compatible, consistently documented, and validated against the published contract before they reach consumers. API breakage is one of the highest-cost defects in distributed systems — it is invisible until a consumer fails, often in production.

## Criteria

### Required

- [ ] OpenAPI/AsyncAPI specification updated and committed alongside the implementation (spec-first or spec-synchronized)
- [ ] All new or changed endpoints are documented in the spec: method, path, request body, response schema, status codes, and error codes
- [ ] No backwards-incompatible change introduced to a published API without a version increment (removed fields, changed types, renamed parameters are breaking changes)
- [ ] Breaking changes are explicitly documented in the CHANGELOG and communicated to known consumers before release
- [ ] API version follows the project versioning policy (URL versioning `/v2/`, header versioning, or semantic versioning of the SDK)
- [ ] All error responses follow the project's standard error schema (consistent `code`, `message`, and optional `details` fields)
- [ ] Authentication requirements for all new endpoints documented and enforced in implementation and spec

### Recommended

- [ ] API contract tests (e.g., Pact, Dredd, Schemathesis) pass against the updated spec
- [ ] Request validation enforced server-side for all required fields and type constraints (not only documented, but actually rejected)
- [ ] Rate limiting or quota policy documented for new endpoints that could be called at high frequency
- [ ] Idempotency semantics documented for state-mutation endpoints (POST/PUT/PATCH): safe to retry or not
- [ ] Deprecation notice added to spec and response headers for any endpoint being sunset

## Verification

**Automated checks:**
- OpenAPI validator (e.g., `spectral`, `openapi-cli`): spec file lints with zero errors
- API contract test suite (if configured): all consumer contract tests pass
- Breaking change detector (e.g., `oasdiff`, `openapi-diff`): CI step confirms no unintentional breaking changes vs. previous published spec
- Integration test: every documented status code and error code is exercised by at least one test

**Manual steps:**
- API standards owner or designated reviewer confirms design consistency with existing API surface
- Consumer-side developer (if available) reviews the spec changes and confirms compatibility with their integration
- Author verifies spec accurately reflects runtime behavior by comparing spec to integration test output

## Tailoring Guide

**Add criteria when:**
- Public developer-facing API: require changelog published to developer portal before release; require deprecation timeline in spec
- Event-driven API: require event schema registered in schema registry and compatibility mode set
- GraphQL API: require schema diff reviewed; breaking changes require schema deprecation directives and client notification

**Remove or relax criteria when:**
- Internal-only API consumed by a single team: may relax consumer contract tests; retain spec update and breaking-change check
- Experimental API clearly marked as unstable: may relax backwards compatibility requirement; `X-API-Status: experimental` header required

## Extension Points

- `ext-api-design-standards` — organization API design guidelines and naming conventions
- `ext-api-design-consumers` — known consumer list and notification process for breaking changes
- `ext-api-design-governance` — API governance board review criteria for new public APIs
