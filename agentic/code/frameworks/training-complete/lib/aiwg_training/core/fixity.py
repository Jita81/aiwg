"""SHA-256 fixity manifests for dataset versions.

Produces OAIS-compliant fixity manifests (self-verifying headers, deterministic
output, null-terminated filenames where applicable). Reused by
``dataset-version`` and ``integrity-verification`` skills.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class FixityEntry:
    sha256: str
    size_bytes: int
    path: str  # relative to manifest root


def sha256_file(path: Path | str, chunk_size: int = 65536) -> str:
    """Compute SHA-256 of a file (streaming — safe for large files)."""
    h = hashlib.sha256()
    p = Path(path)
    with p.open("rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()


def scan_directory(root: Path | str, relative_to: Path | str | None = None) -> list[FixityEntry]:
    """Recursively hash all regular files under root.

    ``relative_to`` sets the path prefix in manifest entries (default: root itself).
    Results are sorted by path for deterministic output.
    """
    root_p = Path(root).resolve()
    rel_p = Path(relative_to).resolve() if relative_to else root_p
    entries: list[FixityEntry] = []
    for p in sorted(root_p.rglob("*")):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            # Skip dotfiles (manifest, checksums themselves)
            continue
        entries.append(
            FixityEntry(
                sha256=sha256_file(p),
                size_bytes=p.stat().st_size,
                path=str(p.relative_to(rel_p)),
            )
        )
    return entries


def write_manifest(
    entries: list[FixityEntry],
    output: Path | str,
    *,
    title: str | None = None,
) -> Path:
    """Write a self-verifying SHA-256 manifest.

    Format (sha256sum-compatible):

        # AIWG Training Fixity Manifest
        # Generated: 2026-04-15T02:00:00Z
        # Entries: 42
        <sha256>  <path>
        ...

    Can be verified with ``sha256sum -c <manifest>``.
    """
    p = Path(output)
    p.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"# AIWG Training Fixity Manifest",
    ]
    if title:
        lines.append(f"# {title}")
    lines.extend([
        f"# Generated: {datetime.now(timezone.utc).isoformat()}",
        f"# Entries: {len(entries)}",
        "",
    ])
    for e in entries:
        # sha256sum format is "<hash>  <path>" (two spaces for binary mode)
        lines.append(f"{e.sha256}  {e.path}")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return p


def verify_manifest(manifest_path: Path | str, root: Path | str | None = None) -> tuple[int, int, list[str]]:
    """Verify a fixity manifest. Returns ``(verified, failed, failure_paths)``."""
    mp = Path(manifest_path)
    base = Path(root).resolve() if root else mp.parent.resolve()
    verified = 0
    failed = 0
    failures: list[str] = []
    for line in mp.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Parse "<hash>  <path>"
        parts = line.split("  ", 1)
        if len(parts) != 2:
            continue
        expected, rel_path = parts
        target = base / rel_path
        if not target.exists():
            failed += 1
            failures.append(f"{rel_path}: MISSING")
            continue
        actual = sha256_file(target)
        if actual != expected:
            failed += 1
            failures.append(f"{rel_path}: HASH_MISMATCH (expected {expected[:16]}..., got {actual[:16]}...)")
        else:
            verified += 1
    return verified, failed, failures


def manifest_self_hash(manifest_path: Path | str) -> str:
    """Compute SHA-256 of the manifest itself (for cross-reference in dataset manifest)."""
    return sha256_file(manifest_path)
