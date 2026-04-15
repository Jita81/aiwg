"""Example synthesizer — small-batch SFT generation (issue #838).

Implements four published generation patterns against the ``LLMClient``
interface, producing canonical records stamped with synthetic provenance.

Patterns:
    - self-instruct (REF-375) — bootstrap novel instructions from a seed pool
    - evol-instruct — depth/breadth evolution of existing instructions
    - squad (REF-454) — span-grounded Q&A extraction from document text
    - star (REF-445) — augment examples with chain-of-thought reasoning traces

Large-batch, config-driven synthesis lives in
:mod:`aiwg_training.synthesis.synthetic_data_generator`.

Every output carries::

    metadata.synthetic = True
    metadata.synthetic_depth = max(seed.depth) + 1     # usually 1
    metadata.created_by_agent = "example-synthesizer"
    metadata.source_refs = [seed.id for seed in seeds_used]

A ``synthetic-generate`` memory-log event is appended to the consumer log
when a :class:`MemoryTopology` is provided.
"""

from __future__ import annotations

import json
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable

from aiwg_training.core import (
    MemoryTopology,
    ProvRecord,
    log_to_consumer,
    now_iso,
)
from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    SyntheticGenerateEvent,
    TaskType,
)
from aiwg_training.synthesis.llm_client import MODEL_SONNET

SUPPORTED_PATTERNS = ("self-instruct", "evol-instruct", "squad", "star")

AGENT_NAME = "example-synthesizer"

# Optional quality-assessor hook: ``callable(CanonicalRecord) -> QualityGrade``.
QualityAssessor = Callable[[CanonicalRecord], QualityGrade]


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SELF_INSTRUCT_TEMPLATE = """You are generating new instruction/response pairs in the style of a small
seed pool. The goal is tasks that are novel but stylistically similar.

Seeds (each is a {{"instruction": ..., "response": ...}} pair):
{seeds_json}

Generate exactly {count} new pairs. Requirements:
- instructions must be distinct from each seed (no paraphrasing)
- responses must be substantive, grounded, and self-contained
- preserve the overall domain and difficulty of the seeds

Return a JSON object of the form {{"items": [{{"instruction": "...", "response": "..."}}, ...]}}.
Return only the JSON, no prose."""

_EVOL_INSTRUCT_TEMPLATE = """You are evolving an existing instruction to create a harder/different version
via {strategy} evolution.

Original pair:
{seed_json}

Strategy: {strategy_description}

Generate exactly 1 evolved pair. Requirements:
- the evolved instruction must still be answerable
- the new response must correctly address the evolved instruction

Return a JSON object with keys "instruction" and "response".
Return only the JSON, no prose."""

_SQUAD_TEMPLATE = """You are extracting span-grounded question/answer pairs from a passage.
For each question, the answer MUST be derivable from the passage itself.

Passage:
\"\"\"{passage}\"\"\"

Generate {count} Q&A pair{plural} from this passage. Requirements:
- each question should be answerable strictly from the passage
- each answer should quote or paraphrase the specific relevant span
- avoid questions whose answers require outside knowledge

Return a JSON object of the form {{"items": [{{"question": "...", "answer": "..."}}, ...]}}.
Return only the JSON, no prose."""

_STAR_TEMPLATE = """You are augmenting an existing instruction/response pair with a
chain-of-thought reasoning trace that leads to the same final answer.

Pair:
{seed_json}

Requirements:
- the reasoning_trace must be step-by-step (numbered steps preferred)
- the final answer in the response must not change
- the trace must be consistent with the existing response

Return a JSON object with keys "instruction", "response", "reasoning_trace".
Return only the JSON, no prose."""

_EVOL_STRATEGIES = {
    "depth": (
        "Add a constraint, extra precision requirement, or deeper reasoning "
        "step that makes the task harder without changing its topic."
    ),
    "breadth": (
        "Rephrase the task from a different angle, domain, or topic while "
        "preserving the underlying skill exercised."
    ),
}


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------


