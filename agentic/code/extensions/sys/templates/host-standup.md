# Host Standup Checklist: {hostname}

**Target Role**: {role}
**Target OS**: {os_name} {os_version}
**Started**: {start_date}
**Completed**: {completion_date}
**Operator**: {operator}

---

## 1. Hardware Preparation

- [ ] Hardware physically installed and cabled
- [ ] Power supply verified ({psu_wattage}, redundancy: {redundancy_config})
- [ ] Network cables connected: {interface_list}
- [ ] Console/IPMI access confirmed: {mgmt_ip}
- [ ] BIOS/UEFI firmware version: {firmware_version}
- [ ] BIOS settings applied:
  - [ ] Boot mode: {boot_mode} (UEFI / Legacy)
  - [ ] Secure Boot: {secure_boot_setting}
  - [ ] Virtualization: {vt_setting} (if applicable)
  - [ ] Boot order: {boot_order}

---

## 2. OS Installation

- [ ] Installation media: {install_media} (USB / PXE / image)
- [ ] Partitioning scheme:
  - [ ] `/boot/efi`: {efi_size} (FAT32)
  - [ ] `/boot`: {boot_size} ({boot_fs})
  - [ ] `/`: {root_size} ({root_fs})
  - [ ] `/home`: {home_size} ({home_fs})
  - [ ] swap: {swap_size}
  - [ ] Additional: {additional_partitions}
- [ ] Encryption configured: {encryption_method} (LUKS2 / none)
- [ ] Base OS installed and booting
- [ ] Kernel version verified: {kernel_version}

---

## 3. Network Configuration

- [ ] Hostname set: `{hostname}`
- [ ] Primary interface configured:
  - Interface: {primary_iface}
  - IP: {primary_ip}/{subnet}
  - Gateway: {gateway}
- [ ] Additional interfaces:
  - [ ] {additional_iface}: {additional_ip} ({purpose})
- [ ] DNS configured: {nameservers}
- [ ] Search domains: {search_domains}
- [ ] Firewall baseline applied:
  - [ ] SSH (port {ssh_port}) from {ssh_allowed_sources}
  - [ ] {additional_fw_rules}
- [ ] Connectivity verified:
  ```bash
  ping -c 3 {gateway}
  ping -c 3 {dns_test_target}
  curl -s -o /dev/null -w "%{http_code}" {http_test_url}
  ```

---

## 4. Storage Setup

- [ ] Disks detected and verified:
  ```bash
  lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT
  ```
- [ ] RAID configured (if applicable): {raid_config}
- [ ] Filesystems created and mounted per partition scheme
- [ ] `/etc/fstab` verified:
  ```bash
  mount -a && echo "fstab OK"
  ```
- [ ] SMART monitoring enabled:
  ```bash
  smartctl -a {primary_disk}
  ```

---

## 5. User Accounts

- [ ] Root password set (or root login disabled)
- [ ] Service account created: {service_user}
- [ ] Operator accounts created:
  - [ ] {operator_user_1}
  - [ ] {operator_user_2}
- [ ] sudo configured for {sudo_group}
- [ ] Password policy applied

---

## 6. SSH Configuration

- [ ] SSH daemon running on port {ssh_port}
- [ ] Authorized keys deployed for:
  - [ ] {ssh_user_1}: {key_fingerprint_1}
  - [ ] {ssh_user_2}: {key_fingerprint_2}
- [ ] Password authentication: {password_auth} (disabled recommended)
- [ ] Root login: {root_login} (disabled recommended)
- [ ] SSH hardening applied:
  - [ ] `PermitRootLogin no`
  - [ ] `PasswordAuthentication no`
  - [ ] `MaxAuthTries 3`

---

## 7. Monitoring Agent

- [ ] Monitoring agent installed: {monitoring_agent}
- [ ] Agent configured to report to: {monitoring_server}
- [ ] Host visible in monitoring dashboard
- [ ] Basic checks passing:
  - [ ] CPU load
  - [ ] Memory usage
  - [ ] Disk usage
  - [ ] Network connectivity
- [ ] Alert routing configured: {alert_destination}

---

## 8. Fleet Registration

- [ ] Host registered in fleet inventory: {fleet_tool}
- [ ] System spec document created: `{spec_doc_path}`
- [ ] Tags/labels applied: {host_tags}
- [ ] Configuration management enrolled: {config_mgmt} (Ansible / Salt / manual)
- [ ] Backup agent configured:
  - What: {backup_scope}
  - Where: {backup_target}
  - Schedule: {backup_schedule}

---

## 9. Smoke Test

- [ ] System boots cleanly from internal storage
- [ ] All services start on boot:
  ```bash
  systemctl list-units --state=failed
  ```
- [ ] No failed units
- [ ] Network services reachable from fleet:
  ```bash
  # From another host:
  ssh -p {ssh_port} {service_user}@{primary_ip} "hostname && uptime"
  ```
- [ ] Monitoring receiving data
- [ ] Backup test run completed:
  ```bash
  {backup_test_command}
  ```
- [ ] Role-specific validation:
  - [ ] {role_specific_check_1}
  - [ ] {role_specific_check_2}

---

## Post-Standup

- [ ] System spec document finalized and committed
- [ ] Fleet inventory updated
- [ ] Handoff to operations complete
- [ ] Known quirks documented (if any)

---

## Notes

{additional_notes}
