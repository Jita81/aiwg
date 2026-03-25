---
name: it-provision
description: VM/container provisioning with profile management and cloud-init integration
trigger: when the operator requests VM or container provisioning, or needs to create a new compute instance
---

# Service Provisioning

## Purpose

Provision VMs or containers from standardized profiles. Support cloud-init for automated first-boot configuration. Produce consistent, documented compute instances.

## Workflow

### 1. Select or Define Profile

Choose from existing profiles or define a new one:

```yaml
profile:
  name: "{profile_name}"
  type: "{vm / container / lxc}"
  base_image: "{image_name}:{tag}"
  resources:
    cpu: {vcpus}
    memory: "{memory}"
    disk: "{disk_size}"
  network:
    interface: "{bridge_or_network}"
    ip_mode: "{dhcp / static}"
    static_ip: "{ip_if_static}"
  cloud_init: "{cloud-init template reference}"
```

### 2. Generate Cloud-Init Configuration

Produce a cloud-init user-data file:

```yaml
#cloud-config
hostname: {hostname}
manage_etc_hosts: true
users:
  - name: {admin_user}
    groups: sudo
    shell: /bin/bash
    ssh_authorized_keys:
      - {ssh_public_key_reference}
packages:
  - {package_list}
runcmd:
  - {post_boot_commands}
```

### 3. Provision

Execute provisioning using the target platform's tooling:
- Proxmox: `qm create` / `pct create`
- Docker: `docker run` / `docker compose`
- Cloud: provider CLI (e.g., `gcloud compute instances create`)

### 4. Verify and Register

- Confirm instance is running and reachable
- Run health checks
- Register in fleet inventory
- Generate application profile document if this hosts a service

## Output

- Running compute instance
- Cloud-init configuration (archived)
- Application profile document (if applicable)
- Fleet inventory entry