@dataclass
class SynthesisResult:
    """Output bundle from :meth:`ExampleSynthesizer.synthesize`."""

    records: list[CanonicalRecord]
    pattern: str
    seeds_used: list[str] = field(default_factory=list)
    llm_cost: float = 0.0
    duration_seconds: float = 0.0
    prov_record: ProvRecord | None = None
    rejected_records: list[CanonicalRecord] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.records)


# ---------------------------------------------------------------------------
# ExampleSynthesizer
# ---------------------------------------------------------------------------


class ExampleSynthesizer:
    """Generate SFT training examples via published synthesis patterns.

    The synthesizer is LLM-agnostic: any object exposing the
    :class:`~aiwg_training.synthesis.llm_client.LLMClient` surface (``complete``
    + ``complete_json``) is accepted, including
    :class:`~aiwg_training.synthesis.mock_client.MockLLMClient` used in tests.
    """

    def __init__(
        self,
        llm_client: Any,
        topology: MemoryTopology | None = None,
    ) -> None:
        self.llm = llm_client
        self.topology = topology
        self._last_cost: float = 0.0

    # -- Public API ---------------------------------------------------------

    def synthesize(
        self,
        source_records: list[CanonicalRecord],
        pattern: str,
        count: int = 10,
        temperature: float = 0.7,
        seed: int | None = None,
        model: str = MODEL_SONNET,
        quality_assessor: QualityAssessor | None = None,
        min_grade: QualityGrade = QualityGrade.MODERATE,
    ) -> SynthesisResult:
        """Generate ``count`` synthetic examples from ``source_records``.

        Parameters
        ----------
        source_records:
            Seed examples. For ``squad`` these are treated as passages; for the
            other patterns they are I/O pairs.
        pattern:
            One of :data:`SUPPORTED_PATTERNS`.
        count:
            Target number of accepted records.
        temperature:
            Passed through to the LLM.
        seed:
            Reproducibility seed for stochastic choices (seed-pool sampling).
        model:
            Model identifier forwarded to the LLM client.
        quality_assessor:
            Optional callable. If supplied, below-``min_grade`` records are
            routed to :attr:`SynthesisResult.rejected_records` instead of
            :attr:`SynthesisResult.records`.
        min_grade:
            Minimum acceptable GRADE for the quality gate.
        """
        if pattern not in SUPPORTED_PATTERNS:
            raise ValueError(
                f"Unknown pattern {pattern!r}. Supported: {SUPPORTED_PATTERNS}"
            )
        if not source_records:
            raise ValueError("source_records must be non-empty")
        if count < 1:
            raise ValueError(f"count must be >= 1, got {count}")

        rng = random.Random(seed)
        prov = ProvRecord()
        t0 = time.monotonic()

        dispatch: dict[str, Callable[..., tuple[list[CanonicalRecord], float]]] = {
            "self-instruct": self._synthesize_self_instruct,
            "evol-instruct": self._synthesize_evol_instruct,
            "squad": self._synthesize_squad,
            "star": self._synthesize_star,
        }

        records, total_cost = dispatch[pattern](
            source_records=source_records,
            count=count,
            temperature=temperature,
            model=model,
            rng=rng,
            prov=prov,
        )

        # Quality gate (optional)
        accepted: list[CanonicalRecord] = []
        rejected: list[CanonicalRecord] = []
        for r in records:
            if quality_assessor is None:
                accepted.append(r)
                continue
            grade = quality_assessor(r)
            r.metadata.quality_grade = grade
            if _grade_meets(grade, min_grade):
                accepted.append(r)
            else:
                rejected.append(r)

        duration = time.monotonic() - t0
        seeds_used = [r.id for r in source_records]

        # Memory-log event (best-effort; failures are non-blocking)
        if self.topology is not None and accepted:
            try:
                event = SyntheticGenerateEvent(
                    consumer=self.topology.namespace,
                    actor=AGENT_NAME,
                    seed_examples=seeds_used,
                    generator_agent=AGENT_NAME,
                    recursion_depth=1,
                    quality_grade=_aggregate_grade(accepted).value,
                    examples_generated=len(accepted),
                    override_flag=False,
                )
                log_to_consumer(event, self.topology)
            except Exception:  # pragma: no cover — log best-effort
                pass

        return SynthesisResult(
            records=accepted,
            pattern=pattern,
            seeds_used=seeds_used,
            llm_cost=total_cost,
            duration_seconds=duration,
            prov_record=prov,
            rejected_records=rejected,
        )

    # -- Pattern implementations -------------------------------------------

    def _synthesize_self_instruct(
        self,
        source_records: list[CanonicalRecord],
        count: int,
        temperature: float,
        model: str,
        rng: random.Random,
        prov: ProvRecord,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-375 — bootstrap novel instructions from a seed pool."""
        seeds_sample = _sample_seeds(source_records, k=min(len(source_records), 8), rng=rng)
        seeds_json = json.dumps(
            [
                {"instruction": s.input.user, "response": _assistant_text(s)}
                for s in seeds_sample
            ],
            indent=2,
        )
        prompt = _SELF_INSTRUCT_TEMPLATE.format(seeds_json=seeds_json, count=count)
        messages = [{"role": "user", "content": prompt}]
        data = self._json_call(messages, model=model, temperature=temperature)
        items = _expect_items(data, keys={"instruction", "response"})

        records: list[CanonicalRecord] = []
        for item in items[:count]:
            rec = _build_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                task_type=_infer_task_type(seeds_sample[0]),
                seeds=seeds_sample,
                pattern="self-instruct",
                model=model,
                temperature=temperature,
            )
            _record_prov(prov, rec, seeds_sample, pattern="self-instruct")
            records.append(rec)
        return records, self._last_cost

    def _synthesize_evol_instruct(
        self,
        source_records: list[CanonicalRecord],
        count: int,
        temperature: float,
        model: str,
        rng: random.Random,
        prov: ProvRecord,
    ) -> tuple[list[CanonicalRecord], float]:
        """Evol-Instruct — alternating depth/breadth evolution."""
        records: list[CanonicalRecord] = []
        strategies = ["depth", "breadth"]
        cost_accum = 0.0

        for i in range(count):
            seed = source_records[i % len(source_records)]
            strategy = strategies[i % 2]
            seed_json = json.dumps(
                {"instruction": seed.input.user, "response": _assistant_text(seed)},
                indent=2,
            )
            prompt = _EVOL_INSTRUCT_TEMPLATE.format(
                seed_json=seed_json,
                strategy=strategy,
                strategy_description=_EVOL_STRATEGIES[strategy],
            )
            messages = [{"role": "user", "content": prompt}]
            data = self._json_call(messages, model=model, temperature=temperature)
            item = _expect_dict(data, keys={"instruction", "response"})
            rec = _build_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                task_type=_infer_task_type(seed),
                seeds=[seed],
                pattern=f"evol-instruct/{strategy}",
                model=model,
                temperature=temperature,
                # Evolved records honor depth recursion from the seed
                depth_override=seed.metadata.synthetic_depth + 1,
            )
            _record_prov(prov, rec, [seed], pattern=f"evol-instruct/{strategy}")
            records.append(rec)
            cost_accum += self._last_cost
        return records, cost_accum

    def _synthesize_squad(
        self,
        source_records: list[CanonicalRecord],
        count: int,
        temperature: float,
        model: str,
        rng: random.Random,
        prov: ProvRecord,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-454 — span-grounded Q&A extraction."""
        records: list[CanonicalRecord] = []
        cost_accum = 0.0

        per_passage = max(1, count // len(source_records))
        remaining = count

        for seed in source_records:
            if remaining <= 0:
                break
            passage = _passage_text(seed)
            if not passage:
                continue
            n = min(per_passage, remaining)
            prompt = _SQUAD_TEMPLATE.format(
                passage=passage,
                count=n,
                plural="s" if n != 1 else "",
            )
            messages = [{"role": "user", "content": prompt}]
            data = self._json_call(messages, model=model, temperature=temperature)
            items = _expect_items(data, keys={"question", "answer"})
            for item in items[:n]:
                rec = _build_record(
                    user=str(item["question"]),
                    assistant=str(item["answer"]),
                    task_type=TaskType.EXTRACTION,
                    seeds=[seed],
                    pattern="squad",
                    model=model,
                    temperature=temperature,
                )
                _record_prov(prov, rec, [seed], pattern="squad")
                records.append(rec)
                remaining -= 1
            cost_accum += self._last_cost

        return records, cost_accum

    def _synthesize_star(
        self,
        source_records: list[CanonicalRecord],
        count: int,
        temperature: float,
        model: str,
        rng: random.Random,
        prov: ProvRecord,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-445 — augment examples with chain-of-thought reasoning traces."""
        records: list[CanonicalRecord] = []
        cost_accum = 0.0

        for i in range(count):
            seed = source_records[i % len(source_records)]
            if seed.is_preference():
                # STaR requires standard I/O pairs
                continue
            seed_json = json.dumps(
                {"instruction": seed.input.user, "response": _assistant_text(seed)},
                indent=2,
            )
            prompt = _STAR_TEMPLATE.format(seed_json=seed_json)
            messages = [{"role": "user", "content": prompt}]
            data = self._json_call(messages, model=model, temperature=temperature)
            item = _expect_dict(
                data, keys={"instruction", "response", "reasoning_trace"}
            )
            rec = _build_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                reasoning_trace=str(item["reasoning_trace"]),
                task_type=TaskType.REASONING,
                seeds=[seed],
                pattern="star",
                model=model,
                temperature=temperature,
            )
            _record_prov(prov, rec, [seed], pattern="star")
            records.append(rec)
            cost_accum += self._last_cost

        return records, cost_accum

    # -- Transport ---------------------------------------------------------

    def _json_call(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str,
        temperature: float,
    ) -> dict[str, Any]:
        """Invoke :meth:`complete_json` with the client's model pinned.

        Captures an approximate per-call cost via :attr:`_last_cost` by
        inspecting ``total_cost`` before/after the call. Clients without that
        attribute (exotic duck-types) report cost=0.
        """
        before = float(getattr(self.llm, "total_cost", 0.0))
        # Some clients (LLMClient) carry model on the instance; others accept
        # it as a kwarg via .complete directly. Pass temperature through; the
        # shared complete_json signature does not accept ``model``.
        data = self.llm.complete_json(messages=messages, temperature=temperature)
        after = float(getattr(self.llm, "total_cost", 0.0))
        self._last_cost = max(0.0, after - before)
        return data


# ---------------------------------------------------------------------------
# Grade helpers
# ---------------------------------------------------------------------------


_GRADE_ORDER = {
    QualityGrade.VERY_LOW: 0,
    QualityGrade.LOW: 1,
    QualityGrade.MODERATE: 2,
    QualityGrade.HIGH: 3,
}


def _grade_meets(actual: QualityGrade, minimum: QualityGrade) -> bool:
    return _GRADE_ORDER[actual] >= _GRADE_ORDER[minimum]


def _aggregate_grade(records: list[CanonicalRecord]) -> QualityGrade:
    """Return the median grade across a batch."""
    if not records:
        return QualityGrade.MODERATE
    grades = sorted(
        (r.metadata.quality_grade for r in records), key=lambda g: _GRADE_ORDER[g]
    )
    return grades[len(grades) // 2]


# ---------------------------------------------------------------------------
# Record construction
# ---------------------------------------------------------------------------


def _sample_seeds(
    records: list[CanonicalRecord], k: int, rng: random.Random
) -> list[CanonicalRecord]:
    if len(records) <= k:
        return list(records)
    return rng.sample(records, k=k)


def _assistant_text(rec: CanonicalRecord) -> str:
    if rec.is_preference():
        return rec.require_preference_output().chosen
    return rec.require_standard_output().assistant


def _passage_text(rec: CanonicalRecord) -> str:
    """Extract a document-like passage from a source record.

    Prefers the system prompt (often used to inject context), falls back to
    user prompt, then assistant response.
    """
    if rec.input.system:
        return rec.input.system
    if rec.input.user:
        return rec.input.user
    try:
        return _assistant_text(rec)
    except ValueError:
        return ""


def _infer_task_type(rec: CanonicalRecord) -> TaskType:
    """Carry task_type forward from the seed where sensible."""
    if rec.task_type == TaskType.PREFERENCE:
        return TaskType.INSTRUCTION_FOLLOWING
    return rec.task_type


def _build_record(
    *,
    user: str,
    assistant: str,
    task_type: TaskType,
    seeds: list[CanonicalRecord],
    pattern: str,
    model: str,
    temperature: float,
    reasoning_trace: str | None = None,
    depth_override: int | None = None,
) -> CanonicalRecord:
    max_seed_depth = max((s.metadata.synthetic_depth for s in seeds), default=0)
    synthetic_depth = (
        depth_override if depth_override is not None else max_seed_depth + 1
    )
    # Merge domains from seeds (unique, order-preserving)
    domain: list[str] = []
    for s in seeds:
        for d in s.metadata.domain:
            if d not in domain:
                domain.append(d)

    metadata = ExampleMetadata(
        quality_grade=QualityGrade.MODERATE,
        license=_common_license(seeds),
        provenance_id=f"prov-{pattern.replace('/', '-')}-{_shortid()}",
        created_at=now_iso(),
        domain=domain,
        source_refs=[s.id for s in seeds],
        created_by_agent=AGENT_NAME,
        synthetic=True,
        synthetic_depth=synthetic_depth,
        generation_pattern=pattern,
        generation_model=model,
        generation_temperature=temperature,
    )
    output = OutputPayload(assistant=assistant, reasoning_trace=reasoning_trace)
    return CanonicalRecord(
        task_type=task_type,
        input=InputPayload(user=user),
        output=output,
        metadata=metadata,
    )


def _record_prov(
    prov: ProvRecord,
    rec: CanonicalRecord,
    seeds: list[CanonicalRecord],
    *,
    pattern: str,
) -> None:
    seed_entities = [
        prov.add_entity("aiwg:Example", label=s.id, source_ref=s.id) for s in seeds
    ]
    generated = prov.add_entity(
        "aiwg:Example", label=rec.id, example_id=rec.id, pattern=pattern
    )
    activity = prov.add_activity(
        type="aiwg:Synthesis",
        agent=AGENT_NAME,
        used=seed_entities,
        generated=[generated],
    )
    prov.finalize_activity(activity)


def _common_license(seeds: list[CanonicalRecord]) -> str:
    """Pick a seed license deterministically; fall back to a permissive default."""
    if not seeds:
        return "CC-BY-4.0"
    licenses = {s.metadata.license for s in seeds}
    if len(licenses) == 1:
        return next(iter(licenses))
    return seeds[0].metadata.license


def _shortid() -> str:
    return uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------
# LLM response parsers
# ---------------------------------------------------------------------------


def _expect_items(data: dict[str, Any], keys: set[str]) -> list[dict[str, Any]]:
    """Pull a list of dicts from ``data['items']`` (accepts a few aliases)."""
    items: Any = None
    for alias in ("items", "pairs", "examples", "data"):
        if alias in data:
            items = data[alias]
            break
    if items is None:
        # Tolerate a flat dict whose values happen to be a list
        for v in data.values():
            if isinstance(v, list):
                items = v
                break
    if not isinstance(items, list):
        raise SynthesisError(
            f"Expected a JSON object with an 'items' array, got: {data!r}"
        )
    out: list[dict[str, Any]] = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise SynthesisError(f"items[{i}] is not a dict: {it!r}")
        missing = keys - set(it.keys())
        if missing:
            raise SynthesisError(f"items[{i}] missing keys {missing}: {it!r}")
        out.append(it)
    return out


def _expect_dict(data: dict[str, Any], keys: set[str]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise SynthesisError(f"Expected JSON object, got {type(data).__name__}")
    missing = keys - set(data.keys())
    if missing:
        raise SynthesisError(f"Response missing keys {missing}: {data!r}")
    return data


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class SynthesisError(RuntimeError):
    """Raised when the LLM produces a response that cannot be parsed into
    canonical records (invalid shape, missing keys, malformed JSON)."""
