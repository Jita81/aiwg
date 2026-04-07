# Security Incident Runbook

**Incident ID**: INC-{id}
**Date Declared**: {YYYY-MM-DD HH:MM UTC}
**Declared By**: {operator}
**Incident Commander**: {operator}
**Status**: {active|contained|remediated|closed}

---

## Incident Classification

| Field | Value |
|-------|-------|
| Severity | {P1-Critical \| P2-High \| P3-Medium \| P4-Low} |
| Type | {unauthorized-access \| data-breach \| ransomware \| key-compromise \| service-disruption \| insider-threat \| supply-chain} |
| Affected Systems | {comma-separated list of hostnames, services, or data stores} |
| Data Classification | {public \| internal \| confidential \| regulated} |
| Estimated Scope | {number of users, records, or systems potentially affected} |
| Regulatory Trigger | {GDPR \| HIPAA \| PCI-DSS \| SOC2 \| none} |

### Severity Definitions

| Severity | Definition | Response Time |
|----------|-----------|---------------|
| P1-Critical | Active breach, data exfiltration in progress, ransomware executing, CA key compromise | Immediate — all hands |
| P2-High | Confirmed unauthorized access, suspected data access, credential compromise | Within 1 hour |
| P3-Medium | Suspicious activity, failed intrusion attempt, policy violation | Within 4 hours |
| P4-Low | Anomalous behavior, informational finding, near-miss | Next business day |

---

## Containment

### Immediate Actions (complete within first 30 minutes for P1/P2)

- [ ] Incident declared and incident commander assigned
- [ ] Affected systems identified
- [ ] Stakeholders notified (see Communication section)
- [ ] Evidence preservation started BEFORE containment actions (see Evidence Collection)
- [ ] Containment actions initiated

### Network Isolation (if needed)

**CAUTION**: Network isolation may destroy volatile evidence. Capture memory and network state BEFORE isolating.

```bash
# Capture current network connections before isolation
ss -tnp > /tmp/incident-network-state-$(date +%Y%m%dT%H%M%S).txt
netstat -rn > /tmp/incident-routes-$(date +%Y%m%dT%H%M%S).txt

# Block outbound from compromised host (adjust interface and target)
# Present to operator — requires root and knowledge of network topology
sudo iptables -I OUTPUT -j DROP
sudo iptables -I FORWARD -j DROP

# Or use firewall zone change (firewalld)
sudo firewall-cmd --zone=drop --change-interface={eth0}
```

### Credential Containment (if credential compromise suspected)

1. Rotate affected SSH keys or certificates immediately:
   - Revoke SSH certificates via SSH CA KRL (see SSH CA Runbook Procedure 4)
   - Remove `authorized_keys` entries for compromised keys from all hosts
   - Rotate service account API keys and tokens

2. Revoke TLS certificates if key material is suspected compromised:
   - Follow CA Operations Runbook Procedure 3 (Revoke Certificate)

3. Disable compromised operator accounts in IdP (Keycloak, LDAP, AD)

4. Rotate LUKS passphrase on affected host (do NOT remove TPM2 slot — follow LUKS Enrollment Runbook protocol)

---

## Evidence Collection

Evidence must be collected before containment actions that would destroy it. All evidence must be collected with chain of custody documentation.

### Chain of Custody Record

| Item | Collection Time (UTC) | Collector | Storage Location | Hash (SHA256) |
|------|----------------------|-----------|-----------------|---------------|
| {description} | {YYYY-MM-DD HH:MM} | {operator} | {path or location} | {hash} |

### Log Preservation

```bash
# Collect and hash system logs before rotation
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
mkdir -p /secure/incident-{INC-id}/logs

# System logs
sudo journalctl -a --since="24 hours ago" > /secure/incident-{INC-id}/logs/journal-${TIMESTAMP}.log
sha256sum /secure/incident-{INC-id}/logs/journal-${TIMESTAMP}.log

# Auth log
sudo cp /var/log/auth.log /secure/incident-{INC-id}/logs/auth-${TIMESTAMP}.log
sha256sum /secure/incident-{INC-id}/logs/auth-${TIMESTAMP}.log

# Syslog
sudo cp /var/log/syslog /secure/incident-{INC-id}/logs/syslog-${TIMESTAMP}.log
sha256sum /secure/incident-{INC-id}/logs/syslog-${TIMESTAMP}.log

# Application logs (adjust paths)
sudo cp -r /var/log/{nginx,apache2,postgresql} /secure/incident-{INC-id}/logs/
```

### Memory Capture (P1 incidents — do before any reboot or shutdown)

```bash
# Capture running process list
ps auxf > /secure/incident-{INC-id}/processes-${TIMESTAMP}.txt

# Capture open network connections
ss -tnp > /secure/incident-{INC-id}/network-connections-${TIMESTAMP}.txt

# Capture loaded kernel modules
lsmod > /secure/incident-{INC-id}/kernel-modules-${TIMESTAMP}.txt

# Full memory dump (requires LiME or equivalent — large, requires planning)
# sudo insmod lime-$(uname -r).ko "path=/secure/incident-{INC-id}/memory.lime format=lime"
```

