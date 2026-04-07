# Host Reference: {Hostname}

## Purpose

Centralized configuration reference for {hostname}. This document records the authoritative state of this host — hardware, OS, network, storage, services, and operational parameters. Consult this reference before making changes; update it after every change.

## Hardware

| Field | Value |
|-------|-------|
| Model | {hardware model — e.g., Dell PowerEdge R750, custom build, Proxmox VM} |
| CPU | {cpu model, cores, threads — e.g., AMD EPYC 9354 32C/64T} |
| RAM | {total memory — e.g., 128 GB DDR5 ECC} |
| Boot disk | {device, size, type — e.g., /dev/nvme0n1, 512 GB NVMe} |
| Data disk(s) | {device, size, type — e.g., /dev/sda, 4 TB SATA SSD} |
| NIC(s) | {interface, speed — e.g., enp5s0 10GbE, enp6s0 1GbE} |
| GPU | {model or "none"} |
| IPMI / iLO / iDRAC | {management IP or "N/A"} |
| Serial number | {serial} |
| Rack / Location | {rack, unit — e.g., Rack A, U12-U14} |

## Operating System

| Field | Value |
|-------|-------|
| Distribution | {distro — e.g., Ubuntu 24.04 LTS} |
| Kernel | {kernel version — e.g., 6.8.0-45-generic} |
| Architecture | {amd64 / arm64} |
| Base image | {image name and build date} |
| Last OS upgrade | {date} |
| Reboot required | {yes / no} |

## Network

### Interfaces

| Interface | IP Address | Subnet | VLAN | MTU | Purpose |
|-----------|-----------|--------|------|-----|---------|
| {enp5s0} | {192.168.1.10} | {/24} | {100} | {9000} | {Primary / management} |
| {enp6s0} | {10.0.0.10} | {/24} | {200} | {1500} | {Storage / backup} |
| {wg0} | {10.10.0.10} | {/24} | {—} | {1420} | {WireGuard tunnel} |

### DNS

| Field | Value |
|-------|-------|
| Forward record | {hostname}.{domain} → {ip} |
| Reverse record | {ip} → {hostname}.{domain} |
| Search domain | {domain} |
| Nameservers | {dns1}, {dns2} |

### Firewall Rules

| Port | Protocol | Direction | Source | Service |
|------|----------|-----------|--------|---------|
| 22 | TCP | IN | {allowed-cidr} | SSH |
| 443 | TCP | IN | any | HTTPS |
| 9090 | TCP | IN | {monitoring-cidr} | Prometheus |
| {port} | {proto} | {in/out} | {source} | {service} |

### Routes

| Destination | Gateway | Interface | Metric | Notes |
|-------------|---------|-----------|--------|-------|
| default | {gateway-ip} | {interface} | 100 | Primary route |
| {cidr} | {gateway} | {interface} | {metric} | {purpose} |

## Storage

### Block Devices

| Device | Size | Filesystem | Label | Mount Point | Options |
|--------|------|-----------|-------|-------------|---------|
| /dev/nvme0n1p1 | {size} | ext4 | root | / | defaults |
| /dev/sda1 | {size} | ext4 | data | /data | defaults,noatime |
| {virtiofs-tag} | {size} | virtiofs | {label} | {mount} | defaults |

### Important Paths

| Path | Purpose | Owner | Permissions | Backup? |
|------|---------|-------|-------------|---------|
| /data | Application data | {user}:{group} | 750 | Yes |
| /var/log | System logs | root:syslog | 775 | Yes (rotated) |
| /opt/{service} | Service installation | root:root | 755 | No (redeployable) |
| {path} | {purpose} | {owner} | {perms} | {yes/no} |

## Services

### Active Services

| Service | Port(s) | Version | Config Path | Log Path | Restart Policy |
|---------|---------|---------|-------------|----------|----------------|
| sshd | 22 | {ver} | /etc/ssh/sshd_config | /var/log/auth.log | always |
| {service} | {port} | {ver} | {config} | {log} | {policy} |
| node_exporter | 9100 | {ver} | /etc/default/node_exporter | journal | always |

### Scheduled Tasks (cron / timers)

| Schedule | Command | User | Purpose |
|----------|---------|------|---------|
| 0 2 * * * | {command} | root | {purpose — e.g., log rotation} |
| {schedule} | {command} | {user} | {purpose} |

## Credentials and Access

| Access Method | Details | Key Location |
|---------------|---------|-------------|
| SSH | Key-based, port 22 | ~/.ssh/authorized_keys |
| IPMI / Console | {url or method} | {credential store reference} |
| Service accounts | {account list} | {credential store reference} |

**Note**: Never store credentials in this document. Reference the credential store location only.

## Monitoring

| Metric Source | Endpoint | Dashboard |
|---------------|----------|-----------|
| node_exporter | http://{hostname}:9100/metrics | {grafana-url} |
| {application} | {endpoint} | {dashboard-url} |

### Alert Rules

| Alert | Condition | Severity | Runbook |
|-------|-----------|----------|---------|
| HostDown | up == 0 for 5m | critical | {link} |
| DiskSpace | disk_used > 85% | warning | {link} |
| {alert} | {condition} | {severity} | {link} |

## Backup

| What | Method | Schedule | Retention | Verify Command |
|------|--------|----------|-----------|----------------|
| /data | {restic / borgbackup / rsync} | Daily 02:00 | 30 days | {verify command} |
| /etc | {method} | Daily 02:00 | 90 days | {verify command} |
| {path} | {method} | {schedule} | {retention} | {command} |

## Operational Notes

### Known Quirks

- {Any intentional deviations, workarounds, or known issues with this host}
- {Hardware-specific behavior that differs from other hosts}

### Dependencies

| This Host Depends On | For |
|---------------------|-----|
| {other-host-or-service} | {what — e.g., NFS storage, DNS, CA} |

| Depends On This Host | For |
|---------------------|-----|
| {other-host-or-service} | {what — e.g., reverse proxy, database} |

### Maintenance Windows

| Window | Schedule | Notes |
|--------|----------|-------|
| OS patches | {schedule — e.g., Tuesday 02:00-04:00} | Auto-reboot if kernel update |
| {maintenance} | {schedule} | {notes} |

## Change History

| Date | Change | Author | Related Issue |
|------|--------|--------|---------------|
| {date} | Initial standup | {author} | {issue-ref} |
| {date} | {change description} | {author} | {issue-ref} |

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last verified | {date} |
| Last modified | {date} |
