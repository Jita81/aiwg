# TPM2 Enrollment Runbook: {hostname}

**Target Host**: {hostname}
**LUKS Device**: /dev/{root_device}
**TPM2 Device**: /dev/tpmrm0
**PCR Policy**: {pcr_set} (e.g., 0+2+7)
**Last Verified**: {date}
**Author**: {author}

---

## Purpose

Step-by-step runbook for enrolling, re-enrolling, or removing TPM2 auto-unlock for a LUKS2 volume. Enforces the mandatory dual-phase validation required by `sys-hardware-safety` before any LUKS modification.

---

## System Topology

| Component | Detail |
|-----------|--------|
| Host | {hostname} |
| Root Device | /dev/{root_device} |
| LUKS Version | LUKS2 |
| TPM2 Chip | {tpm2_manufacturer} {tpm2_firmware_version} |
| Enrollment Tool | systemd-cryptenroll |
| PCR Binding | {pcr_set} |
| Passphrase Slot | Slot 0 (MUST remain active) |
| TPM2 Slot | Slot {tpm2_slot} |

---

## Prerequisites

- [ ] Root access on {hostname}
- [ ] `systemd-cryptenroll` installed (systemd >= 248)
- [ ] `tpm2-tools` installed
- [ ] TPM2 device visible at `/dev/tpmrm0`
- [ ] Active LUKS passphrase known (for authentication during enrollment)
- [ ] Console or IPMI access available (in case boot fails)
- [ ] Live USB prepared and tested (boot verified on this hardware)

---

## Procedure

> **CRITICAL**: This runbook uses mandatory dual-phase validation. Do NOT skip Phase 1. Do NOT execute Phase 2 commands without explicit human approval.

### Phase 1: Research and Verify Current State

**Every LUKS modification begins here.** Phase 1 is read-only. No changes are made to the system.

#### 1.1 Verify LUKS Header

```bash
# Full LUKS header dump — identify all active keyslots
cryptsetup luksDump /dev/{root_device}

# Record which slots are in use and their types
cryptsetup luksDump /dev/{root_device} | grep -E "^  [0-9]+: (luks2|systemd-tpm2)"
```

**Expected**: At least Slot 0 (passphrase) is active.

#### 1.2 Verify TPM2 Device

```bash
# Confirm TPM2 is present and functional
tpm2_getcap properties-fixed | head -10

# Read current PCR values that will be used in the binding policy
tpm2_pcrread sha256:{pcr_set_comma_separated}
```

**Expected**: TPM2 responds with fixed properties. PCR values are non-zero.

#### 1.3 Verify initramfs Configuration

```bash
# Confirm initramfs includes TPM2 modules
lsinitramfs /boot/initrd.img-$(uname -r) | grep -i tpm

# Check crypttab for current unlock configuration
cat /etc/crypttab
```

**Expected**: TPM modules present in initramfs (or will be added in Phase 2). crypttab shows the LUKS mapping.

#### 1.4 Verify Passphrase Slot Is Active

```bash
# Test that the passphrase slot works (interactive — hand to operator)
# Command: cryptsetup luksOpen --test-passphrase --key-slot 0 /dev/{root_device}
```

> **INTERACTIVE**: This command prompts for a passphrase. Present it to the human operator per `sys-interactive-gate`.

#### 1.5 Verify Live USB Fallback

```bash
# Confirm live USB is bootable on this hardware (operator must test)
# Boot from USB, mount LUKS manually:
# cryptsetup luksOpen /dev/{root_device} {crypt_name}
# mount /dev/mapper/{crypt_name} /mnt
```

> **INTERACTIVE**: Operator must confirm live USB has been tested on this specific hardware.

#### 1.6 Present Phase 1 Summary

Present the following to the operator before proceeding:

```
Phase 1 Summary — {hostname}
================================
LUKS Device:       /dev/{root_device}
Active Keyslots:   {list_of_active_slots}
TPM2 Present:      {yes/no}
TPM2 Firmware:     {version}
PCR Values:        {current_pcr_values}
initramfs TPM2:    {present/missing}
crypttab Config:   {current_line}
Passphrase Slot:   {active/inactive}
Live USB Tested:   {yes/no}

Proposed Action: {enroll|re-enroll|remove} TPM2 on slot {N}
PCR Binding:     {pcr_set}
```

**STOP. Wait for explicit human approval before proceeding to Phase 2.**

---

### Phase 2: Apply Changes

> Only execute after Phase 1 is complete and human has approved.

#### Scenario A: Initial TPM2 Enrollment

```bash
# Step 1: Enroll TPM2 key bound to specified PCRs
# INTERACTIVE — will prompt for existing LUKS passphrase
systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs={pcr_set} /dev/{root_device}

# Step 2: Update crypttab to enable TPM2 auto-unlock
# Ensure the line reads:
# {crypt_name} UUID={luks_uuid} none tpm2-device=auto,discard

# Step 3: Rebuild initramfs with TPM2 support
update-initramfs -u -k all

# Step 4: Rebuild bootloader configuration
update-grub  # or: bootctl update
```

