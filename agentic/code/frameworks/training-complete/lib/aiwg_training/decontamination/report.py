"""Decontamination report generation (#842).

Renders ``templates/decontamination-report.md`` from the per-target results
produced by ``DecontaminationCheck.run()``.

The template uses Handlebars-style tokens (``{{var}}``, ``{{#each}}``,
``{{#if}}``); this module implements a small, focused subset sufficient for
that specific template rather than pulling in a heavyweight templating
dependency.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from aiwg_training.decontamination.ngram import NGramOverlapResult, OverlapSample
from aiwg_training.decontamination.targets import EvalTarget

# Default location of the shipped report template.
DEFAULT_TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "templates"
    / "decontamination-report.md"
)


# ---- Data types ----


@dataclass
class TargetResult:
    """One target's result (combined across detection modes)."""

    target: EvalTarget
    overlap: NGramOverlapResult
    passed: bool

    @property
    def id(self) -> str:
        return self.target.id

    @property
    def top_overlaps(self) -> list[OverlapSample]:
        return self.overlap.sample_overlaps


@dataclass
class DecontaminationReport:
    """Complete decontamination report state."""

    dataset_version: str
    generated_at: str
    mode: str
    ngram_size: int
    target_results: list[TargetResult]
    normalization: str = "lowercase,collapse_whitespace"
    embedding_model: str = ""
    cosine_threshold: float = 0.0
    random_seed: int = 0
    targets_config_hash: str = ""
    dataset_manifest_hash: str = ""

    @property
    def target_count(self) -> int:
        return len(self.target_results)

    @property
    def overall_passed(self) -> bool:
        return all(r.passed for r in self.target_results)

    def to_context(self) -> dict[str, Any]:
        """Build the dict consumed by the template renderer."""
        return {
            "DATASET_VERSION": self.dataset_version,
            "TIMESTAMP": self.generated_at,
            "MODE": self.mode,
            "NGRAM_SIZE": self.ngram_size,
            "TARGET_COUNT": self.target_count,
            "OVERALL_PASSED": self.overall_passed,
            "NORMALIZATION": self.normalization,
            "EMBEDDING_MODEL": self.embedding_model or "n/a",
            "COSINE_THRESHOLD": self.cosine_threshold,
            "RANDOM_SEED": self.random_seed,
            "TARGETS_CONFIG_HASH": self.targets_config_hash or "n/a",
            "DATASET_MANIFEST_HASH": self.dataset_manifest_hash or "n/a",
            "targets": [
                {
                    "id": r.target.id,
                    "name": r.target.name,
                    "source": r.target.source,
                    "eval_set_path": r.target.eval_set_path,
                    "detection_modes": ", ".join(r.target.detection_modes),
                    "ngram_size": r.target.ngram_size,
                    "threshold": r.target.threshold,
                    "examples_scanned": r.overlap.examples_scanned,
                    "overlap_count": r.overlap.overlap_count,
                    "passed": r.passed,
                    "top_overlaps": [
                        {
                            "index": i + 1,
                            "example_id": s.example_id,
                            "target_item_id": s.target_item_id,
                            "excerpt": _sanitize_excerpt(s.excerpt),
                        }
                        for i, s in enumerate(r.top_overlaps)
                    ],
                    "overall_passed": self.overall_passed,
                }
                for r in self.target_results
            ],
            "overall_passed": self.overall_passed,
        }


# ---- Minimal Handlebars-ish renderer ----


def _sanitize_excerpt(s: str) -> str:
    """Escape characters that would break a markdown table cell."""
    return s.replace("|", "\\|").replace("\n", " ").strip()


def _render_scalar(value: Any) -> str:
    if isinstance(value, bool):
        # The template uses {{#if passed}}PASS{{else}}FAIL{{/if}}; when passed
        # is rendered as {{passed}} directly (not inside an if), show a word.
        return "true" if value else "false"
    return str(value)


_EACH_OPEN_RE = re.compile(r"\{\{#each\s+([A-Za-z_][A-Za-z0-9_]*)\}\}")
_EACH_CLOSE = "{{/each}}"
_IF_OPEN_RE = re.compile(r"\{\{#if\s+([A-Za-z_][A-Za-z0-9_]*)\}\}")
_IF_ELSE = "{{else}}"
_IF_CLOSE = "{{/if}}"
_VAR_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


def _find_matching_close(template: str, start: int, open_tag: str, close_tag: str) -> int:
    """Find the position of the matching close tag, accounting for nesting.

    Returns the index of the close tag (i.e., where ``close_tag`` starts).
    Raises ``ValueError`` if no matching close is found.
    """
    depth = 1
    pos = start
    while pos < len(template):
        next_open = template.find(open_tag, pos) if open_tag else -1
        next_close = template.find(close_tag, pos)
        if next_close == -1:
            raise ValueError(f"Unmatched {open_tag!r} — no {close_tag!r} found")
        if next_open != -1 and next_open < next_close:
            depth += 1
            pos = next_open + len(open_tag)
        else:
            depth -= 1
            if depth == 0:
                return next_close
            pos = next_close + len(close_tag)
    raise ValueError(f"Unmatched {open_tag!r} — depth never reached zero")


def _find_each_close(template: str, start: int) -> int:
    """Find matching {{/each}} for an {{#each X}} that opened just before ``start``."""
    depth = 1
    pos = start
    while pos < len(template):
        # Find next opener-or-closer for #each
        next_open_match = _EACH_OPEN_RE.search(template, pos)
        next_close = template.find(_EACH_CLOSE, pos)
        next_open = next_open_match.start() if next_open_match else -1
        if next_close == -1:
            raise ValueError("Unmatched {{#each}}")
        if next_open != -1 and next_open < next_close:
            depth += 1
            pos = next_open_match.end()  # type: ignore[union-attr]
        else:
            depth -= 1
            if depth == 0:
                return next_close
            pos = next_close + len(_EACH_CLOSE)
    raise ValueError("Unmatched {{#each}}")


