"""aiwg-training — CLI entry point.

Wraps every module in a Click subcommand group so SKILL.md files can
invoke them via Bash. Command structure mirrors the skill names:

    aiwg-training acquire <uri> --license <spdx>
    aiwg-training quality assess <input.jsonl>
    aiwg-training license check <manifest.yaml>
    aiwg-training synthesize <sources.jsonl> --pattern self-instruct
    aiwg-training preferences generate <candidates.jsonl>
    aiwg-training synthetic generate --config <config.yaml>
    aiwg-training format convert <input.jsonl> --target alpaca
    aiwg-training decontamination check <dataset.jsonl>
    aiwg-training dataset version <version> --seed 42
    aiwg-training dataset reproduce <manifest.yaml>
    aiwg-training dataset docs <manifest.yaml> --type datasheet
    aiwg-training flow build <config.yaml>
    aiwg-training log render <log.jsonl>
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import click
from rich.console import Console
from rich.table import Table

from aiwg_training import __version__

console = Console()


# ---- Root group ----


@click.group()
@click.version_option(__version__, prog_name="aiwg-training")
@click.option(
    "--consumer",
    default="training-complete",
    show_default=True,
    help="Consumer ID for topology resolution (ADR-021 D4).",
)
@click.option(
    "--workspace",
    type=click.Path(path_type=Path),
    default=Path(".aiwg/training"),
    show_default=True,
    help="AIWG workspace root.",
)
@click.pass_context
def main(ctx: click.Context, consumer: str, workspace: Path) -> None:
    """aiwg-training — corpus-to-dataset pipeline."""
    ctx.ensure_object(dict)
    ctx.obj["consumer"] = consumer
    ctx.obj["workspace"] = workspace


# ---- acquire ----


@main.command()
@click.argument("uri")
@click.option("--license", "license_id", help="SPDX license identifier.")
@click.option("--allow-unlicensed", is_flag=True, help="Allow sources without license declaration.")
@click.option("--format", "format_hint", help="Format hint: code|docs|papers|dialogues|mixed.")
@click.pass_context
def acquire(
    ctx: click.Context,
    uri: str,
    license_id: str | None,
    allow_unlicensed: bool,
    format_hint: str | None,
) -> None:
    """Acquire a training data source (file:, https:, git:, ref:)."""
    from aiwg_training.ingest import SourceAcquirer

    acquirer = SourceAcquirer(workspace=ctx.obj["workspace"])
    result = acquirer.acquire(uri, license=license_id, format_hint=format_hint, allow_unlicensed=allow_unlicensed)
    console.print(f"[green]✓[/green] Acquired {result.source_type}: {result.source_id}")
    console.print(f"  Raw dir:    {result.raw_dir}")
    console.print(f"  License:    {result.license}")
    console.print(f"  Format:     {result.format_detected}")
    console.print(f"  Files:      {result.file_count} ({result.total_bytes} bytes)")


# ---- quality ----


@main.group()
def quality() -> None:
    """Example quality assessment (GRADE)."""


@quality.command("assess")
@click.argument("input_path", type=click.Path(exists=True, path_type=Path))
@click.option("--min-grade", type=click.Choice(["HIGH", "MODERATE", "LOW", "VERY_LOW"]))
@click.option("--report", "report_path", type=click.Path(path_type=Path))
@click.option("--no-llm", is_flag=True, help="Use only deterministic rules (skip LLM checks).")
@click.pass_context
def quality_assess(
    ctx: click.Context,
    input_path: Path,
    min_grade: str | None,
    report_path: Path | None,
    no_llm: bool,
) -> None:
    """Assess quality of training examples in a JSONL file."""
    from aiwg_training.quality import QualityAssessor
    from aiwg_training.schemas import CanonicalRecord, QualityGrade

    records = CanonicalRecord.load_jsonl(input_path)
    llm_client = None if no_llm else _get_llm_client()
    assessor = QualityAssessor(llm_client)

    baseline = QualityGrade(min_grade) if min_grade else QualityGrade.MODERATE
    report = assessor.assess_batch(records, min_grade=baseline if min_grade else None)

    console.print(f"[green]✓[/green] Assessed {len(records)} examples")
    tbl = Table(title="GRADE distribution")
    tbl.add_column("Grade")
    tbl.add_column("Count", justify="right")
    for grade, count in report.distribution.items():
        tbl.add_row(grade.value, str(count))
    console.print(tbl)

    if report_path:
        from aiwg_training.quality.example_quality import write_report
        write_report(report, report_path)
        console.print(f"  Report:     {report_path}")


# ---- license ----


@main.group()
def license() -> None:
    """License compliance checks."""


@license.command("check")
@click.argument("manifest_path", type=click.Path(exists=True, path_type=Path))
@click.option("--examples", type=click.Path(exists=True, path_type=Path), help="JSONL of examples to lint.")
@click.pass_context
def license_check(ctx: click.Context, manifest_path: Path, examples: Path | None) -> None:
    """Check license compliance for a dataset manifest."""
    from aiwg_training.quality.license_check import LicenseChecker
    from aiwg_training.schemas import CanonicalRecord, DatasetManifest

    manifest = DatasetManifest.load(manifest_path)
    checker = LicenseChecker()
    example_records = CanonicalRecord.load_jsonl(examples) if examples else []
    results = checker.check_all(manifest, example_records)

    err = sum(1 for r in results if r.severity == "ERROR")
    warn = sum(1 for r in results if r.severity == "WARNING")
    for r in results:
        sym = "[red]✗[/red]" if r.severity == "ERROR" else "[yellow]⚠[/yellow]"
        console.print(f"{sym} {r.check_id}: {r.message}")
    console.print(f"\n{err} ERROR, {warn} WARNING")
    if err:
        sys.exit(1)


# ---- synthesize ----


@main.command()
@click.argument("sources_path", type=click.Path(exists=True, path_type=Path))
@click.option("--pattern", type=click.Choice(["self-instruct", "evol-instruct", "squad", "star"]), default="self-instruct")
@click.option("--count", type=int, default=10)
@click.option("--temperature", type=float, default=0.7)
@click.option("--seed", type=int)
@click.option("--output", "output_path", type=click.Path(path_type=Path), required=True)
@click.pass_context
def synthesize(
    ctx: click.Context,
    sources_path: Path,
    pattern: str,
    count: int,
    temperature: float,
    seed: int | None,
    output_path: Path,
) -> None:
    """Synthesize SFT examples from seed sources."""
    from aiwg_training.synthesis import ExampleSynthesizer
    from aiwg_training.schemas import CanonicalRecord, write_jsonl

    llm_client = _get_llm_client()
    synth = ExampleSynthesizer(llm_client)
    seeds = CanonicalRecord.load_jsonl(sources_path)
    result = synth.synthesize(seeds, pattern=pattern, count=count, temperature=temperature, seed=seed)
    write_jsonl(result.records, output_path)
    console.print(f"[green]✓[/green] Synthesized {len(result.records)} examples via {pattern}")
    console.print(f"  Output: {output_path}")
    console.print(f"  Cost:   ${result.llm_cost:.4f}")


# ---- preferences ----


@main.group()
def preferences() -> None:
    """Preference pair generation (DPO/KTO/ORPO/SimPO)."""


@preferences.command("generate")
@click.argument("pool_path", type=click.Path(exists=True, path_type=Path))
@click.option("--mode", type=click.Choice(["llm-judge", "rule-based", "human"]), default="llm-judge")
@click.option("--count", type=int, default=100)
@click.option("--min-confidence", type=float, default=0.7)
@click.option("--target-format", type=click.Choice(["dpo", "kto", "orpo", "simpo"]), default="dpo")
@click.option("--output", "output_path", type=click.Path(path_type=Path), required=True)
@click.pass_context
def preferences_generate(
    ctx: click.Context,
    pool_path: Path,
    mode: str,
    count: int,
    min_confidence: float,
    target_format: str,
    output_path: Path,
) -> None:
    """Generate preference pairs from a candidate pool."""
    from aiwg_training.synthesis import PreferenceGenerator, export
    from aiwg_training.schemas import CanonicalRecord

    llm_client = _get_llm_client() if mode == "llm-judge" else None
    gen = PreferenceGenerator(llm_client)
    pool = CanonicalRecord.load_jsonl(pool_path)
    result = gen.generate_from_pool(
        pool=pool, pair_count=count, mode=mode, min_confidence=min_confidence, target_format=target_format,
    )
    export(result.records, format=target_format, output_path=output_path)
    console.print(f"[green]✓[/green] Generated {len(result.records)} pairs ({target_format})")
    console.print(f"  Output: {output_path}")


# ---- synthetic ----


@main.group()
def synthetic() -> None:
    """Large-batch synthetic data generation."""


@synthetic.command("generate")
@click.option("--config", "config_path", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--seeds", type=click.Path(exists=True, path_type=Path))
@click.option("--allow-recursive-synthetic", is_flag=True)
@click.option("--output", "output_path", type=click.Path(path_type=Path), required=True)
@click.pass_context
def synthetic_generate(
    ctx: click.Context,
    config_path: Path,
    seeds: Path | None,
    allow_recursive_synthetic: bool,
    output_path: Path,
) -> None:
    """Generate synthetic examples per generator config (Orca/Phi/PersonaHub/STaR/ReST)."""
    from aiwg_training.synthesis import SyntheticDataGenerator
    from aiwg_training.schemas import CanonicalRecord, write_jsonl

    llm_client = _get_llm_client()
    gen = SyntheticDataGenerator(llm_client, config_path=config_path)
    seed_records = CanonicalRecord.load_jsonl(seeds) if seeds else None
    result = gen.generate(seed_records=seed_records, allow_recursive_synthetic=allow_recursive_synthetic)
    write_jsonl(result.records, output_path)
    console.print(f"[green]✓[/green] Generated {result.examples_generated} synthetic examples")
    console.print(f"  Depth:  {result.recursion_depth}")
    console.print(f"  Output: {output_path}")
    if result.override_flag:
        console.print("[yellow]⚠ Used --allow-recursive-synthetic override (Model Collapse risk — see REF-446)[/yellow]")


# ---- format ----


@main.group()
def format() -> None:
    """Format adapters (Alpaca/ShareGPT/ChatML/JSONL/Parquet)."""


@format.command("convert")
@click.argument("input_path", type=click.Path(exists=True, path_type=Path))
@click.option("--target", type=click.Choice(["alpaca", "sharegpt", "chatml", "jsonl", "parquet"]), required=True)
@click.option("--output", "output_path", type=click.Path(path_type=Path), required=True)
@click.option("--validate-round-trip", is_flag=True)
@click.option("--shard-size", type=int, help="Records per shard (parquet only).")
def format_convert(
    input_path: Path,
    target: str,
    output_path: Path,
    validate_round_trip: bool,
    shard_size: int | None,
) -> None:
    """Convert canonical JSONL to a target training format."""
    from aiwg_training.formats import get_adapter, validate_round_trip as _validate
    from aiwg_training.schemas import CanonicalRecord

    kwargs: dict[str, Any] = {}
    if shard_size and target == "parquet":
        kwargs["shard_size"] = shard_size

    records = CanonicalRecord.load_jsonl(input_path)
    adapter = get_adapter(target, **kwargs)
    adapter.write(records, output_path)
    console.print(f"[green]✓[/green] Wrote {len(records)} records as {target}: {output_path}")

    if validate_round_trip:
        report = _validate(records, adapter)
        if report.ok:
            console.print("[green]✓ Round-trip invariants preserved[/green]")
        else:
            console.print(f"[red]✗ Round-trip violations across {len(report.missing)} record(s)[/red]")
            for m in report.missing[:5]:
                console.print(f"  {m}")
            sys.exit(1)


# ---- decontamination ----


@main.group()
def decontamination() -> None:
    """Training-eval overlap detection (#842)."""


@decontamination.command("check")
@click.argument("dataset_path", type=click.Path(exists=True, path_type=Path))
@click.option("--targets", "targets_path", type=click.Path(path_type=Path))
@click.option("--mode", type=click.Choice(["exact-ngram", "fuzzy", "semantic"]), default="exact-ngram")
@click.option("--threshold", type=int, default=0)
@click.option("--ngram-size", type=int, default=13)
@click.option("--report", "report_path", type=click.Path(path_type=Path))
@click.pass_context
def decontamination_check(
    ctx: click.Context,
    dataset_path: Path,
    targets_path: Path | None,
    mode: str,
    threshold: int,
    ngram_size: int,
    report_path: Path | None,
) -> None:
    """Check a dataset for overlap against benchmark eval sets."""
    from aiwg_training.decontamination import DecontaminationCheck, load_targets
    from aiwg_training.schemas import CanonicalRecord

    targets = load_targets(targets_path) if targets_path else load_targets(None)
    records = CanonicalRecord.load_jsonl(dataset_path)
    check = DecontaminationCheck(
        targets=targets,
        eval_sets={},
        dataset_version=dataset_path.stem,
        mode_override=mode,
        ngram_size=ngram_size,
    )
    report = check.run(records, output_dir=report_path.parent if report_path else ctx.obj["workspace"] / "reports")
    status = "[green]PASS[/green]" if report.overall_passed else "[red]FAIL[/red]"
    console.print(f"Overall: {status}")
    for tr in report.target_results:
        s = "[green]✓[/green]" if tr.passed else "[red]✗[/red]"
        console.print(f"  {s} {tr.target.id}: {tr.overlap.overlap_count} overlap (threshold {tr.target.threshold})")
    if not report.overall_passed:
        sys.exit(1)


# ---- dataset ----


@main.group()
def dataset() -> None:
    """Dataset versioning, reproduction, documentation."""


@dataset.command("version")
@click.argument("version")
@click.option("--examples", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--sources", type=click.Path(exists=True, path_type=Path), required=True, help="YAML of source entries.")
@click.option("--name", required=True)
@click.option("--description", required=True)
@click.option("--seed", type=int, default=42)
@click.option("--split-ratios", default="0.8,0.1,0.1")
@click.option("--acknowledge-contamination", is_flag=True)
@click.option("--acknowledge-license-risk", is_flag=True)
@click.option("--target-model")
@click.option("--intended-use")
@click.pass_context
def dataset_version(
    ctx: click.Context,
    version: str,
    examples: Path,
    sources: Path,
    name: str,
    description: str,
    seed: int,
    split_ratios: str,
    acknowledge_contamination: bool,
    acknowledge_license_risk: bool,
    target_model: str | None,
    intended_use: str | None,
) -> None:
    """Publish a versioned dataset with manifest, fixity, and provenance."""
    import yaml as _yaml
    from aiwg_training.publication import DatasetVersioner
    from aiwg_training.schemas import CanonicalRecord, SourceEntry

    records = CanonicalRecord.load_jsonl(examples)
    source_data = _yaml.safe_load(sources.read_text(encoding="utf-8"))
    source_entries = [SourceEntry.model_validate(s) for s in source_data.get("sources", source_data)]

    train, val, test = [float(x) for x in split_ratios.split(",")]

    versioner = DatasetVersioner(workdir=ctx.obj["workspace"])
    output_dir = ctx.obj["workspace"] / "datasets"
    manifest = versioner.publish(
        version=version,
        examples=records,
        sources=source_entries,
        output_dir=output_dir,
        split_ratios={"train": train, "validation": val, "test": test},
        seed=seed,
        name=name,
        description=description,
        target_model=target_model,
        intended_use=intended_use,
        acknowledge_contamination=acknowledge_contamination,
        acknowledge_license_risk=acknowledge_license_risk,
    )
    console.print(f"[green]✓[/green] Published dataset {version}")
    console.print(f"  Manifest: {output_dir / f'{version}.yaml'}")
    console.print(f"  Splits:   train={manifest.split_counts.train} val={manifest.split_counts.validation} test={manifest.split_counts.test}")


@dataset.command("reproduce")
@click.argument("manifest_path", type=click.Path(exists=True, path_type=Path))
@click.option("--workdir", type=click.Path(path_type=Path))
@click.option("--compare-fixity", is_flag=True, default=True)
def dataset_reproduce(manifest_path: Path, workdir: Path | None, compare_fixity: bool) -> None:
    """Deterministically rebuild a dataset from its manifest."""
    from aiwg_training.publication import DatasetReproducer

    reproducer = DatasetReproducer()
    try:
        result = reproducer.reproduce(manifest_path, workdir=workdir or Path("./reproduction"), compare_fixity=compare_fixity)
        console.print(f"[green]✓[/green] Reproduced: fixity {result.verdict}")
    except NotImplementedError as e:
        console.print(f"[yellow]⚠ Reproduction requires Phase 3 synthesis modules: {e}[/yellow]")
        sys.exit(2)


@dataset.command("docs")
@click.argument("manifest_path", type=click.Path(exists=True, path_type=Path))
@click.option("--type", "doc_type", type=click.Choice(["datasheet", "model-card", "data-statement", "all"]), default="all")
@click.option("--output-dir", type=click.Path(path_type=Path))
@click.option("--interactive", is_flag=True)
@click.option("--examples", type=click.Path(exists=True, path_type=Path))
@click.pass_context
def dataset_docs(
    ctx: click.Context,
    manifest_path: Path,
    doc_type: str,
    output_dir: Path | None,
    interactive: bool,
    examples: Path | None,
) -> None:
    """Generate Datasheet / Model Card / Data Statement from manifest."""
    from aiwg_training.publication import DatasetDocsGenerator
    from aiwg_training.schemas import CanonicalRecord, DatasetManifest

    manifest = DatasetManifest.load(manifest_path)
    example_records = CanonicalRecord.load_jsonl(examples) if examples else None
    gen = DatasetDocsGenerator(manifest, examples=example_records, llm_client=_get_llm_client() if interactive else None)

    out_dir = output_dir or (ctx.obj["workspace"] / "datasets")
    if doc_type == "all":
        paths = gen.generate_all(out_dir, interactive=interactive)
        for kind, p in paths.items():
            console.print(f"[green]✓[/green] {kind}: {p}")
    else:
        # Single-type generation: resolve template + output name
        template_name = doc_type.replace("-", "_") if doc_type == "model-card" else doc_type
        # Simplify: use generate_all and filter
        paths = gen.generate_all(out_dir, interactive=interactive)
        key = doc_type.replace("-", "_")
        if key in paths:
            console.print(f"[green]✓[/green] {doc_type}: {paths[key]}")


# ---- flow ----


@main.group()
def flow() -> None:
    """End-to-end pipeline orchestrator."""


@flow.command("build")
@click.argument("config_path", type=click.Path(exists=True, path_type=Path))
@click.option("--stages", help="Comma-separated subset of stages to run.")
@click.option("--dry-run", is_flag=True)
@click.option("--version", help="Override version in config.")
@click.option("--interactive", is_flag=True)
@click.option("--continue-on-warn", is_flag=True)
@click.option("--acknowledge-license-risk", is_flag=True)
@click.option("--acknowledge-contamination", is_flag=True)
@click.pass_context
def flow_build(
    ctx: click.Context,
    config_path: Path,
    stages: str | None,
    dry_run: bool,
    version: str | None,
    interactive: bool,
    continue_on_warn: bool,
    acknowledge_license_risk: bool,
    acknowledge_contamination: bool,
) -> None:
    """Run the end-to-end corpus-to-dataset pipeline."""
    from aiwg_training.publication.flow_dataset_build import FlowDatasetBuild, PipelineConfig

    config = PipelineConfig.load(config_path)
    if version:
        config.publish.version = version

    flow_instance = FlowDatasetBuild(
        config=config,
        llm_client=_get_llm_client(strict=False),
        workspace=ctx.obj["workspace"],
        interactive=interactive,
        dry_run=dry_run,
        continue_on_warn=continue_on_warn,
        acknowledge_license_risk=acknowledge_license_risk,
        acknowledge_contamination=acknowledge_contamination,
        stages=stages.split(",") if stages else None,
    )
    result = flow_instance.run()

    console.print(f"\n[bold]Pipeline {result.status.upper()}[/bold] — {result.duration_s:.1f}s")
    tbl = Table()
    tbl.add_column("Stage")
    tbl.add_column("Status")
    tbl.add_column("Duration", justify="right")
    tbl.add_column("Message")
    for s in result.stages:
        tbl.add_row(s.name, s.status, f"{s.duration_s:.2f}s", s.message[:60] if s.message else "—")
    console.print(tbl)
    console.print(f"Report: {result.report_path}")

    if result.status != "ok":
        sys.exit(1)


# ---- log ----


@main.group("log")
def log_cmd() -> None:
    """Memory log utilities."""


@log_cmd.command("render")
@click.argument("log_path", type=click.Path(exists=True, path_type=Path))
@click.option("--output", "output_path", type=click.Path(path_type=Path))
@click.option("--tail", type=int, help="Show only last N entries.")
def log_render(log_path: Path, output_path: Path | None, tail: int | None) -> None:
    """Render a .log.jsonl file as Markdown."""
    from aiwg_training.schemas import read_events

    events = read_events(log_path)
    if tail:
        events = events[-tail:]

    lines = [f"# Memory Log — {log_path.parent.name}", "", f"> {len(events)} events", ""]
    for e in events:
        ts = e.get("ts", "?")[:10]  # date only for line prefix
        op = e.get("op", "?")
        subject = _log_subject(e)
        lines.append(f"## [{ts}] {op} | {subject}")
        if op == "ingest":
            pages = e.get("pages_touched", [])
            lines.append(f"Touched {len(pages)} pages. Contradictions: {e.get('contradictions', 0)}.")
        elif op == "lint":
            findings = e.get("findings", {})
            lines.append(
                f"{findings.get('error', 0)} errors, {findings.get('warning', 0)} warnings, "
                f"{findings.get('suggestion', 0)} suggestions."
            )
        elif op == "format-convert":
            lines.append(f"{e.get('records_converted', 0)} records → {e.get('target_format', '?')}. "
                         f"Round-trip: {'ok' if e.get('round_trip_validated') else 'skipped'}.")
        elif op == "decontamination-check":
            lines.append(f"Passed: {e.get('passed')}. Targets: {', '.join(e.get('targets', []))}.")
        elif op == "dataset-version":
            splits = e.get("split_counts", {})
            lines.append(f"Version {e.get('version')}: train={splits.get('train', 0)} "
                         f"val={splits.get('validation', 0)} test={splits.get('test', 0)}.")
        lines.append("")

    output = "\n".join(lines)
    if output_path:
        output_path.write_text(output, encoding="utf-8")
        console.print(f"[green]✓[/green] Rendered {len(events)} events to {output_path}")
    else:
        print(output)


def _log_subject(event: dict[str, Any]) -> str:
    """Derive a short subject line for a log event."""
    for key in ("source", "version", "report_id", "output"):
        if key in event:
            v = event[key]
            return Path(v).name if isinstance(v, str) else str(v)
    return event.get("op", "?")


# ---- internal helpers ----


def _get_llm_client(strict: bool = True) -> Any:
    """Return an LLMClient or None if anthropic is missing + strict=False."""
    try:
        from aiwg_training.synthesis.llm_client import LLMClient
        return LLMClient()
    except ImportError:
        if strict:
            console.print("[red]✗ anthropic SDK not installed. Run: pip install -e .[agentic][/red]")
            sys.exit(2)
        return None
    except Exception as e:  # noqa: BLE001
        # Missing API key, etc. — degrade gracefully in non-strict mode
        if strict:
            console.print(f"[red]✗ LLM client unavailable: {e}[/red]")
            sys.exit(2)
        return None


if __name__ == "__main__":
    main()
