"""Source acquisition for the training-complete framework.

Implements the `acquire-training-source` skill: turns a source URI
(``file:``, ``https:``, ``git:``, or ``ref:``) into a staged raw directory
with fixity manifest, source-level metadata (``source.yaml``), and a
W3C PROV record.

Phase 2 concerns only *acquisition* — conversion into ``CanonicalRecord``
instances is handled by :mod:`aiwg_training.ingest.convert`, and
LLM-driven extraction is Phase 3 (``example-synthesizer``).
"""

from __future__ import annotations

import json
import shutil
import socket
import subprocess
import urllib.error
import urllib.request
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from aiwg_training.core import (
    ProvRecord,
    now_iso,
    scan_directory,
    sha256_file,
    write_manifest as write_fixity,
)

__all__ = [
    "AcquisitionResult",
    "LicenseRequiredError",
    "SourceAcquirer",
    "detect_format",
]


# Known code / docs / papers extensions used by :func:`detect_format`.
_CODE_EXTS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".c",
    ".h", ".cc", ".cpp", ".hpp", ".cs", ".rb", ".php", ".swift", ".kt",
    ".scala", ".sh", ".bash", ".zsh", ".pl", ".lua", ".r", ".m",
}
_DOC_EXTS = {".md", ".markdown", ".txt", ".rst", ".adoc", ".asciidoc"}
_PAPER_EXTS = {".pdf"}
_DIALOGUE_EXTS = {".json", ".jsonl"}


class LicenseRequiredError(ValueError):
    """Raised when a source is acquired without a license and without --allow-unlicensed."""


@dataclass
class AcquisitionResult:
    """Summary returned by every handler on :class:`SourceAcquirer`."""

    source_id: str
    source_type: str  # "filesystem" | "url" | "git" | "ref"
    raw_dir: Path
    license: str
    format_detected: str
    file_count: int
    total_bytes: int
    fixity_manifest_path: Path
    provenance_id: str

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["raw_dir"] = str(self.raw_dir)
        d["fixity_manifest_path"] = str(self.fixity_manifest_path)
        return d


def detect_format(raw_dir: Path) -> str:
    """Classify a raw directory into one of the canonical format buckets.

    Buckets: ``code``, ``docs``, ``papers``, ``dialogues``, ``mixed``.

    Heuristic: walk the tree, tally recognised extensions, and pick the
    dominant bucket (>60% of recognised files). Anything below that
    threshold — or with multiple competing buckets — is ``mixed``.
    """
    counts = {"code": 0, "docs": 0, "papers": 0, "dialogues": 0}
    total = 0
    raw_dir = Path(raw_dir)
    for p in raw_dir.rglob("*"):
        if not p.is_file() or p.name.startswith("."):
            continue
        ext = p.suffix.lower()
        if ext in _CODE_EXTS:
            counts["code"] += 1
            total += 1
        elif ext in _DOC_EXTS:
            counts["docs"] += 1
            total += 1
        elif ext in _PAPER_EXTS:
            counts["papers"] += 1
            total += 1
        elif ext in _DIALOGUE_EXTS:
            # Peek at JSON/JSONL to decide between dialogues and 'mixed'.
            if _looks_like_dialogue(p):
                counts["dialogues"] += 1
            else:
                # Non-dialogue JSON: treat as docs (structured text).
                counts["docs"] += 1
            total += 1
    if total == 0:
        return "mixed"
    dominant = max(counts, key=lambda k: counts[k])
    if counts[dominant] / total >= 0.6:
        return dominant
    return "mixed"


def _looks_like_dialogue(path: Path) -> bool:
    """Return True when the JSON/JSONL file carries a conversation shape."""
    try:
        with path.open("r", encoding="utf-8") as f:
            # Read just the first non-empty line — enough to disambiguate.
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    # Try to parse the full file as a JSON document instead.
                    f.seek(0)
                    obj = json.load(f)
                if isinstance(obj, dict):
                    if "messages" in obj or "conversations" in obj:
                        return True
                    # Canonical records are not "dialogues" per se.
                    return False
                if isinstance(obj, list) and obj and isinstance(obj[0], dict):
                    first = obj[0]
                    return "messages" in first or "conversations" in first or "role" in first
                return False
    except (OSError, ValueError):
        return False
    return False


