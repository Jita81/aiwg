"""W3C PROV record builders for training-complete.

Produces JSON-LD (PROV-O) compatible with AIWG's existing ``provenance-create``
skill. Per ADR-022 D9, every example and dataset version has a PROV chain
tracing from raw source → derived example → format export → dataset version.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROV_CONTEXT = {
    "@context": {
        "prov": "http://www.w3.org/ns/prov#",
        "aiwg": "https://aiwg.io/ns/",
        "xsd": "http://www.w3.org/2001/XMLSchema#",
    }
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _prov_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}"


@dataclass
class Entity:
    """PROV entity (a thing — source, example, dataset version, etc.)."""

    id: str
    type: str  # aiwg:Source, aiwg:Example, aiwg:DatasetVersion, etc.
    label: str | None = None
    attrs: dict[str, Any] = field(default_factory=dict)

    def to_jsonld(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "@id": self.id,
            "@type": ["prov:Entity", self.type],
        }
        if self.label:
            d["rdfs:label"] = self.label
        for k, v in self.attrs.items():
            d[f"aiwg:{k}"] = v
        return d


@dataclass
class Activity:
    """PROV activity (an operation — acquire, synthesize, convert, publish)."""

    id: str
    type: str  # aiwg:Acquisition, aiwg:Synthesis, aiwg:FormatConvert, etc.
    started_at: str = field(default_factory=now_iso)
    ended_at: str | None = None
    agent: str | None = None
    used: list[str] = field(default_factory=list)  # entity IDs
    generated: list[str] = field(default_factory=list)  # entity IDs

    def to_jsonld(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "@id": self.id,
            "@type": ["prov:Activity", self.type],
            "prov:startedAtTime": {"@value": self.started_at, "@type": "xsd:dateTime"},
        }
        if self.ended_at:
            d["prov:endedAtTime"] = {"@value": self.ended_at, "@type": "xsd:dateTime"}
        if self.agent:
            d["prov:wasAssociatedWith"] = {"@id": self.agent}
        if self.used:
            d["prov:used"] = [{"@id": u} for u in self.used]
        if self.generated:
            d["prov:generated"] = [{"@id": g} for g in self.generated]
        return d


@dataclass
class ProvRecord:
    """A bundle of entities + activities tracing an operation."""

    id: str = field(default_factory=lambda: _prov_id("prov"))
    entities: list[Entity] = field(default_factory=list)
    activities: list[Activity] = field(default_factory=list)

    def add_entity(self, type: str, label: str | None = None, **attrs: Any) -> Entity:
        e = Entity(id=_prov_id("entity"), type=type, label=label, attrs=dict(attrs))
        self.entities.append(e)
        return e

    def add_activity(
        self,
        type: str,
        agent: str | None = None,
        used: list[Entity] | None = None,
        generated: list[Entity] | None = None,
    ) -> Activity:
        a = Activity(
            id=_prov_id("activity"),
            type=type,
            agent=agent,
            used=[e.id for e in (used or [])],
            generated=[e.id for e in (generated or [])],
        )
        self.activities.append(a)
        return a

    def finalize_activity(self, activity: Activity) -> None:
        """Set endedAt on an activity (after the operation completes)."""
        activity.ended_at = now_iso()

    def to_jsonld(self) -> dict[str, Any]:
        graph = [e.to_jsonld() for e in self.entities] + [a.to_jsonld() for a in self.activities]
        return {**PROV_CONTEXT, "@id": self.id, "@graph": graph}

    def save(self, path: Path | str) -> Path:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(self.to_jsonld(), indent=2), encoding="utf-8")
        return p


def load_prov_record(path: Path | str) -> dict[str, Any]:
    """Load a PROV JSON-LD bundle (returns raw dict, not typed)."""
    return json.loads(Path(path).read_text(encoding="utf-8"))
