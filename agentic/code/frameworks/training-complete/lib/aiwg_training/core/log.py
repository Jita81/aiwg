"""Shim for writing to the consumer's memory-log (and activity log).

Wraps ``schemas.log_event.append_event`` with topology-aware path resolution
so callers just pass the event and consumer ID.
"""

from __future__ import annotations

from pathlib import Path

from aiwg_training.core.topology import MemoryTopology
from aiwg_training.schemas.log_event import BaseEvent, append_event


def log_to_consumer(event: BaseEvent, topology: MemoryTopology) -> Path:
    """Append an event to the consumer's ``.log.jsonl``."""
    return append_event(event, topology.log)


def log_activity(summary: str, activity_log: Path | str = ".aiwg/activity.log") -> Path:
    """Append a cross-framework timeline entry per the ``activity-log`` rule.

    Format: ``## [YYYY-MM-DD HH:MM] <operation> | <summary>``
    """
    from datetime import datetime, timezone

    p = Path(activity_log)
    p.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    with p.open("a", encoding="utf-8") as f:
        f.write(f"## [{ts}] training | {summary}\n")
    return p
