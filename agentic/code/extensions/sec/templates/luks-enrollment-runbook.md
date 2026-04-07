# LUKS/TPM2 Enrollment Runbook: {hostname}

**Host**: {hostname}
**Device**: {/dev/device}
**Date**: {YYYY-MM-DD}
**Operator**: {operator}
**Issue / Ticket**: {issue-url}

---

## Purpose

Enroll TPM2 auto-unlock for the LUKS-encrypted volume on {hostname}. After enrollment, the system will automatically unlock its encrypted volume on boot using the TPM2 chip, while retaining the passphrase in slot 0 as a permanent fallback.

---

## Prerequisites

Before beginning, confirm all of the following are true:

- [ ] Host hardware model is identified: `{model}`
- [ ] Host is accessible via SSH
- [ ] Operator has root access on the host
- [ ] A tested live USB is available and confirmed to boot on this hardware model
- [ ] The LUKS passphrase for slot 0 is known and accessible (stored in password manager or sealed envelope)
- [ ] Recovery procedure has been written to the associated issue: {issue-url}

---

## CRITICAL: Read This Before Proceeding

This is the highest-stakes runbook in the fleet. A single incorrect operation can permanently lock the host out of its encrypted volume, requiring physical access and forensic recovery tools. There are no exceptions to the dual-phase validation sequence.

**DO NOT**:
- Skip any Phase 1 check, even if the host "looks fine"
- Proceed if any Phase 1 check fails
- Remove passphrase slot 0, ever, under any circumstances
- Proceed without a tested live USB for this specific hardware model

**ESCALATE IMMEDIATELY if**:
- Any Phase 1 check fails
- The hardware model is not in the known-good list for the current kernel
- Initramfs is missing any required TPM2 module
- Slot 0 shows as anything other than ENABLED

---

## Phase 1 — Pre-Enrollment Verification

Complete all Phase 1 steps and record results before touching any LUKS operation.

### Step 1.1 — Hardware Model and TPM2 Compatibility

On the host, identify the hardware and check for known TPM2 issues:

```bash
# Hardware identification
sudo dmidecode -s system-manufacturer
sudo dmidecode -s system-product-name
sudo dmidecode -s bios-version

# TPM2 chip identification
sudo tpm2_getcap properties-fixed 2>/dev/null | grep -E "TPM2_PT_VENDOR|TPM2_PT_FIRMWARE"

# Check for AMD fTPM (known instability on some Ryzen platforms)
lscpu | grep -i "model name"
ls /sys/class/tpm/
```

**Record results**:
- Manufacturer: ___
- Model: ___
- BIOS version: ___
- TPM2 vendor/firmware: ___
- Known issues found: ___

**Known problematic configurations** (ESCALATE if matched):
- AMD Ryzen fTPM before BIOS 2.x on ASUS B550/X570 — PCR volatility causing unlock failures after BIOS update
- Dell systems with Discrete TPM 1.2 (not TPM 2.0) — TPM2 enrollment will fail silently
- Some Lenovo ThinkPad models: TPM PCR7 changes on Secure Boot key updates — coordinate Secure Boot changes with TPM2 enrollment

### Step 1.2 — Initramfs Contents Verification

```bash
# List initramfs contents and filter for TPM2 and cryptsetup modules
lsinitramfs /boot/initrd.img-$(uname -r) | grep -E "tpm|cryptsetup|systemd-cryptenroll" | sort
```

**Required entries** (all must be present — STOP if any are missing):
- [ ] `tpm2_tis` or `tpm2_tis_core`
- [ ] `tpm_crb`
- [ ] `cryptsetup` binary or library
- [ ] `systemd-cryptenroll` binary

If any required entry is missing, update the initramfs configuration before proceeding:

```bash
# Debian/Ubuntu: add tpm2 modules to initramfs
echo "tpm2_tis" | sudo tee -a /etc/initramfs-tools/modules
echo "tpm2_tis_core" | sudo tee -a /etc/initramfs-tools/modules
echo "tpm_crb" | sudo tee -a /etc/initramfs-tools/modules

# Rebuild initramfs
sudo update-initramfs -u -k $(uname -r)

# Verify again
lsinitramfs /boot/initrd.img-$(uname -r) | grep -E "tpm|cryptsetup|systemd-cryptenroll"
```

### Step 1.3 — Passphrase Slot 0 Integrity Confirmation

```bash
# Dump LUKS header and verify slot 0 is ENABLED
sudo cryptsetup luksDump /dev/{device}
```

**Expected output** (must match before proceeding):
```
Keyslots:
 0: luks2
    Key:        512 bits
    Priority:   normal
    Cipher:     aes-xts-plain64
    ...
```

**Slot 0 must show**:
- [ ] Slot 0 is listed (ENABLED)
- [ ] No error reading the LUKS header

If slot 0 is not present or the header is corrupt: **STOP, escalate immediately**.

### Step 1.4 — Live USB Availability Confirmation

