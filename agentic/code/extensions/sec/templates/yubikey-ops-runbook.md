# YubiKey / YubiHSM Operations Runbook

**Device Type**: {YubiKey 5 Series | YubiHSM 2 | Nitrokey}
**Operator**: {operator}
**Last Updated**: {YYYY-MM-DD}
**Inventory Record**: {path/to/yubikey-inventory.yaml}

---

## Purpose

Standard operating procedures for YubiKey and YubiHSM device management: initial setup, certificate loading, PIN management, attestation, audit, and decommissioning. All operations involving key material follow the `sec-key-material-handling` rule.

---

## Prerequisites

- `ykman` (YubiKey Manager CLI) installed: `ykman --version`
- `openssl` with PKCS#11 support: `openssl version`
- `yubico-piv-tool` installed for PIV operations: `yubico-piv-tool --version`
- For YubiHSM: `yubihsm-shell` and `yubihsm-connector` running
- Device serial number recorded in inventory before any operation

---

## Procedure 1 — Initial Device Setup

**Trigger**: New YubiKey or YubiHSM received and ready for provisioning.

### Step 1.1 — Record Device Identity

Before any configuration, record the device's factory identity:

```bash
# YubiKey: record serial number and firmware version
ykman info

# YubiHSM: record serial number
yubihsm-shell -p password -a get-device-info
```

Record in the inventory:
- Serial number: ___
- Firmware version: ___
- Form factor: ___
- Assigned to: ___
- Purpose: ___

### Step 1.2 — PIV Application Setup (YubiKey)

The PIV (Personal Identity Verification) application is used for certificate-based authentication and signing.

```bash
# Reset PIV application to factory state (WARNING: destroys all existing PIV credentials)
# Only run on a new device or when intentionally wiping
ykman piv reset
```

**Set the PIN** (present this command to the operator — requires interactive input):

```bash
# Change PIN from factory default (123456) to a strong PIN
# Operator will be prompted interactively
ykman piv access change-pin
```

**Set the PUK** (PIN Unblocking Key — used to reset a blocked PIN):

```bash
# Change PUK from factory default (12345678) to a strong PUK
ykman piv access change-puk
```

**Set the Management Key** (used to authorize certificate slot operations):

```bash
# Generate a random management key and protect it with the PIN
ykman piv access change-management-key --protect --generate
```

Store the PIN and PUK in the authorized credential store. The management key is protected by the PIN and stored on the device.

### Step 1.3 — Generate Key on Device

Keys for production use are generated on the YubiKey, never imported. The private key never leaves the device.

```bash
# Generate a key pair in PIV slot 9a (Authentication)
# Valid slots: 9a (Authentication), 9c (Digital Signature), 9d (Key Management), 9e (Card Authentication)
ykman piv keys generate \
  --algorithm ECCP384 \
  --pin-policy once \
  --touch-policy always \
  9a {slot-9a-public-key.pem}

# Display the generated public key
cat {slot-9a-public-key.pem}
```

**Pin and touch policy guidance**:
- `--pin-policy once` = PIN required once per session
- `--pin-policy always` = PIN required for every operation (highest security)
- `--touch-policy always` = Physical touch required for every operation (recommended for CA keys)
- `--touch-policy cached` = Touch required, cached for 15 seconds

### Step 1.4 — Configure OTP and FIDO Applications (if needed)

```bash
# List configured applications
ykman info

# For FIDO2/WebAuthn: typically no configuration needed (enabled by default)
# Set FIDO2 PIN for additional security
ykman fido access change-pin

# Disable unused applications to reduce attack surface
ykman config usb --disable OTP    # if OTP not needed
```

---

## Procedure 2 — Certificate Loading

**Trigger**: CA has signed a certificate for a key generated on the YubiKey (see CA Operations Runbook), and the certificate must be loaded onto the device.

### Step 2.1 — Obtain CA-Signed Certificate

The public key from the YubiKey slot (generated in Procedure 1, Step 1.3) was submitted to the CA as a CSR. The CA returns a signed certificate. Verify the certificate before loading:

```bash
# Verify the certificate chains to the trusted CA
openssl verify -CAfile {ca-chain.pem} {signed-cert.pem}

# Verify the certificate subject and SANs
openssl x509 -in {signed-cert.pem} -noout -text | grep -A10 "Subject:"

# Verify the public key in the certificate matches the YubiKey slot's public key
# Compare public key fingerprints
openssl x509 -in {signed-cert.pem} -pubkey -noout | openssl pkey -pubin -outform der | sha256sum
cat {slot-9a-public-key.pem} | openssl pkey -pubin -outform der | sha256sum
# Both hashes must match
```

- [ ] Certificate chains to trusted CA
- [ ] Certificate subject and purpose are correct
- [ ] Public key fingerprint matches the YubiKey slot's public key

### Step 2.2 — Load Certificate onto YubiKey

```bash
# Load the signed certificate into the PIV slot
# Management key is prompted interactively
ykman piv certificates import 9a {signed-cert.pem}
```

