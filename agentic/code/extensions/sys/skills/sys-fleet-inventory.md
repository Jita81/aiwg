---
name: sys-fleet-inventory
description: Collect and reconcile hardware inventory across all fleet hosts
trigger: when the operator requests fleet inventory, hardware audit, or asset reconciliation
---

# Fleet Inventory Collection

## Purpose

Collect hardware and software inventory from all documented fleet hosts, produce a consolidated OpsInventory YAML, and generate discrepancy reports highlighting drift between documented and actual state.

## Workflow

### 1. Discover Hosts

Scan the sysops repository (or configured fleet docs path) for system-spec documents. Extract the list of known hosts.

```
Input: Fleet documentation directory
Output: List of hostnames with spec file paths
```

### 2. Collect Documented State

Parse each system-spec document to extract:
- Hostname, role, location
- CPU, RAM, GPU, storage hardware
- Network interfaces and IPs
- OS and kernel version
- Running services

### 3. Collect Live State (when accessible)

For each reachable host, gather live system information:

```bash
# Hardware
lscpu | grep "Model name\|Socket\|Core\|Thread"
free -h
lspci | grep -i "vga\|3d\|display"
lsblk -o NAME,SIZE,TYPE,MODEL,SERIAL

# Software
uname -r
cat /etc/os-release

# Network
ip -br addr
ip -br link

# Services
systemctl list-units --type=service --state=running --no-pager
```

### 4. Produce OpsInventory YAML

```yaml
fleet:
  collected: "{timestamp}"
  host_count: {n}
  hosts:
    - hostname: "{hostname}"
      role: "{role}"
      location: "{location}"
      hardware:
        cpu: "{cpu_model}"
        cores: {cores}
        ram: "{ram_total}"
        gpu: "{gpu_model}"
        storage:
          - device: "{device}"
            type: "{type}"
            size: "{size}"
      network:
        - interface: "{iface}"
          ip: "{ip}"
          mac: "{mac}"
      os: "{os_version}"
      kernel: "{kernel_version}"
      source: "{documented | live | both}"
```

### 5. Generate Discrepancy Report

Compare documented vs. live state for each host. Flag:
- **Missing docs**: Host exists but has no system-spec
- **Stale docs**: Documented values differ from live values
- **Unreachable**: Host documented but not accessible for live check
- **Undocumented host**: Host discovered on network but not in fleet docs

## Output

- `fleet-inventory.yaml` — Consolidated inventory
- `fleet-discrepancies.md` — Discrepancy report with recommended actions