def _find_if_close_and_else(template: str, start: int) -> tuple[int, int | None]:
    """Find matching {{/if}} for an {{#if X}}, plus the position of {{else}} if any.

    Only considers the {{else}} at the top nesting level (skips elses inside nested ifs).
    Returns ``(close_pos, else_pos_or_None)``.
    """
    depth = 1
    pos = start
    else_pos: int | None = None
    while pos < len(template):
        next_open_match = _IF_OPEN_RE.search(template, pos)
        next_close = template.find(_IF_CLOSE, pos)
        next_else = template.find(_IF_ELSE, pos)
        next_open = next_open_match.start() if next_open_match else -1

        if next_close == -1:
            raise ValueError("Unmatched {{#if}}")

        # Find the earliest among open/else/close
        candidates: list[tuple[int, str]] = []
        if next_open != -1:
            candidates.append((next_open, "open"))
        if next_else != -1:
            candidates.append((next_else, "else"))
        candidates.append((next_close, "close"))
        candidates.sort(key=lambda x: x[0])
        first_pos, kind = candidates[0]

        if kind == "open":
            depth += 1
            pos = next_open_match.end()  # type: ignore[union-attr]
        elif kind == "else":
            if depth == 1 and else_pos is None:
                else_pos = first_pos
            pos = first_pos + len(_IF_ELSE)
        else:  # close
            depth -= 1
            if depth == 0:
                return next_close, else_pos
            pos = next_close + len(_IF_CLOSE)
    raise ValueError("Unmatched {{#if}}")


def _render_block(template: str, ctx: dict[str, Any]) -> str:
    """Render a block of template text against ``ctx`` with proper nesting."""
    # Process #each blocks first (outermost-first via stack-based scan).
    out: list[str] = []
    pos = 0
    while pos < len(template):
        each_m = _EACH_OPEN_RE.search(template, pos)
        if_m = _IF_OPEN_RE.search(template, pos)

        # Find the earliest control structure
        candidates: list[tuple[int, str, re.Match]] = []
        if each_m:
            candidates.append((each_m.start(), "each", each_m))
        if if_m:
            candidates.append((if_m.start(), "if", if_m))

        if not candidates:
            # No more control structures — emit rest as scalar/text
            out.append(_render_vars(template[pos:], ctx))
            break

        candidates.sort(key=lambda x: x[0])
        first_pos, kind, m = candidates[0]
        # Emit text before the control structure (with vars resolved)
        out.append(_render_vars(template[pos:first_pos], ctx))

        if kind == "each":
            key = m.group(1)
            body_start = m.end()
            close_pos = _find_each_close(template, body_start)
            body = template[body_start:close_pos]
            items = ctx.get(key, [])
            if isinstance(items, list):
                for item in items:
                    sub_ctx = dict(ctx)
                    if isinstance(item, dict):
                        sub_ctx.update(item)
                    else:
                        sub_ctx["this"] = item
                    out.append(_render_block(body, sub_ctx))
            pos = close_pos + len(_EACH_CLOSE)

        else:  # if
            key = m.group(1)
            body_start = m.end()
            close_pos, else_pos = _find_if_close_and_else(template, body_start)
            if else_pos is not None:
                truthy = template[body_start:else_pos]
                falsy = template[else_pos + len(_IF_ELSE):close_pos]
            else:
                truthy = template[body_start:close_pos]
                falsy = ""
            value = ctx.get(key)
            chosen = truthy if value else falsy
            out.append(_render_block(chosen, ctx))
            pos = close_pos + len(_IF_CLOSE)

    return "".join(out)


def _render_vars(text: str, ctx: dict[str, Any]) -> str:
    """Resolve scalar {{var}} references in plain text."""
    def _sub(m: re.Match) -> str:
        key = m.group(1)
        if key in ctx:
            return _render_scalar(ctx[key])
        return m.group(0)
    return _VAR_RE.sub(_sub, text)


def render_template(template_text: str, ctx: dict[str, Any]) -> str:
    """Render a Handlebars-ish template string against ``ctx``.

    Supports: ``{{var}}``, ``{{#each list}}...{{/each}}``,
    ``{{#if cond}}...{{else}}...{{/if}}`` (nested #if inside #each OK).
    """
    rendered = _render_block(template_text, ctx)
    # Fix PASS/FAIL rendering for the summary table where `passed` is
    # referenced directly inside a cell.
    # Not needed because we rewrote it via #if in the template.
    return rendered


# ---- Public API ----


def generate_markdown_report(
    report: DecontaminationReport,
    template_path: str | Path | None = None,
    output_path: str | Path | None = None,
) -> str:
    """Render ``report`` with the given template and optionally write it.

    Parameters
    ----------
    report:
        DecontaminationReport to render.
    template_path:
        Path to the markdown template. Defaults to the framework-shipped one.
    output_path:
        If provided, write the rendered markdown to this path.

    Returns
    -------
    The rendered markdown string.
    """
    path = Path(template_path) if template_path else DEFAULT_TEMPLATE_PATH
    template_text = path.read_text(encoding="utf-8")
    ctx = report.to_context()
    rendered = render_template(template_text, ctx)
    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(rendered, encoding="utf-8")
    return rendered


def hash_file(path: str | Path) -> str:
    """Convenience: sha256 of a file's bytes (for reproducibility block)."""
    p = Path(path)
    if not p.exists():
        return ""
    return hashlib.sha256(p.read_bytes()).hexdigest()
