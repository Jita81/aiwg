# Host Standup: {Hostname}

## Purpose

Initialize a new host from base image through production-ready state. This procedure covers base image installation, package overlay, filesystem mounts, service enablement, and final verification. The host is not considered operational until all verification checks pass.

**Warning**: This procedure formats disks and configures network interfaces. Running on the wrong host will cause data loss. Confirm the target hostname before proceeding.

## System Topology

| Field | Value |
|-------|-------|
| Hostname | {hostname} |
| Role | {role — e.g., compute, storage, gateway, builder} |
| Hardware | {hardware model / VM spec} |
| Base image | {image name and version} |
| OS | {os name and version} |
| Architecture | {amd64 / arm64} |
| Network zone | {zone — e.g., management, production, dmz} |
| Primary IP | {ip address} |
| VLAN(s) | {vlan ids} |
| Storage layout | {disk layout — e.g., NVMe /dev/nvme0n1, SATA /dev/sda} |

## Prerequisites

- [ ] Hardware racked and powered on (or VM provisioned)
- [ ] Console / IPMI / SSH access confirmed
- [ ] Base image media available (USB, PXE, or cloud image)
- [ ] Network port configured on switch (VLAN, trunk)
- [ ] DNS records created (forward and reverse)
- [ ] IP address allocated from IPAM
- [ ] Host entry added to inventory (`roctinam/sysops` or equivalent)

## Procedure

### Step 1: Install Base Image

```bash
# Verify target disk before any destructive operation
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT
```
**Expected output:**
```
NAME    SIZE TYPE MOUNTPOINT
nvme0n1 477G disk
```

```bash
# Install base image (method varies by environment)
# Option A: Cloud image with cloud-init
qemu-img create -f qcow2 -F qcow2 -b /var/lib/libvirt/images/{base-image}.qcow2 /var/lib/libvirt/images/{hostname}.qcow2 60G
```
**Expected output:**
```
Formatting '/var/lib/libvirt/images/{hostname}.qcow2', fmt=qcow2 ...
```

### Step 2: Configure Hostname and Network

```bash
# Set hostname
hostnamectl set-hostname {hostname}
```
**Expected output:** (no output on success)

```bash
# Verify hostname
hostnamectl
```
**Expected output:**
```
 Static hostname: {hostname}
       Icon name: computer
      Machine ID: ...
```

```bash
# Configure static network (Netplan example)
cat > /etc/netplan/01-static.yaml << 'NETPLAN'
network:
  version: 2
  ethernets:
    {interface}:
      addresses:
        - {ip}/{cidr}
      routes:
        - to: default
          via: {gateway}
      nameservers:
        addresses: [{dns1}, {dns2}]
      mtu: {mtu}
NETPLAN
```

```bash
# Apply network configuration
netplan apply
```
**Expected output:** (no output on success)

### Step 3: Install Package Overlay

```bash
# Update package index
apt update
```
**Expected output:**
```
Hit:1 http://... 
...
Reading package lists... Done
```

```bash
# Install base package set for this role
apt install -y \
  {package-list — e.g., curl wget git jq htop tmux vim unattended-upgrades ufw}
```
**Expected output:**
```
...
Setting up {package} ...
```

```bash
# Install role-specific packages
apt install -y {role-specific-packages}
```

### Step 4: Configure Filesystem Mounts

```bash
# List available block devices
lsblk -f
```
**Expected output:**
```
NAME      FSTYPE FSVER LABEL UUID                                 MOUNTPOINT
nvme0n1
+-nvme0n1p1 ext4  1.0         aaaa-bbbb-cccc-dddd                /
nvme0n2   
```

```bash
# Format data disk (if applicable)
mkfs.ext4 -L {label} /dev/{data-disk}
```
**Expected output:**
```
Creating filesystem with ... blocks
...
Writing superblocks and filesystem accounting information: done
```

```bash
# Create mount point and add to fstab
mkdir -p {mount-point}
echo "LABEL={label} {mount-point} ext4 defaults,noatime 0 2" >> /etc/fstab
mount -a
```

```bash
# Configure virtiofs mounts (if VM with shared directories)
echo "{virtiofs-tag} {mount-point} virtiofs defaults 0 0" >> /etc/fstab
mount -a
```

