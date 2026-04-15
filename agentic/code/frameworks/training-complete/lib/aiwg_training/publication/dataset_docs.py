"""Dataset documentation generator — ``dataset-docs`` skill backend.

Generates standards-compliant dataset documentation (Datasheet, Model Card,
Data Statement) by auto-populating templates from a ``DatasetManifest``.

The renderer uses simple flat ``str.replace()`` substitution (templates are
flat — no nested iteration is needed). ``<!-- HUMAN FILL: ... -->`` markers
pass through in non-interactive mode; in interactive mode the operator is
prompted once per marker. An optional ``LLMClient`` can produce suggestion
text for HUMAN FILL fields, which the operator may accept or override.

Per ADR-022 D9 and REF-451, the target is ≥60% of ``{{field}}`` placeholders
auto-populated from the manifest.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Literal

from aiwg_training.publication._field_helpers import (
    compute_quality_distribution,
    format_bullet_list,
    format_decontamination_summary,
    format_quality_distribution,
    format_sources_table,
    format_split_summary,
    read_decontamination_report,
)
from aiwg_training.schemas.dataset_manifest import DatasetManifest

if TYPE_CHECKING:
    from aiwg_training.schemas.example_record import CanonicalRecord

    # Typed only — the actual import happens lazily so this module does not
    # require the synthesis package to exist yet.
    from aiwg_training.synthesis.llm_client import LLMClient  # noqa: F401


DocType = Literal["datasheet", "model-card", "data-statement"]


# --------------------------------------------------------------------------- #
# Regexes                                                                      #
# --------------------------------------------------------------------------- #


_PLACEHOLDER_RE = re.compile(r"\{\{([a-zA-Z0-9_]+)\}\}")
"""Matches ``{{field_name}}`` placeholders."""

_HUMAN_FILL_RE = re.compile(
    r"<!--\s*HUMAN FILL(?::\s*(?P<hint>.*?))?\s*-->",
    re.DOTALL,
)
"""Matches ``<!-- HUMAN FILL -->`` and ``<!-- HUMAN FILL: hint text -->``."""


_UNRESOLVED = "UNKNOWN — see manifest"


# --------------------------------------------------------------------------- #
# Result dataclass                                                             #
# --------------------------------------------------------------------------- #


@dataclass
class GenerationResult:
    """Outcome of generating one documentation file."""

    output_path: Path
    doc_type: DocType
    fields_auto_populated: list[str] = field(default_factory=list)
    fields_human_fill: list[str] = field(default_factory=list)
    fields_unresolved: list[str] = field(default_factory=list)
    llm_suggestions: dict[str, str] = field(default_factory=dict)

    @property
    def auto_population_rate(self) -> float:
        """Fraction of ``{{field}}`` placeholders auto-resolved from the manifest."""
        total = len(self.fields_auto_populated) + len(self.fields_unresolved)
        return len(self.fields_auto_populated) / total if total else 0.0


# --------------------------------------------------------------------------- #
# Template filename map                                                        #
# --------------------------------------------------------------------------- #


_TEMPLATE_FILENAMES: dict[DocType, str] = {
    "datasheet": "datasheet-for-datasets.md",
    "model-card": "model-card.md",
    "data-statement": "data-statement.md",
}


_OUTPUT_FILENAMES: dict[DocType, str] = {
    "datasheet": "datasheet.md",
    "model-card": "model-card.md",
    "data-statement": "data-statement.md",
}


# --------------------------------------------------------------------------- #
# Generator                                                                    #
# --------------------------------------------------------------------------- #


class DatasetDocsGenerator:
    """Auto-populate dataset documentation from a ``DatasetManifest``.

    Typical usage::

        manifest = DatasetManifest.load("v1.0-manifest.yaml")
        gen = DatasetDocsGenerator(manifest, examples=loaded_records)
        gen.generate_all(Path(".aiwg/training/datasets/docs/"))
    """

    def __init__(
        self,
        manifest: DatasetManifest,
        examples: list["CanonicalRecord"] | None = None,
        llm_client: "LLMClient | None" = None,
        decontamination_report_path: Path | str | None = None,
        input_fn: Callable[[str], str] | None = None,
    ) -> None:
        self.manifest = manifest
        self.examples = examples or []
        self.llm_client = llm_client
        self._decontamination_report_path = (
            Path(decontamination_report_path) if decontamination_report_path else None
        )
        # Injected for test seams (monkey-patching ``input`` globally is
        # brittle; this makes interactive mode testable).
        self._input_fn = input_fn or input
        self._field_values = self._build_field_values()

    # ----------------------------------------------------------------- field resolution

    def _build_field_values(self) -> dict[str, str]:
        """Resolve every manifest-backed ``{{field}}`` to its string value.

        Fields not resolvable from the manifest are simply missing from the
        dict; they get replaced with ``UNRESOLVED`` at render time and
        tallied in ``GenerationResult.fields_unresolved``.
        """
        m = self.manifest
        sc = m.split_counts
        values: dict[str, str] = {
            # Identity
            "dataset_name": m.name,
            "version": m.version,
            "dataset_version": m.version,
            "description": m.description,
            "created_at": m.created_at,
            "generated_timestamp": m.created_at,
            # Counts
            "instance_count": str(sc.total),
            "split_train_count": str(sc.train),
            "split_val_count": str(sc.validation),
            "split_test_count": str(sc.test),
            "splits": format_split_summary(sc),
            # Licensing
            "license_id": m.license,
            # Provenance / fixity
            "provenance_record_path": m.provenance_record_id,
            "fixity_manifest": m.fixity_manifest,
            # Intended use / scope
            "intended_use": m.intended_use or "",
            "intended_tasks": m.intended_use or "",
            "out_of_scope": format_bullet_list(m.out_of_scope),
            "out_of_scope_uses": format_bullet_list(m.out_of_scope),
            "ethical_considerations": m.ethical_considerations or "",
            # Synthetic ratios
            "synthetic_ratio_train": f"{m.synthetic_ratio.train:.3f}",
            "synthetic_ratio_val": f"{m.synthetic_ratio.validation:.3f}",
            "synthetic_ratio_validation": f"{m.synthetic_ratio.validation:.3f}",
            "synthetic_ratio_test": f"{m.synthetic_ratio.test:.3f}",
            # Sources
            "sources_table": format_sources_table(m.sources),
            "source_urls": format_bullet_list(s.ref_id for s in m.sources),
            # Decontamination
            "decontamination_summary": format_decontamination_summary(
                read_decontamination_report(self._decontamination_report_path)
                if self._decontamination_report_path
                else None
            ),
            "decontamination_report_path": m.decontamination_report_id or "",
        }

        # Examples-derived fields (only when examples were supplied)
        if self.examples:
            dist = compute_quality_distribution(self.examples)
            values["quality_distribution"] = format_quality_distribution(dist)
        else:
            values["quality_distribution"] = "(no quality report available)"

        # Clamp empty strings to the unresolved sentinel so they render as
        # ``UNKNOWN — see manifest`` rather than an empty line. Keeping
        # structurally-derived placeholders (sources table, bullet lists)
        # as-is since their helpers already emit ``(none)`` / ``(no sources
        # listed)`` when applicable.
        for key in (
            "intended_use",
            "intended_tasks",
            "ethical_considerations",
            "decontamination_report_path",
        ):
            if not values.get(key):
                values.pop(key, None)
        return values

    # ---------------------------------------------------------------- main entry point

    def generate(
        self,
        template_path: Path | str,
        output_path: Path | str,
        interactive: bool = False,
    ) -> GenerationResult:
        """Render one template to ``output_path`` and return a result record."""
        tpath = Path(template_path)
        opath = Path(output_path)
        doc_type = _doc_type_from_template(tpath)

        rendered, auto, unresolved = self._substitute_placeholders(tpath.read_text(encoding="utf-8"))
        rendered, human_fill, suggestions = self._handle_human_fill(rendered, interactive)

        opath.parent.mkdir(parents=True, exist_ok=True)
        opath.write_text(rendered, encoding="utf-8")

        return GenerationResult(
            output_path=opath,
            doc_type=doc_type,
            fields_auto_populated=auto,
            fields_human_fill=human_fill,
            fields_unresolved=unresolved,
            llm_suggestions=suggestions,
        )

    def generate_all(
        self,
        output_dir: Path | str,
        interactive: bool = False,
        templates_dir: Path | str | None = None,
    ) -> dict[DocType, Path]:
        """Render all three documents into ``output_dir``.

        ``templates_dir`` defaults to the framework's shipped template
        directory (``agentic/code/frameworks/training-complete/templates``).
        The version prefix on output filenames follows the SKILL.md
        convention (``<version>-datasheet.md`` etc.).
        """
        tdir = Path(templates_dir) if templates_dir else _default_templates_dir()
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)

        paths: dict[DocType, Path] = {}
        for doc_type, template_filename in _TEMPLATE_FILENAMES.items():
            out_filename = f"{self.manifest.version}-{_OUTPUT_FILENAMES[doc_type]}"
            result = self.generate(
                template_path=tdir / template_filename,
                output_path=out / out_filename,
                interactive=interactive,
            )
            paths[doc_type] = result.output_path
        return paths

    # ---------------------------------------------------------------- placeholder work

    def _substitute_placeholders(
        self, text: str
    ) -> tuple[str, list[str], list[str]]:
        """Replace every ``{{field}}`` placeholder.

        Returns ``(rendered_text, fields_auto, fields_unresolved)``.
        """
        auto: list[str] = []
        unresolved: list[str] = []

        def repl(match: re.Match[str]) -> str:
            key = match.group(1)
            if key in self._field_values:
                auto.append(key)
                return self._field_values[key]
            unresolved.append(key)
            return _UNRESOLVED

        rendered = _PLACEHOLDER_RE.sub(repl, text)
        return rendered, auto, unresolved

    def _handle_human_fill(
        self, text: str, interactive: bool
    ) -> tuple[str, list[str], dict[str, str]]:
        """Process ``<!-- HUMAN FILL -->`` markers.

        Non-interactive mode leaves markers in place; interactive mode
        prompts the operator (one question per marker) and substitutes
        their answer. If an ``LLMClient`` is available, it suggests text
        which the operator may accept with an empty response.
        """
        human_fill: list[str] = []
        suggestions: dict[str, str] = {}

        def repl(match: re.Match[str]) -> str:
            hint = (match.group("hint") or "").strip()
            marker_id = f"HUMAN_FILL[{len(human_fill)}]"
            human_fill.append(hint or marker_id)

            if not interactive:
                return match.group(0)  # leave original marker intact

            suggestion = ""
            if self.llm_client is not None:
                suggestion = self._suggest_field(hint).strip()
                if suggestion:
                    suggestions[marker_id] = suggestion

            prompt_body = hint or "Please provide content for this field"
            if suggestion:
                prompt_text = (
                    f"[HUMAN FILL] {prompt_body}\n"
                    f"  Suggestion: {suggestion}\n"
                    f"  (Enter to accept, or type replacement): "
                )
            else:
                prompt_text = f"[HUMAN FILL] {prompt_body}\n  > "

            answer = self._input_fn(prompt_text).strip()
            if not answer and suggestion:
                return suggestion
            if not answer:
                # Operator left blank with no suggestion — preserve marker
                return match.group(0)
            return answer

        rendered = _HUMAN_FILL_RE.sub(repl, text)
        return rendered, human_fill, suggestions

    def _suggest_field(self, hint: str) -> str:
        """Ask the LLM to draft text for a HUMAN FILL marker.

        Keeps prompts small and purely advisory — the operator is always
        the decision authority. Failures are swallowed so documentation
        generation never breaks on transient LLM errors.
        """
        if self.llm_client is None or not hint:
            return ""

        manifest_summary = (
            f"Dataset: {self.manifest.name} v{self.manifest.version}\n"
            f"Description: {self.manifest.description}\n"
            f"License: {self.manifest.license}\n"
            f"Instance count: {self.manifest.split_counts.total}\n"
            f"Intended use: {self.manifest.intended_use or 'unspecified'}"
        )
        prompt = (
            "You are drafting a field in a dataset documentation template. "
            "Produce a concise 1-3 sentence suggestion the human operator "
            "can accept, edit, or reject. Do not hedge unnecessarily; do "
            "not fabricate specifics that are not in the context.\n\n"
            f"Context:\n{manifest_summary}\n\n"
            f"Field hint: {hint}\n\n"
            "Suggestion:"
        )
        try:
            return self.llm_client.complete(prompt)
        except Exception:  # noqa: BLE001 — LLM errors are non-fatal
            return ""


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _doc_type_from_template(template_path: Path) -> DocType:
    """Infer doc type from a template filename."""
    name = template_path.name
    for doc_type, filename in _TEMPLATE_FILENAMES.items():
        if name == filename:
            return doc_type
    # Loose match for renamed templates — fall through to datasheet.
    lowered = name.lower()
    if "model" in lowered:
        return "model-card"
    if "statement" in lowered:
        return "data-statement"
    return "datasheet"


def _default_templates_dir() -> Path:
    """Locate the framework-shipped templates directory.

    Walks up from this file's location to
    ``training-complete/templates/``. The module lives at
    ``training-complete/lib/aiwg_training/publication/dataset_docs.py``, so
    the templates directory is three parents up plus ``templates``.
    """
    here = Path(__file__).resolve()
    # .../publication/dataset_docs.py -> .../aiwg_training -> .../lib -> .../training-complete
    candidate = here.parent.parent.parent.parent / "templates"
    return candidate