class SourceAcquirer:
    """Acquire training sources into ``<workspace>/raw/<source-id>/``.

    Each handler stages files, generates a SHA-256 fixity manifest, writes
    a ``source.yaml`` metadata document, and produces a W3C PROV record
    describing the acquisition.

    Parameters
    ----------
    workspace:
        Root directory where ``raw/`` and ``provenance/`` live. Defaults
        to ``.aiwg/training/`` relative to the current working directory.
    research_root:
        Directory searched when resolving ``ref:REF-XXX`` sources.
        Defaults to ``.aiwg/research/``.
    actor:
        Label recorded as the acquiring agent in provenance and metadata.
    """

    def __init__(
        self,
        workspace: Path | str = ".aiwg/training",
        research_root: Path | str = ".aiwg/research",
        actor: str = "aiwg-training",
    ) -> None:
        self.workspace = Path(workspace)
        self.research_root = Path(research_root)
        self.actor = actor

    # ---- Public dispatcher ----

    def acquire(
        self,
        source_uri: str,
        license: str | None = None,
        format_hint: str | None = None,
        allow_unlicensed: bool = False,
    ) -> AcquisitionResult:
        """Parse ``source_uri`` and dispatch to the right handler."""
        if source_uri.startswith("file:"):
            path = Path(source_uri[len("file:"):])
            self._check_license(license, allow_unlicensed)
            return self.acquire_filesystem(
                path,
                license=license or "unknown",
                format_hint=format_hint,
            )
        if source_uri.startswith(("http://", "https://")):
            self._check_license(license, allow_unlicensed)
            return self.acquire_url(
                source_uri,
                license=license or "unknown",
                format_hint=format_hint,
            )
        if source_uri.startswith("git:"):
            self._check_license(license, allow_unlicensed)
            return self.acquire_git(
                source_uri[len("git:"):],
                license=license or "unknown",
                format_hint=format_hint,
            )
        if source_uri.startswith("ref:"):
            # ref: inherits license from REF metadata; the gate is deferred
            # to :meth:`acquire_ref` so it can fall through to the REF's
            # declared license.
            return self.acquire_ref(
                source_uri[len("ref:"):],
                license=license,
                format_hint=format_hint,
            )
        raise ValueError(
            f"Unsupported source URI scheme: {source_uri!r}. "
            "Expected one of file:, http(s):, git:, ref:"
        )

    # ---- Handlers ----

    def acquire_filesystem(
        self,
        path: Path,
        license: str,
        format_hint: str | None,
    ) -> AcquisitionResult:
        """Copy a local file or directory into ``raw/<source-id>/``."""
        src = Path(path).expanduser().resolve()
        if not src.exists():
            raise FileNotFoundError(f"filesystem source does not exist: {src}")

        source_id = _mint_source_id("fs", src.name)
        raw_dir = self._prepare_raw_dir(source_id)

        if src.is_file():
            shutil.copy2(src, raw_dir / src.name)
        else:
            # dirs_exist_ok so the freshly-created raw_dir is acceptable.
            shutil.copytree(src, raw_dir, dirs_exist_ok=True)

        return self._finalize(
            source_id=source_id,
            source_type="filesystem",
            raw_dir=raw_dir,
            license=license,
            format_hint=format_hint,
            origin=str(src),
        )

    def acquire_url(
        self,
        url: str,
        license: str,
        format_hint: str | None,
    ) -> AcquisitionResult:
        """Download ``url`` with the stdlib — avoids a hard `requests` dep."""
        source_id = _mint_source_id("url", _url_filename(url))
        raw_dir = self._prepare_raw_dir(source_id)

        filename = _url_filename(url) or "download.bin"
        target = raw_dir / filename
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "aiwg-training/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp, target.open("wb") as f:  # noqa: S310
                shutil.copyfileobj(resp, f)
        except (urllib.error.URLError, socket.timeout) as exc:
            raise RuntimeError(f"failed to download {url}: {exc}") from exc

        return self._finalize(
            source_id=source_id,
            source_type="url",
            raw_dir=raw_dir,
            license=license,
            format_hint=format_hint,
            origin=url,
        )

    def acquire_git(
        self,
        repo_url: str,
        license: str,
        format_hint: str | None,
        branch: str | None = None,
    ) -> AcquisitionResult:
        """Shallow-clone ``repo_url`` via subprocess to ``git``."""
        source_id = _mint_source_id("git", _git_repo_name(repo_url))
        raw_dir = self._prepare_raw_dir(source_id)

        cmd = ["git", "clone", "--depth", "1"]
        if branch:
            cmd.extend(["--branch", branch])
        cmd.extend([repo_url, str(raw_dir)])
        try:
            subprocess.run(  # noqa: S603
                cmd,
                check=True,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(
                f"git clone failed for {repo_url}: {exc.stderr.strip() or exc}"
            ) from exc
        except FileNotFoundError as exc:
            raise RuntimeError("git executable not found on PATH") from exc

        # Remove the .git directory — we don't need history for fixity, and
        # scan_directory already skips dotfiles but not dot-directories.
        git_dir = raw_dir / ".git"
        if git_dir.exists():
            shutil.rmtree(git_dir, ignore_errors=True)

        return self._finalize(
            source_id=source_id,
            source_type="git",
            raw_dir=raw_dir,
            license=license,
            format_hint=format_hint,
            origin=repo_url,
            extra_metadata={"branch": branch} if branch else None,
        )

    def acquire_ref(
        self,
        ref_id: str,
        license: str | None,
        format_hint: str | None,
    ) -> AcquisitionResult:
        """Reuse an existing research REF as a training source.

        Looks up ``<research_root>/<ref_id>/`` (or ``<research_root>/REF-*/``
        matching ``ref_id``). License is inherited from the REF's metadata
        file when ``license`` is not explicitly provided.
        """
        ref_dir = self._resolve_ref(ref_id)
        inherited, license_source = self._load_ref_license(ref_dir)
        effective_license = license or inherited
        if not effective_license:
            raise LicenseRequiredError(
                f"ref:{ref_id} has no declared license and none was provided; "
                "pass --license <SPDX> or set license in the REF metadata"
            )

        source_id = _mint_source_id("ref", ref_id)
        raw_dir = self._prepare_raw_dir(source_id)
        shutil.copytree(ref_dir, raw_dir, dirs_exist_ok=True)

        return self._finalize(
            source_id=source_id,
            source_type="ref",
            raw_dir=raw_dir,
            license=effective_license,
            format_hint=format_hint,
            origin=f"ref:{ref_id}",
            extra_metadata={
                "ref_id": ref_id,
                "license_source": "inherited" if not license else "declared",
                "license_inherited_from": license_source,
            },
        )

    # ---- Internal helpers ----

    @staticmethod
    def _check_license(license: str | None, allow_unlicensed: bool) -> None:
        if license is None and not allow_unlicensed:
            raise LicenseRequiredError(
                "No license provided. Pass --license <SPDX> or --allow-unlicensed "
                "(sources without a license tag are blocked at publication time)."
            )

    def _prepare_raw_dir(self, source_id: str) -> Path:
        raw_dir = self.workspace / "raw" / source_id
        raw_dir.mkdir(parents=True, exist_ok=True)
        return raw_dir

    def _resolve_ref(self, ref_id: str) -> Path:
        # Accept both "REF-375" and "375" forms.
        candidates = [ref_id]
        if not ref_id.upper().startswith("REF-"):
            candidates.append(f"REF-{ref_id}")
        for candidate in candidates:
            candidate_path = self.research_root / candidate
            if candidate_path.is_dir():
                return candidate_path
        # Fall back to prefix match (e.g. "REF-375-foo").
        if self.research_root.is_dir():
            for child in self.research_root.iterdir():
                if child.is_dir() and any(child.name.startswith(c) for c in candidates):
                    return child
        raise FileNotFoundError(
            f"ref:{ref_id} not found under {self.research_root}"
        )

    @staticmethod
    def _load_ref_license(ref_dir: Path) -> tuple[str | None, str | None]:
        """Return ``(license, source_file)`` from a REF's metadata.

        Looks for ``metadata.yaml`` / ``metadata.yml`` / ``source.yaml``.
        Returns ``(None, None)`` when no license is declared.
        """
        for name in ("metadata.yaml", "metadata.yml", "source.yaml"):
            meta_path = ref_dir / name
            if meta_path.is_file():
                try:
                    data = yaml.safe_load(meta_path.read_text(encoding="utf-8")) or {}
                except yaml.YAMLError:
                    continue
                lic = data.get("license")
                if isinstance(lic, str) and lic:
                    return lic, name
        return None, None

    def _finalize(
        self,
        *,
        source_id: str,
        source_type: str,
        raw_dir: Path,
        license: str,
        format_hint: str | None,
        origin: str,
        extra_metadata: dict[str, Any] | None = None,
    ) -> AcquisitionResult:
        """Generate fixity + metadata + provenance; return the result."""
        format_detected = format_hint or detect_format(raw_dir)

        entries = scan_directory(raw_dir)
        total_bytes = sum(e.size_bytes for e in entries)

        fixity_path = raw_dir / "fixity.sha256"
        write_fixity(entries, fixity_path, title=f"source={source_id}")
        fixity_sha = sha256_file(fixity_path)

        prov = ProvRecord()
        source_entity = prov.add_entity(
            type="aiwg:Source",
            label=source_id,
            source_type=source_type,
            origin=origin,
            license=license,
        )
        activity = prov.add_activity(
            type="aiwg:Acquisition",
            agent=self.actor,
            generated=[source_entity],
        )
        prov.finalize_activity(activity)
        prov_path = self.workspace / "provenance" / f"{source_id}.jsonld"
        prov.save(prov_path)

        source_metadata = {
            "source_id": source_id,
            "source_type": source_type,
            "origin": origin,
            "acquired_at": now_iso(),
            "acquired_by": self.actor,
            "license": license,
            "license_source": "declared" if license != "unknown" else "unknown",
            "format_detected": format_detected,
            "format_hint": format_hint,
            "file_count": len(entries),
            "total_bytes": total_bytes,
            "fixity_manifest": fixity_path.name,
            "fixity_manifest_sha256": fixity_sha,
            "provenance_id": prov.id,
            "provenance_path": str(prov_path),
        }
        if extra_metadata:
            source_metadata.update(extra_metadata)

        (raw_dir / "source.yaml").write_text(
            yaml.safe_dump(source_metadata, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )

        return AcquisitionResult(
            source_id=source_id,
            source_type=source_type,
            raw_dir=raw_dir,
            license=license,
            format_detected=format_detected,
            file_count=len(entries),
            total_bytes=total_bytes,
            fixity_manifest_path=fixity_path,
            provenance_id=prov.id,
        )


# ---- Module-level helpers ----


def _mint_source_id(prefix: str, seed: str) -> str:
    """Mint a short, human-readable source id.

    Format: ``<prefix>-<slug>-<shortuuid>``. The UUID suffix keeps ids
    unique across repeat acquisitions of the same logical source.
    """
    slug = _slugify(seed) or "source"
    suffix = uuid.uuid4().hex[:8]
    return f"{prefix}-{slug}-{suffix}"


def _slugify(text: str) -> str:
    allowed = "abcdefghijklmnopqrstuvwxyz0123456789-"
    lowered = text.lower().replace("_", "-").replace(" ", "-")
    slug = "".join(ch if ch in allowed else "-" for ch in lowered).strip("-")
    # Collapse runs of dashes.
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug[:40]


def _url_filename(url: str) -> str:
    parsed = urlparse(url)
    tail = Path(parsed.path).name
    return tail or parsed.netloc.replace(":", "-")


def _git_repo_name(repo_url: str) -> str:
    tail = repo_url.rstrip("/").rsplit("/", 1)[-1]
    if tail.endswith(".git"):
        tail = tail[:-4]
    return tail or "repo"
