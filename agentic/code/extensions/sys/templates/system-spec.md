# System Specification: {hostname}

**Role**: {role}
**Location**: {location}
**Last Updated**: {date}
**Maintainer**: {maintainer}

---

## System Overview

| Field | Value |
|-------|-------|
| Hostname | `{hostname}` |
| Role | {role} |
| Location | {location} (rack {rack_id}, unit {rack_unit}) |
| Primary IP | `{primary_ip}` |
| Management IP | `{mgmt_ip}` |
| OS | {os_name} {os_version} |
| Serial Number | {serial} |

---

## Hardware

### CPU

| Field | Value |
|-------|-------|
| Model | {cpu_model} |
| Cores / Threads | {cores} / {threads} |
| Base / Boost Clock | {base_clock} / {boost_clock} |
| Architecture | {cpu_arch} |

### Memory

| Field | Value |
|-------|-------|
| Total | {ram_total} |
| Type | {ram_type} (e.g., DDR5-5600 ECC) |
| Configuration | {ram_slots_used} / {ram_slots_total} slots |
| Per-DIMM | {ram_per_dimm} |

### GPU (if applicable)

| Field | Value |
|-------|-------|
| Model | {gpu_model} |
| VRAM | {gpu_vram} |
| Driver | {gpu_driver_version} |
| Purpose | {gpu_purpose} (compute / display / passthrough) |

### Storage

| Device | Type | Size | Model | Serial | Notes |
|--------|------|------|-------|--------|-------|
| {device_path} | {type} | {size} | {model} | {serial} | {notes} |

---

## Software

### Operating System

| Field | Value |
|-------|-------|
| Distribution | {os_distro} |
| Version | {os_version} |
| Kernel | {kernel_version} |
| Boot Mode | {boot_mode} (UEFI / Legacy) |
| Secure Boot | {secure_boot} (enabled / disabled) |

### Key Packages

| Package | Version | Purpose |
|---------|---------|---------|
| {package_name} | {package_version} | {package_purpose} |

---

## Network

### Interfaces

| Interface | MAC | IP | Subnet | VLAN | Purpose |
|-----------|-----|-----|--------|------|---------|
| {iface_name} | {mac} | {ip} | {subnet} | {vlan} | {purpose} |

### DNS

| Field | Value |
|-------|-------|
| Nameservers | {nameservers} |
| Search Domains | {search_domains} |
| FQDN | {fqdn} |

### Firewall Rules

| Chain | Port/Proto | Source | Action | Purpose |
|-------|-----------|--------|--------|---------|
| {chain} | {port_proto} | {source} | {action} | {purpose} |

---

## Storage Layout

### Mount Points

| Mount | Device | Filesystem | Size | Options | Notes |
|-------|--------|------------|------|---------|-------|
| {mount_path} | {device} | {fs_type} | {size} | {mount_options} | {notes} |

### RAID Configuration

| Array | Level | Devices | State | Notes |
|-------|-------|---------|-------|-------|
| {array_name} | {raid_level} | {member_devices} | {state} | {notes} |

### Encryption

| Device | Method | Key Location | Recovery Key | Notes |
|--------|--------|-------------|-------------|-------|
| {device} | {method} (LUKS2 / none) | {key_location} | {recovery_ref} | {notes} |

> **WARNING**: Never document actual keys or passphrases. Reference key storage locations only.

---

## Services

### Active systemd Units

| Unit | State | Enabled | Port(s) | Purpose |
|------|-------|---------|---------|---------|
| {unit_name} | {active_state} | {enabled} | {ports} | {purpose} |

### Cron / Timers

| Schedule | Command/Unit | Purpose |
|----------|-------------|---------|
| {schedule} | {command} | {purpose} |

---

## Backup Configuration

| What | Where | Schedule | Retention | Last Verified |
|------|-------|----------|-----------|---------------|
| {backup_source} | {backup_dest} | {schedule} | {retention} | {last_verified} |

### Recovery Procedure

1. {recovery_step_1}
2. {recovery_step_2}
3. {recovery_step_3}

---

## Known Quirks

> Document intentional deviations, things that look wrong but are correct, and things NOT to change.

| Quirk | Reason | Do Not |
|-------|--------|--------|
| {quirk_description} | {reason} | {do_not_action} |

---

## Agent Rules for This Host

> Host-specific rules that override or supplement fleet-wide defaults.

- {agent_rule_1}
- {agent_rule_2}

---

## Change Log

| Date | Change | By |
|------|--------|-----|
| {date} | {change_description} | {author} |
