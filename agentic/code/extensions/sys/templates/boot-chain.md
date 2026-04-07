# Boot Chain Configuration: {hostname}

**Target Host**: {hostname}
**Boot Mode**: UEFI + Secure Boot
**Encryption**: LUKS2 + TPM2 auto-unlock
**Last Verified**: {date}
**Author**: {author}

---

## Purpose

Document the full boot chain from firmware to userspace for {hostname}, including LUKS2 encryption with TPM2-based automatic unlock. Provide a verified recovery procedure for when TPM2 unlock fails (firmware update, PCR drift, hardware change).

---

## System Topology

| Component | Detail |
|-----------|--------|
| Firmware | {firmware_vendor} {firmware_version} |
| Secure Boot | Enabled, vendor keys + {custom_mok} |
| Boot Loader | systemd-boot / GRUB2 |
| Initramfs | {initramfs_tool} (dracut / initramfs-tools) |
| Root Device | /dev/{root_device} (LUKS2) |
| TPM2 Device | /dev/tpmrm0 |
| PCR Policy | PCR 0,2,7 (firmware, option ROMs, Secure Boot state) |

---

## Boot Chain Sequence

### 1. Firmware (UEFI)

- UEFI firmware initializes hardware
- Secure Boot validates bootloader signature
- EFI System Partition mounted from `/dev/{esp_device}`
- Bootloader binary loaded: `/boot/efi/EFI/{distro}/{bootloader}.efi`

### 2. Bootloader

- Reads boot configuration
- Loads kernel (`/boot/vmlinuz-{version}`) and initramfs (`/boot/initrd.img-{version}`)
- Passes kernel command line: `root=/dev/mapper/{crypt_name} ro quiet`

### 3. Initramfs

- Minimal userspace loads kernel modules for disk, crypto, and TPM2
- `cryptsetup` invoked to open LUKS2 volume
- TPM2 unseal attempted first (via `systemd-cryptenroll` or `clevis`)
- On success: root device mapped as `/dev/mapper/{crypt_name}`
- On failure: falls back to passphrase prompt on console

**Key initramfs components**:

```
/etc/crypttab:
{crypt_name}  UUID={luks_uuid}  none  tpm2-device=auto,discard

/etc/initramfs-tools/modules (if using initramfs-tools):
tpm_tis
tpm_crb
```

### 4. crypttab Processing

The initramfs reads `/etc/crypttab` to determine unlock method:

```
# /etc/crypttab
# <target>       <source_device>                          <key_file>  <options>
{crypt_name}     UUID={luks_uuid}                         none        tpm2-device=auto,discard
```

When `tpm2-device=auto` is specified, systemd attempts to unseal the key from TPM2 before prompting for a passphrase.

### 5. TPM2 Unseal

- systemd-cryptenroll stored a LUKS key in TPM2 NVRAM bound to PCR policy
- At boot, TPM2 checks current PCR values against the sealed policy
- If PCRs match: key is released, LUKS volume opens automatically
- If PCRs differ: unseal fails, initramfs prompts for passphrase on console

### 6. Root Filesystem Mount

- `/dev/mapper/{crypt_name}` mounted as `/` per fstab
- systemd pivots root and continues boot
- Remaining filesystems mounted per `/etc/fstab`

---

## Procedure — Initial TPM2 Enrollment

> **CRITICAL**: Follow the `sys-hardware-safety` rule. Phase 1 (research) must complete before Phase 2 (execution).

### Phase 1: Verify Current State

```bash
# Dump LUKS header to confirm slot layout
cryptsetup luksDump /dev/{root_device}

# Verify TPM2 device is present
tpm2_getcap properties-fixed 2>/dev/null | head -5

# Check current PCR values
tpm2_pcrread sha256:0,2,7

# Confirm initramfs has TPM2 modules
lsinitramfs /boot/initrd.img-$(uname -r) | grep -i tpm

# Verify a passphrase slot exists (MUST remain as fallback)
cryptsetup luksDump /dev/{root_device} | grep "Keyslot"
```