- [ ] Live USB medium is physically available to the operator: ___
- [ ] Live USB was last tested on hardware model `{model}` on: {YYYY-MM-DD}
- [ ] Live USB version/distro: ___
- [ ] Operator knows the procedure to open LUKS volume from live environment: [ ] yes

If live USB has not been tested on this hardware model: **STOP, test the live USB before proceeding**.

### Step 1.5 — Recovery Procedure Documented in Issue

Verify that the following recovery procedure is written to {issue-url} before proceeding:

```
Recovery procedure for {hostname} LUKS enrollment:
1. Boot from live USB ({distro} {version})
2. Identify the LUKS device: lsblk
3. Open with passphrase: sudo cryptsetup luksOpen /dev/{device} recovery-vol
4. Mount: sudo mount /dev/mapper/recovery-vol /mnt
5. If TPM2 slot needs removal: sudo cryptsetup luksDump /dev/{device} (find TPM2 slot number)
6. Remove failed TPM2 slot: sudo systemd-cryptenroll --wipe-slot={N} /dev/{device}
7. Verify slot 0 still active: sudo cryptsetup luksDump /dev/{device}
```

- [ ] Recovery procedure written to {issue-url}: [ ] yes

**DO NOT proceed to Phase 2 until all Phase 1 checks are complete and recorded.**

---

## Phase 2 — Enrollment

Begin Phase 2 only after all Phase 1 checks pass.

### Step 2.1 — Enroll TPM2 Key

```bash
# Enroll TPM2 with PCR binding (PCR0=firmware, PCR7=Secure Boot state)
# You will be prompted for the existing passphrase to authorize the new keyslot
sudo systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=0+7 /dev/{device}
```

**Expected**: Command prompts for existing passphrase, then reports successful enrollment.

If the command fails: do not retry. Record the error and escalate.

### Step 2.2 — Verify TPM2 Keyslot in LUKS Header

```bash
# Confirm TPM2 keyslot appears in the LUKS header
sudo cryptsetup luksDump /dev/{device}
```

**Expected**: A new keyslot entry showing `tpm2` token type.

- [ ] TPM2 keyslot is present in `luksDump` output

### Step 2.3 — Test Reboot with TPM2 Unlock

Reboot the host. The system should unlock automatically without prompting for a passphrase.

```bash
sudo reboot
```

Reconnect after reboot and confirm the system came up. If the system prompts for a passphrase during boot:
- This is expected on first boot with some firmware
- If it prompts on the second reboot: the TPM2 enrollment may have failed. Escalate.

- [ ] System rebooted successfully and is accessible via SSH

### Step 2.4 — Verify Passphrase Slot 0 Intact After Reboot

```bash
# Confirm slot 0 is still ENABLED after reboot and enrollment
sudo cryptsetup luksDump /dev/{device} | grep -A5 "Keyslots"
```

- [ ] Slot 0 shows as ENABLED
- [ ] No unexpected keyslot changes

### Step 2.5 — Update Host Documentation

Update the host profile or system-spec document to reflect TPM2 enrollment:

```yaml
encryption:
  luks:
    device: /dev/{device}
    slots:
      0: passphrase   # permanent fallback — DO NOT REMOVE
      1: tpm2         # enrolled {YYYY-MM-DD} by {operator}
    tpm2_pcrs: "0+7"
    tpm2_enrolled_date: "{YYYY-MM-DD}"
```

---

## Verification

After completing both phases:

- [ ] `cryptsetup luksDump` shows both slot 0 (passphrase) and TPM2 keyslot
- [ ] System boots without passphrase prompt (TPM2 auto-unlock working)
- [ ] Passphrase slot 0 confirmed present and functional
- [ ] Host documentation updated
- [ ] Issue {issue-url} updated with completion status

---

## Rollback

If the TPM2 enrollment must be undone (e.g., TPM2 unlock fails, hardware replacement planned):

```bash
# Find the TPM2 keyslot number from luksDump output (look for the tpm2 token)
sudo cryptsetup luksDump /dev/{device}

# Remove the TPM2 keyslot (replace N with the slot number — NOT slot 0)
# You will be prompted for the passphrase to authorize removal
sudo systemd-cryptenroll --wipe-slot={N} /dev/{device}

# Verify slot 0 is still present
sudo cryptsetup luksDump /dev/{device} | grep -A2 "Keyslot 0"
```

---

## Agent Rules

**DO**:
- Complete ALL Phase 1 checks and record results before issuing any Phase 2 commands
- Stop immediately if any Phase 1 check fails
- Present each step to the operator for confirmation before executing
- Flag any unexpected output for operator review

**DO NOT**:
- Remove passphrase slot 0 under any circumstances
- Retry a failed `systemd-cryptenroll` without escalating first
- Proceed to Phase 2 if live USB availability cannot be confirmed
- Automate Phase 2 steps without operator confirmation at each step

**ESCALATE IF**:
- Any Phase 1 check fails for any reason
- Hardware model matches any known-problematic configuration
- Initramfs is missing required TPM2 modules
- Slot 0 is not ENABLED before enrollment begins
- `systemd-cryptenroll` returns any error
- System does not come up after the test reboot
