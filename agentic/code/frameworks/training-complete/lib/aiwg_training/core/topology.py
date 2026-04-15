"""Read and resolve the ``memory.topology`` contract from a consumer manifest.

The topology contract declares namespace, derived page paths, cross-ref style,
ingest requirements, and lint rules. Kernel skills and training-complete
subcommands use this to parameterize behavior per ADR-021 D2/D3/D4.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


@dataclass
class MemoryTopology:
    """Parsed ``memory.topology`` contract for a consumer framework."""

    namespace: str
    raw_sources: str
    derived_pages: dict[str, str] = field(default_factory=dict)
    index: str = ""
    log: str = ""
    cross_ref_style: Literal["at-mention", "wikilink", "markdown-link", "yaml-ref"] = "at-mention"
    page_template: str | None = None
    ingest_requires: list[str] = field(default_factory=list)
    lint_rules: list[str] = field(default_factory=list)

    @property
    def log_path(self) -> Path:
        return Path(self.log)

    @property
    def namespace_path(self) -> Path:
        return Path(self.namespace)

    def derived_path(self, category: str) -> Path:
        """Return the path for a derived-page category (e.g., 'synthesizedExamples')."""
        if category not in self.derived_pages:
            raise KeyError(
                f"Category {category!r} not declared in topology.derived_pages. "
                f"Available: {sorted(self.derived_pages)}"
            )
        return Path(self.derived_pages[category])


def load_manifest(manifest_path: Path | str) -> dict:
    """Load a framework ``manifest.json``."""
    p = Path(manifest_path)
    return json.loads(p.read_text(encoding="utf-8"))


def parse_topology(manifest: dict) -> MemoryTopology:
    """Extract ``memory.topology`` from a parsed manifest."""
    memory = manifest.get("memory", {})
    topology_raw = memory.get("topology")
    if not topology_raw:
        raise ValueError(f"Manifest {manifest.get('id', '<unknown>')} has no memory.topology declaration")

    return MemoryTopology(
        namespace=topology_raw["namespace"],
        raw_sources=topology_raw["rawSources"],
        derived_pages=dict(topology_raw.get("derivedPages", {})),
        index=topology_raw.get("index", ""),
        log=topology_raw.get("log", ""),
        cross_ref_style=topology_raw.get("crossRefStyle", "at-mention"),
        page_template=topology_raw.get("pageTemplate"),
        ingest_requires=list(topology_raw.get("ingestRequires", [])),
        lint_rules=list(topology_raw.get("lintRules", [])),
    )


def load_topology(manifest_path: Path | str) -> MemoryTopology:
    """Convenience: load manifest and extract topology in one call."""
    return parse_topology(load_manifest(manifest_path))


def resolve_consumer(explicit: str | None = None, cwd: Path | None = None) -> tuple[str, MemoryTopology]:
    """Resolve which consumer's topology to use per ADR-021 D4.

    Precedence: explicit > wrapper context (env var) > auto-detect via
    ``.aiwg/frameworks/registry.json``.
    """
    import os

    if explicit:
        return explicit, _load_by_consumer_id(explicit, cwd)

    wrapper = os.environ.get("AIWG_TRAINING_CONSUMER")
    if wrapper:
        return wrapper, _load_by_consumer_id(wrapper, cwd)

    # Auto-detect: look for training-complete in registry
    registry_path = (cwd or Path.cwd()) / ".aiwg" / "frameworks" / "registry.json"
    if registry_path.exists():
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        installed = registry.get("installed", {})
        if "training-complete" in installed:
            return "training-complete", _load_by_consumer_id("training-complete", cwd)

    raise RuntimeError(
        "Cannot resolve consumer. Set --consumer explicitly, AIWG_TRAINING_CONSUMER env, "
        "or install training-complete via `aiwg use training`."
    )


def _load_by_consumer_id(consumer_id: str, cwd: Path | None = None) -> MemoryTopology:
    """Find a framework's manifest.json by consumer ID and load its topology."""
    # Try AIWG framework root (env) or common locations
    import os

    aiwg_root = os.environ.get("AIWG_ROOT")
    candidates: list[Path] = []
    if aiwg_root:
        candidates.append(Path(aiwg_root) / "agentic" / "code" / "frameworks" / consumer_id / "manifest.json")
    base = cwd or Path.cwd()
    candidates.extend([
        base / "agentic" / "code" / "frameworks" / consumer_id / "manifest.json",
        # Walk up looking for the framework
        *[parent / "agentic" / "code" / "frameworks" / consumer_id / "manifest.json" for parent in base.parents],
    ])

    for c in candidates:
        if c.exists():
            return load_topology(c)

    raise FileNotFoundError(f"No manifest.json found for consumer {consumer_id!r}")
