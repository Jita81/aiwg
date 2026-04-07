---
name: dev-builder-audit
description: Scan builder images for outdated base layers and security advisories
trigger: when the operator requests builder image audit, base layer check, or container vulnerability scan
---

# Builder Image Audit

## Purpose

Inventory all builder images across projects, compare their base layers against upstream releases, scan for known CVEs, and produce a prioritized report of images that need updating. This skill enforces the `dev-idempotent-builds` rule by surfacing unpinned tags and outdated base images before they cause CI failures or security findings.

## Workflow

### 1. Inventory Builder Images

Locate all CI builder Dockerfiles and workflow references across the target projects:

```bash
# Find all Dockerfile.builder files
find {project-root} -name "Dockerfile.builder" -o -name "Dockerfile.ci"

# Find all workflow files referencing container images
grep -r "image:" {project-root}/.gitea/workflows/ {project-root}/.github/workflows/ 2>/dev/null
```

Produce an inventory table:

| Project | Dockerfile Path | Base Image | Tag | Pinned by Digest? | Last Updated |
|---------|----------------|------------|-----|------------------|--------------|
| {project} | {path} | {base-image} | {tag} | yes/no | {date} |

Flag any entry where:
- Tag is `:latest` (violation of `dev-idempotent-builds`)
- No digest pin is present for the base image
- Last updated date is older than {max-age-days} days

### 2. Check Base Image Versions Against Upstream

For each unique base image in the inventory, check the upstream registry for newer versions:

```bash
# For Docker Hub images
docker pull {base-image}:{current-tag} --quiet
docker manifest inspect {base-image}:{current-tag} | grep -E '"digest"|"created"'

# Compare to upstream latest stable tag
docker manifest inspect {base-image}:{latest-stable-tag} | grep -E '"digest"|"created"'
```

Produce a comparison table:

| Base Image | Current Tag | Current Digest | Latest Stable | Latest Digest | Behind? |
|-----------|-------------|---------------|---------------|---------------|---------|
| {base-image} | {current-tag} | sha256:{current-digest} | {latest-tag} | sha256:{latest-digest} | yes/no |

### 3. Scan for CVEs

Run a vulnerability scanner against each builder image:

```bash
# Scan with trivy (preferred)
trivy image --exit-code 0 --severity CRITICAL,HIGH,MEDIUM \
  --format table {registry}/{project}-builder:{tag}

# Alternative: grype
grype {registry}/{project}-builder:{tag}
```

Aggregate findings:

| Image | CRITICAL | HIGH | MEDIUM | Top CVE | Fix Available? |
|-------|----------|------|--------|---------|----------------|
| {project}-builder:{tag} | {count} | {count} | {count} | {CVE-ID} | yes/no |

### 4. Flag Problem Images

Apply the following priority classification:

| Priority | Condition |
|----------|-----------|
| P1 — Immediate | CRITICAL CVE with available fix, or unpinned `:latest` tag in active CI |
| P2 — This sprint | HIGH CVE with available fix, or base image >90 days behind upstream |
| P3 — Next sprint | MEDIUM CVEs, or base image 30–90 days behind upstream |
| P4 — Backlog | No CVEs, base image <30 days behind upstream |

### 5. Produce Audit Report

```markdown
## Builder Image Audit Report
**Date**: {date}
**Projects Audited**: {count}
**Builder Images Scanned**: {count}

### Summary
- Images with CRITICAL CVEs: {count}
- Images with unpinned base tags: {count}
- Images >90 days behind upstream: {count}

### P1 — Immediate Action Required
{list of images with CRITICAL findings or unpinned :latest}

### P2 — This Sprint
{list of images with HIGH CVEs or >90 days stale}

### P3 — Next Sprint
{list of images with MEDIUM CVEs or 30-90 days stale}

### Recommended Updates
| Image | Current Base | Recommended Base | CVEs Fixed | Effort |
|-------|-------------|-----------------|-----------|--------|
| {image} | {current} | {recommended} | {count} | low/medium/high |

### Action Items
- [ ] Update {image} base from {current} to {recommended} — P1 — @{owner}
- [ ] Pin {image} base image by digest — P1 — @{owner}
- [ ] Schedule quarterly builder audit recurring task — P3
```

## Output

- Full inventory of builder images across all audited projects
- Base image version comparison against upstream
- CVE scan results per image with severity breakdown
- Priority-classified list of images requiring action
- Audit report with recommended update table and filed issues for P1/P2 findings
