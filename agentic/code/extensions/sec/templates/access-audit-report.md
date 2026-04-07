# Access Audit Report

**Audit Date**: {YYYY-MM-DD}
**Audit Period**: {YYYY-MM-DD} to {YYYY-MM-DD}
**Auditor**: {operator}
**Scope**: {all-fleet | specific-hosts | specific-service}
**Compliance Framework**: {SOC2 | PCI-DSS | ISO27001 | HIPAA | internal}
**Next Audit Due**: {YYYY-MM-DD}

---

## Audit Summary

| Field | Value |
|-------|-------|
| Date | {YYYY-MM-DD} |
| Scope | {description of audit scope} |
| Hosts Audited | {N} |
| Operators Inventoried | {N} |
| SSH Keys Reviewed | {N} |
| Sudo Grants Reviewed | {N} |
| IdP Clients Reviewed | {N} |
| SSH Certs Active | {N} |
| Findings — High | {N} |
| Findings — Medium | {N} |
| Findings — Low | {N} |
| Overall Status | {PASS | PASS WITH FINDINGS | FAIL} |

---

## SSH Access Inventory

### Authorized Keys by Host

| Host | User | Key Fingerprint | Key Comment / Label | Key Age | Status |
|------|------|----------------|---------------------|---------|--------|
| {hostname} | {username} | {SHA256:...} | {operator-name/purpose} | {Nd} | {OK\|REVIEW\|REVOKE} |

**Findings — SSH Authorized Keys**:

| Finding | Severity | Host | Detail |
|---------|----------|------|--------|
| Key without descriptive comment | LOW | {host} | SHA256:{fingerprint} — unable to attribute to operator |
| Key belonging to departed operator | HIGH | {host} | {username}: key attributed to {operator} who departed {date} |
| Duplicate key across hosts | LOW | {hosts} | Same key fingerprint appears on {N} hosts |

---

## Sudo Grants

### Sudoers by Host

| Host | User / Group | Allowed Commands | NOPASSWD | Scope |
|------|-------------|-----------------|----------|-------|
| {hostname} | {user\|%group} | {ALL\|specific-commands} | {yes\|no} | {local\|ldap} |

**Findings — Sudo Grants**:

| Finding | Severity | Host | Detail |
|---------|----------|------|--------|
| NOPASSWD: ALL grant | HIGH | {host} | {user} has unrestricted passwordless sudo |
| Sudo grant for departed operator | HIGH | {host} | {username} present in sudoers but no longer active |
| Overly broad command scope | MEDIUM | {host} | {user} can run {commands} — consider restricting to specific binaries |

---

## IdP Client Inventory

### Keycloak / OIDC Clients by Realm

| Realm | Client ID | Type | Redirect URIs | Granted Scopes | Status |
|-------|-----------|------|--------------|----------------|--------|
| {realm} | {client-id} | {public\|confidential} | {uri-list} | {scope-list} | {OK\|REVIEW} |

**Findings — IdP Clients**:

| Finding | Severity | Realm | Client | Detail |
|---------|----------|-------|--------|--------|
| Wildcard redirect URI | HIGH | {realm} | {client-id} | Redirect URI contains `*` — restrict to specific URIs |
| Stale client (no logins in 90 days) | MEDIUM | {realm} | {client-id} | Last login: {date} — verify client is still needed |
| Overly broad scope | MEDIUM | {realm} | {client-id} | Client granted `{scope}` but purpose only requires `{minimal-scope}` |

---

## Certificate Holders

### SSH Certificates Active

| Certificate Serial | Principal | Identity | Issued By | Not After | Status |
|-------------------|-----------|----------|-----------|-----------|--------|
| {serial} | {username} | {operator-email} | {CA name} | {YYYY-MM-DD} | {VALID\|EXPIRED\|REVOKED} |

**Findings — SSH Certificates**:

| Finding | Severity | Detail |
|---------|----------|--------|
| Expired certificate in authorized_principals | LOW | Serial {serial} expired {date} — remove from authorized_principals |
| Certificate for departed operator | HIGH | Serial {serial}, principal {username} — operator departed {date}, revoke immediately |

### TLS/PKI Certificates

| Subject CN | Host | Expiry | Status |
|-----------|------|--------|--------|
| {hostname.example.com} | {host} | {YYYY-MM-DD} | {HEALTHY\|WARNING\|BLOCK\|EXPIRED} |

---

## Findings

### High Severity

| ID | Finding | Host / Scope | Recommendation | Owner | Due Date |
|----|---------|-------------|----------------|-------|----------|
| F-001 | {finding-description} | {scope} | {specific-remediation-action} | {operator} | {YYYY-MM-DD} |

### Medium Severity

| ID | Finding | Host / Scope | Recommendation | Owner | Due Date |
|----|---------|-------------|----------------|-------|----------|
| M-001 | {finding-description} | {scope} | {specific-remediation-action} | {operator} | {YYYY-MM-DD} |

### Low Severity

| ID | Finding | Host / Scope | Recommendation | Owner | Due Date |
|----|---------|-------------|----------------|-------|----------|
| L-001 | {finding-description} | {scope} | {specific-remediation-action} | {operator} | {YYYY-MM-DD} |

---

## Compliance Status

| Control | Framework Requirement | Status | Evidence |
|---------|----------------------|--------|----------|
| Access Review Frequency | Monthly audit of privileged access | {PASS\|FAIL} | This report ({YYYY-MM-DD}) |
| SSH Key Attribution | All keys attributable to active operators | {PASS\|PASS WITH FINDINGS\|FAIL} | SSH inventory above |
| Least Privilege Sudo | No unrestricted NOPASSWD grants without justification | {PASS\|FAIL} | Sudo grants section above |
| Certificate Expiry | No certs expiring within 7 days | {PASS\|FAIL} | Certificate holders section above |
| IdP Client Review | All clients reviewed quarterly | {PASS\|FAIL} | IdP inventory above |
| Departed Operator Access | Access removed within 24h of departure | {PASS\|FAIL} | {finding-count} outstanding removals |

---

## Action Items

- [ ] **HIGH**: {F-001} — {remediation-action} — Owner: {operator} — Due: {YYYY-MM-DD}
- [ ] **HIGH**: {F-002} — {remediation-action} — Owner: {operator} — Due: {YYYY-MM-DD}
- [ ] **MEDIUM**: {M-001} — {remediation-action} — Owner: {operator} — Due: {YYYY-MM-DD}
- [ ] **LOW**: {L-001} — {remediation-action} — Owner: {operator} — Due: {YYYY-MM-DD}

---

## Audit Trail

| Timestamp | Action | By | Notes |
|-----------|--------|----|-------|
| {YYYY-MM-DD HH:MM UTC} | Audit initiated | {operator} | Scope: {scope} |
| {YYYY-MM-DD HH:MM UTC} | SSH key inventory collected | {operator} | {N} hosts |
| {YYYY-MM-DD HH:MM UTC} | Sudo grants collected | {operator} | {N} hosts |
| {YYYY-MM-DD HH:MM UTC} | IdP client inventory collected | {operator} | {N} realms |
| {YYYY-MM-DD HH:MM UTC} | Findings drafted | {operator} | |
| {YYYY-MM-DD HH:MM UTC} | Report finalized | {operator} | |