### Disk Image (P1 incidents with suspected persistent malware)

```bash
# Create forensic image of affected disk (do NOT image the running OS disk while mounted write)
# Boot from forensic live environment, then:
# sudo dcfldd if=/dev/{device} of=/secure/incident-{INC-id}/disk-image.dd hash=sha256 hashlog=/secure/incident-{INC-id}/disk-image.hash
```

---

## Analysis

### Indicators of Compromise (IOC) Extraction

Document all IOCs discovered during investigation:

| IOC Type | Value | Context | Confidence |
|----------|-------|---------|-----------|
| IP Address | {ip} | {source of finding} | {high\|medium\|low} |
| Domain | {domain} | {source of finding} | {high\|medium\|low} |
| File Hash | {sha256} | {file path} | {high\|medium\|low} |
| User Account | {username} | {context} | {high\|medium\|low} |
| SSH Key Fingerprint | {SHA256:...} | {context} | {high\|medium\|low} |

### Timeline

| Time (UTC) | Event | Evidence Source |
|-----------|-------|-----------------|
| {YYYY-MM-DD HH:MM} | {description of event} | {log file, alert, operator observation} |

### Root Cause Analysis

**Initial Access Vector**: {phishing \| stolen-credential \| vulnerability-exploit \| insider \| supply-chain \| unknown}

**Attack Path**:
1. {Step 1 of observed attack chain}
2. {Step 2}
3. {Step 3}

**Root Cause**: {description of the fundamental vulnerability, misconfiguration, or gap that enabled the incident}

---

## Remediation

### Immediate Remediation (within 24 hours for P1/P2)

- [ ] {Specific action: patch vulnerability CVE-XXXX-YYYY on affected hosts}
- [ ] {Rotate all credentials that may have been exposed}
- [ ] {Remove persistence mechanisms identified during analysis}
- [ ] {Update access controls to prevent recurrence}

### Short-Term Remediation (within 1 week)

- [ ] {Deploy detection rule for IOCs to SIEM}
- [ ] {Harden affected system configurations}
- [ ] {Update incident response playbooks based on lessons learned}

### Long-Term Remediation (within 30 days)

- [ ] {Architectural or process change to address root cause}
- [ ] {Security training for affected team members}
- [ ] {Additional monitoring or alerting}

---

## Communication

### Internal Notification

| Role | Person | Notified At (UTC) | Method |
|------|--------|------------------|--------|
| On-Call | {name} | {YYYY-MM-DD HH:MM} | {PagerDuty\|Slack\|phone} |
| Security Lead | {name} | {YYYY-MM-DD HH:MM} | {method} |
| Engineering Lead | {name} | {YYYY-MM-DD HH:MM} | {method} |
| Legal / Compliance | {name} | {YYYY-MM-DD HH:MM} | {method} |
| Executive | {name} | {YYYY-MM-DD HH:MM} | {method} |

### External Disclosure (if required)

**Regulatory Notification Deadlines**:

| Framework | Trigger | Deadline | Notified |
|-----------|---------|----------|---------|
| GDPR | Personal data of EU residents affected | 72 hours from discovery | {yes\|no\|not-applicable} |
| HIPAA | PHI affected | 60 days from discovery | {yes\|no\|not-applicable} |
| PCI-DSS | Cardholder data affected | Immediately to acquirer + card brands | {yes\|no\|not-applicable} |
| State breach laws | PII of state residents affected | Varies by state (30-90 days) | {yes\|no\|not-applicable} |

**Affected Users / Customers**: {yes \| no \| under-investigation}
If yes, notification plan: {description}

---

## Postmortem

**Postmortem Date**: {YYYY-MM-DD}
**Facilitator**: {operator}
**Participants**: {list}

### Timeline (Final)

| Time (UTC) | Event |
|-----------|-------|
| {YYYY-MM-DD HH:MM} | {event} |

### What Went Well

- {detection was fast because ...}
- {containment procedure worked because ...}

### What Could Have Been Better

- {detection gap: ...}
- {response gap: ...}

### Contributing Factors

| Factor | Category | Explanation |
|--------|----------|-------------|
| {factor} | {technical\|process\|people\|tooling} | {explanation} |

### Prevention Measures

| Measure | Owner | Target Date | Status |
|---------|-------|-------------|--------|
| {specific preventive action} | {operator} | {YYYY-MM-DD} | {planned\|in-progress\|done} |

### Incident Metrics

| Metric | Value |
|--------|-------|
| Time to Detection | {N} minutes/hours |
| Time to Containment | {N} minutes/hours |
| Time to Remediation | {N} hours/days |
| Time to Closure | {N} hours/days |
| Systems Affected | {N} |
| Users / Records Affected | {N} or unknown |
| Total Incident Cost | {estimate or TBD} |