```bash
# Verify all mounts
df -h
```
**Expected output:**
```
Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme0n1p1   59G  3.2G   53G   6% /
{virtiofs-tag}  ...   ...   ...   ...  {mount-point}
```

### Step 5: Configure Firewall

```bash
# Set default policies
ufw default deny incoming
ufw default allow outgoing
```

```bash
# Allow SSH
ufw allow ssh
```

```bash
# Allow role-specific ports
ufw allow {port}/{protocol} comment "{service name}"
```

```bash
# Enable firewall
ufw --force enable
```
**Expected output:**
```
Firewall is active and enabled on system startup
```

### Step 6: Configure SSH Access

```bash
# Deploy authorized keys
mkdir -p /home/{user}/.ssh
cat > /home/{user}/.ssh/authorized_keys << 'KEYS'
{ssh-public-key-1}
{ssh-public-key-2}
KEYS
chmod 700 /home/{user}/.ssh
chmod 600 /home/{user}/.ssh/authorized_keys
chown -R {user}:{user} /home/{user}/.ssh
```

```bash
# Harden SSH configuration
sed -i 's/#PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

### Step 7: Enable and Start Services

```bash
# Enable base services
systemctl enable --now {service-list — e.g., unattended-upgrades, ufw, node_exporter}
```
**Expected output:**
```
Created symlink /etc/systemd/system/... → ...
```

```bash
# Verify services are running
systemctl is-active {service-list}
```
**Expected output:**
```
active
active
active
```

### Step 8: Apply Configuration Overlays

```bash
# Clone host-specific configuration (if using config repo)
git clone git@git.integrolabs.net:roctinam/sysops.git /opt/sysops
```

```bash
# Apply host overlay
cp -r /opt/sysops/hosts/{hostname}/overlays/* /
systemctl daemon-reload
```

## Verification

```bash
# 1. Hostname resolves correctly
hostname -f
```
**Expected output:**
```
{hostname}.{domain}
```

```bash
# 2. Network connectivity
ping -c 3 {gateway}
```
**Expected output:**
```
3 packets transmitted, 3 received, 0% packet loss
```

```bash
# 3. DNS resolution
dig +short {hostname}.{domain}
```
**Expected output:**
```
{ip address}
```

```bash
# 4. All mounts present
mount | grep -E '{mount-point-pattern}'
```

```bash
# 5. All services running
systemctl is-active {all-expected-services}
```

```bash
# 6. Firewall active with correct rules
ufw status verbose
```

```bash
# 7. SSH key auth works (from remote machine)
ssh {user}@{hostname} "echo 'SSH OK'"
```
**Expected output:**
```
SSH OK
```

```bash
# 8. Package versions match spec
dpkg -l | grep -E '{critical-packages}' | awk '{print $2, $3}'
```

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Network unreachable after netplan apply | YAML indentation error | Check `/etc/netplan/*.yaml` syntax with `netplan try` |
| Mount fails with "unknown filesystem type virtiofs" | virtiofsd not running on host | Start virtiofsd on hypervisor, verify VM XML has filesystem device |
| SSH connection refused | sshd not running or firewall blocking | `systemctl status sshd`, `ufw status` |
| Package install fails with 404 | Stale apt cache or mirror issue | `apt update`, check `/etc/apt/sources.list` |
| Service fails to start | Missing config or dependency | `journalctl -xeu {service}` for detailed error |

## What NOT to Fix

- BIOS/UEFI settings — configured at hardware provisioning, not in this runbook
- Switch port configuration — handled by network team or separate runbook
- DNS record creation — prerequisite, not part of standup

## Agent Rules

- DO: Follow steps in order; each step depends on the previous
- DO: Run verification checks after completing all steps
- DO: Record any deviations in the audit trail
- DO NOT: Run `mkfs` without confirming the target disk matches the topology table
- DO NOT: Disable the firewall, even temporarily
- DO NOT: Apply overlays from a different host's directory
- ESCALATE IF: Hardware does not match the topology table
- ESCALATE IF: Base image version differs from specification
- ESCALATE IF: Network connectivity fails after Step 2

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last tested | {date} |
| Last modified | {date} |
| Applicable hosts | {hostname} |
| Base image version | {image version} |