Present results to operator. Do not proceed until Phase 2 is approved.

### Phase 2: Enroll TPM2 (requires human approval)

```bash
# Enroll TPM2 key bound to PCR 0,2,7
systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=0+2+7 /dev/{root_device}

# Update initramfs to include TPM2 unlock support
update-initramfs -u -k all

# Update crypttab to use TPM2
# Ensure line reads: {crypt_name} UUID={luks_uuid} none tpm2-device=auto,discard

# Rebuild bootloader config
update-grub  # or: bootctl update
```

---

## Verification

```bash
# Confirm TPM2 keyslot was added
cryptsetup luksDump /dev/{root_device} | grep -A2 "systemd-tpm2"

# Confirm passphrase slot still exists (fallback)
cryptsetup luksDump /dev/{root_device} | grep "Keyslots"

# Confirm initramfs contains TPM2 modules
lsinitramfs /boot/initrd.img-$(uname -r) | grep tpm

# Test: reboot and verify auto-unlock (no passphrase prompt)
# Operator must verify this interactively
```

### Success Criteria

- [ ] LUKS volume opens automatically on clean boot (no passphrase prompt)
- [ ] Passphrase slot remains active as fallback
- [ ] `cryptsetup luksDump` shows both passphrase and TPM2 keyslots
- [ ] initramfs includes TPM2 modules

---

## Troubleshooting — TPM2 Unlock Failure

### Symptom

System halts at boot with a passphrase prompt instead of auto-unlocking. This indicates the TPM2 unseal failed.

### Common Causes

| Cause | Indicator |
|-------|-----------|
| Firmware update changed PCR 0 | Recent BIOS/UEFI update |
| Secure Boot key change altered PCR 7 | MOK enrollment, key rotation |
| Option ROM change altered PCR 2 | NIC firmware update, add-in card change |
| TPM2 was cleared | Explicit `tpm2_clear` or BIOS reset |
| initramfs missing TPM2 modules | Kernel update without `update-initramfs` |

### Recovery Procedure

**Step 1**: Enter the LUKS passphrase at the console prompt to boot the system.

**Step 2**: Diagnose the cause:

```bash
# Check TPM2 availability
tpm2_getcap properties-fixed

# Read current PCR values
tpm2_pcrread sha256:0,2,7

# Check systemd journal for TPM2 errors
journalctl -b -t systemd-cryptsetup | grep -i tpm

# Verify initramfs TPM2 modules
lsinitramfs /boot/initrd.img-$(uname -r) | grep tpm
```

**Step 3**: Re-enroll TPM2 with current PCR values (requires Phase 1 + Phase 2 approval per `sys-hardware-safety`):

```bash
# Remove old TPM2 enrollment
systemd-cryptenroll --wipe-slot=tpm2 /dev/{root_device}

# Re-enroll with current PCR state
systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=0+2+7 /dev/{root_device}

# Rebuild initramfs
update-initramfs -u -k all
```

**Step 4**: Reboot and verify auto-unlock.

### If Console Access Is Unavailable

If the system is remote and there is no console access (IPMI, serial, KVM):

1. The system cannot be unlocked remotely without a network-based unlock mechanism (e.g., `dropbear` in initramfs, `clevis-tang`)
2. If no remote unlock is configured, physical access is required
3. **Prevention**: Configure `dropbear-initramfs` for SSH-based passphrase entry on remote systems

---

## Agent Rules

- All boot chain modifications require dual-phase validation per `sys-hardware-safety`
- Never remove the passphrase keyslot — it is the recovery fallback
- Never automate passphrase entry per `sys-interactive-gate`
- Document PCR policy changes in the change log below
- After any firmware update, verify TPM2 auto-unlock on next boot

---

## Audit Trail

| Date | Change | PCR Impact | Verified By |
|------|--------|------------|-------------|
| {date} | {change_description} | {pcr_impact} | {operator} |