### Step 2.3 — Verify Loaded Certificate

```bash
# Display the certificate now stored in the PIV slot
ykman piv certificates export 9a - | openssl x509 -noout -text | grep -E "Subject:|Not After|Issuer:"

# Test signing with the loaded certificate (touch required if touch-policy=always)
echo "test" | openssl dgst -sha384 -engine pkcs11 -keyform engine \
  -sign "pkcs11:manufacturer=piv_II;id=%01" -out /tmp/sig.bin
```

---

## Procedure 3 — PIN Management

### Step 3.1 — Change PIN

Present to operator for interactive execution:

```bash
# Change PIN (current PIN required)
ykman piv access change-pin
```

### Step 3.2 — Unblock Blocked PIN (PUK Recovery)

The PIN is blocked after 3 consecutive incorrect entries. Use the PUK to unblock:

```bash
# Unblock PIN using PUK — operator enters both PUK and new PIN interactively
ykman piv access unblock-pin
```

If the PUK is also blocked (3 incorrect PUK entries), the PIV application must be reset:

```bash
# DESTRUCTIVE: Resets all PIV credentials including keys and certificates
# Only proceed after exhausting all PUK recovery options
ykman piv reset
```

After a PIV reset, all keys and certificates must be re-provisioned following Procedures 1 and 2.

### Step 3.3 — Force PIN Reset (Administrative)

When an operator forgets their PIN but the PUK is available in the credential store:

1. Retrieve PUK from authorized credential store (requires approver sign-off)
2. Run `ykman piv access unblock-pin` with the PUK
3. Set a new PIN chosen by the operator
4. Update the credential store if the PUK was changed

---

## Procedure 4 — Audit and Attestation

**Trigger**: Compliance audit, quarterly review, or security verification.

### Step 4.1 — Verify Key Attestation

YubiKey supports hardware attestation — verifiable proof that a key was generated on the device and has never been exported.

```bash
# Generate attestation certificate for a slot
ykman piv keys attest 9a {slot-9a-attestation.pem}

# Verify the attestation certificate chains to Yubico's root CA
# Download Yubico's PIV CA: https://developers.yubico.com/PIV/Introduction/piv-attestation-ca.pem
openssl verify -CAfile yubico-piv-root-ca.pem {slot-9a-attestation.pem}

# Read attestation details (key type, policy, device serial, firmware version)
openssl x509 -in {slot-9a-attestation.pem} -noout -text
```

- [ ] Attestation certificate chains to Yubico root CA
- [ ] Key type and algorithm match provisioning records
- [ ] Device serial matches inventory record
- [ ] Policy extensions show expected pin-policy and touch-policy values

### Step 4.2 — Check Certificate Expiry on Device

```bash
# Check all PIV slots for loaded certificates and their expiry
for slot in 9a 9c 9d 9e; do
  echo "=== Slot $slot ==="
  ykman piv certificates export $slot - 2>/dev/null \
    | openssl x509 -noout -dates -subject 2>/dev/null \
    || echo "No certificate in slot $slot"
done
```

Flag any certificate expiring within 30 days for renewal per `sec-cert-expiry-gates`.

### Step 4.3 — Verify Certificate Chain on Device

```bash
# Export certificate and verify against current fleet CA bundle
ykman piv certificates export 9a {current-cert.pem}
openssl verify -CAfile {ca-chain.pem} {current-cert.pem}
```

Record attestation results in `.aiwg/security/yubikey-audit-{YYYY-MM-DD}.md`.

---

## Procedure 5 — Decommissioning

**Trigger**: Operator departure, device loss, or device end-of-life.

### Step 5.1 — Revoke All Certificates on Device

Before wiping the device, revoke all certificates loaded on it following the CA Operations Runbook (Procedure 3 — Revoke Certificate). This ensures the revoked certificates appear in CRLs and OCSP responses before the keys are destroyed.

- [ ] All PIV slot certificates revoked with appropriate revocation reason

### Step 5.2 — Remove from Authorized Access Lists

- Remove operator's SSH public key from all `authorized_keys` files
- Revoke any SSH certificates issued to this operator (see SSH CA Runbook Procedure 4)
- Remove operator from all IdP groups and FIDO2 credentials
- Run `sec-access-snapshot` to verify removal

### Step 5.3 — Wipe the Device

```bash
# Reset all YubiKey applications to factory state
ykman piv reset
ykman fido reset
ykman oath reset    # if OATH (TOTP) was configured
ykman openpgp reset # if OpenPGP was configured
```

Verify the device is in factory state:

```bash
ykman info
ykman piv info  # should show default PINs and empty slots
```

### Step 5.4 — Update Inventory

Mark the device as decommissioned in the inventory:
- Status: decommissioned
- Decommission date: {YYYY-MM-DD}
- Decommissioned by: {operator}
- Reason: {departure|loss|end-of-life}
- Disposition: {returned-to-inventory|destroyed|reported-lost}

If the device was lost or stolen, record as a security incident.