#### Scenario B: Re-enrollment (after PCR drift)

```bash
# Step 1: Wipe existing TPM2 slot
# INTERACTIVE — will prompt for existing LUKS passphrase
systemd-cryptenroll --wipe-slot=tpm2 /dev/{root_device}

# Step 2: Re-enroll with current PCR values
# INTERACTIVE — will prompt for existing LUKS passphrase
systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs={pcr_set} /dev/{root_device}

# Step 3: Rebuild initramfs
update-initramfs -u -k all
```

#### Scenario C: Remove TPM2 Enrollment

```bash
# Step 1: Wipe TPM2 slot only (passphrase slot remains)
# INTERACTIVE — will prompt for existing LUKS passphrase
systemd-cryptenroll --wipe-slot=tpm2 /dev/{root_device}

# Step 2: Update crypttab to remove TPM2 option
# Change tpm2-device=auto to: none
# {crypt_name} UUID={luks_uuid} none discard

# Step 3: Rebuild initramfs
update-initramfs -u -k all
```

---

## Verification

```bash
# Confirm keyslot layout matches expectation
cryptsetup luksDump /dev/{root_device} | grep -E "^  [0-9]+:"

# Confirm passphrase slot 0 is still active (CRITICAL)
cryptsetup luksDump /dev/{root_device} | grep "0: luks2"

# Confirm TPM2 slot status matches scenario
cryptsetup luksDump /dev/{root_device} | grep "systemd-tpm2"

# Confirm initramfs has TPM2 modules
lsinitramfs /boot/initrd.img-$(uname -r) | grep tpm

# Confirm crypttab is correct
cat /etc/crypttab
```

### Reboot Verification

> **INTERACTIVE**: Operator must perform the reboot and observe the console.

1. Reboot the system
2. Watch the console for passphrase prompt
   - **Enrollment/Re-enrollment**: System should auto-unlock (no prompt)
   - **Removal**: System should prompt for passphrase
3. Verify system boots fully and all services start

```bash
# After reboot, confirm LUKS is open and root is mounted
lsblk -o NAME,FSTYPE,MOUNTPOINT | grep crypt
systemctl --failed
uptime
```

### Success Criteria

- [ ] LUKS keyslot layout matches expected configuration
- [ ] Passphrase slot 0 remains active
- [ ] TPM2 slot matches intended state (present or absent)
- [ ] initramfs contains TPM2 modules (if enrolled)
- [ ] crypttab reflects the correct unlock method
- [ ] System reboots cleanly with expected unlock behavior
- [ ] No failed systemd units after reboot

---

## Rollback

If Phase 2 fails at any step:

1. **Do not reboot** until the state is verified
2. Confirm passphrase slot 0 is still active:
   ```bash
   cryptsetup luksDump /dev/{root_device} | grep "0: luks2"
   ```
3. If passphrase slot is active: revert crypttab to passphrase-only mode, rebuild initramfs, reboot with passphrase
4. If passphrase slot is NOT active: **DO NOT REBOOT** — use live USB to restore a passphrase slot:
   ```bash
   # From live USB:
   cryptsetup luksAddKey /dev/{root_device}
   ```
5. If the system is already in a failed boot state: boot from live USB, mount LUKS with passphrase, repair from chroot

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| `systemd-cryptenroll` fails with "No TPM2 device" | TPM2 kernel module not loaded | `modprobe tpm_crb` or `modprobe tpm_tis` |
| Enrollment succeeds but boot still prompts | crypttab missing `tpm2-device=auto` | Update crypttab, rebuild initramfs |
| Boot prompt appears after firmware update | PCR 0 changed | Re-enroll (Scenario B) |
| Boot prompt after Secure Boot key change | PCR 7 changed | Re-enroll (Scenario B) |
| `systemd-cryptenroll` hangs | Waiting for passphrase input | Hand to operator per `sys-interactive-gate` |
| initramfs missing TPM modules after rebuild | Missing `tpm_crb`/`tpm_tis` in modules config | Add to `/etc/initramfs-tools/modules`, rebuild |

---

## Agent Rules

- **Dual-phase validation is mandatory** — never skip Phase 1
- **Never remove passphrase slot 0** — it is the only recovery fallback without a live USB
- **Never automate passphrase entry** — all `systemd-cryptenroll` commands that prompt for a passphrase must be handed to the operator per `sys-interactive-gate`
- **Live USB must be verified** before any enrollment change on a remote system
- **Log every LUKS modification** in the audit trail below

---

## Audit Trail

| Date | Action | Slots Before | Slots After | Operator | Verified |
|------|--------|-------------|-------------|----------|----------|
| {date} | {enroll/re-enroll/remove} | {before} | {after} | {operator} | {yes/no} |
