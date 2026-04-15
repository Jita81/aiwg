"""Synthetic data generator — large-batch pipelined synthesis (issue #840).

Implements the ``synthetic-data-generator`` skill: a config-driven pipeline
for bulk generation using five published patterns (Orca, Orca-2, Phi,
PersonaHub, STaR, ReST). All outputs are stamped with the Model Collapse
recursion depth, and a strict guard rejects synthetic-from-synthetic seed
sets unless ``allow_recursive_synthetic=True`` (the canonical case is ReST
outer-loop iteration — see REF-456).

References
----------
- REF-435 Orca-2           — reasoning-strategy-aware distillation
- REF-436/437 Phi          — textbook-quality curriculum generation
- REF-445 STaR             — self-taught reasoner with reward filtering
- REF-446 Model Collapse   — recursion guard rationale
- REF-448 PersonaHub       — persona-driven instruction diversity
- REF-456 ReST             — grow + improve offline RL loop
- REF-470 Orca             — system-message trace distillation
- ADR-022 D10              — recursion depth policy + override flag requirement
"""

from __future__ import annotations

import json
import random
import time
import uuid
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

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

SUPPORTED_GENERATORS = ("orca", "orca-2", "phi", "personahub", "star", "rest")

AGENT_NAME = "synthetic-data-generator"

_MODEL_COLLAPSE_MSG = (
    "Model Collapse guard tripped: at least one seed has "
    "metadata.synthetic_depth >= 1. Recursive synthetic generation is rejected "
    "unless `allow_recursive_synthetic=True`. See REF-446 and ADR-022 D10."
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ModelCollapseGuardError(RuntimeError):
    """Raised when recursive synthetic generation is attempted without override."""

    def __init__(
        self, message: str, *, max_depth: int = 0, offending_seeds: list[str] | None = None
    ) -> None:
        super().__init__(message)
        self.max_depth = max_depth
        self.offending_seeds = list(offending_seeds or [])


class GeneratorConfigError(ValueError):
    """Raised when a config file fails validation."""


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass
class GeneratorConfig:
    """In-memory view of a ``synthetic-generator-config.yaml`` file."""

    generator: str
    count: int
    output_path: str
    model: dict[str, Any] = field(default_factory=dict)
    batch_size: int = 32
    seed_source: str | None = None
    quality_threshold: QualityGrade = QualityGrade.MODERATE
    diversity_settings: dict[str, Any] = field(default_factory=dict)
    temperature: float = 0.7
    top_p: float = 0.95
    max_tokens: int = 2048
    validation_rules: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> GeneratorConfig:
        missing = [k for k in ("generator", "count", "output_path") if k not in data]
        if missing:
            raise GeneratorConfigError(f"Config missing required keys: {missing}")
        gen = data["generator"]
        if gen not in SUPPORTED_GENERATORS:
            raise GeneratorConfigError(
                f"Unknown generator {gen!r}. Supported: {SUPPORTED_GENERATORS}"
            )
        count = int(data["count"])
        if count < 1:
            raise GeneratorConfigError(f"count must be >= 1, got {count}")

        qt_raw = str(data.get("quality_threshold", "MODERATE")).upper()
        try:
            quality = QualityGrade(qt_raw)
        except ValueError as e:
            raise GeneratorConfigError(f"Invalid quality_threshold: {qt_raw}") from e

        return cls(
            generator=gen,
            count=count,
            output_path=str(data["output_path"]),
            model=dict(data.get("model") or {}),
            batch_size=int(data.get("batch_size", 32)),
            seed_source=data.get("seed_source"),
            quality_threshold=quality,
            diversity_settings=dict(data.get("diversity_settings") or {}),
            temperature=float(data.get("temperature", 0.7)),
            top_p=float(data.get("top_p", 0.95)),
            max_tokens=int(data.get("max_tokens", 2048)),
            validation_rules=dict(data.get("validation_rules") or {}),
            raw=dict(data),
        )

    @classmethod
    def load(cls, path: Path | str) -> GeneratorConfig:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Config not found: {p}")
        with p.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if not isinstance(data, dict):
            raise GeneratorConfigError(f"Config root must be a mapping, got {type(data).__name__}")
        return cls.from_dict(data)


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------


@dataclass
class GenerationResult:
    """Bundle returned by :meth:`SyntheticDataGenerator.generate`."""

    records: list[CanonicalRecord]
    generator_name: str
    recursion_depth: int
    examples_generated: int
    override_flag: bool
    total_cost: float
    prov_record: ProvRecord | None = None
    config: GeneratorConfig | None = None
    duration_seconds: float = 0.0

    @property
    def count(self) -> int:
        return len(self.records)


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------


_ORCA_TEMPLATE = """You are a teacher model producing a detailed, reasoning-rich response.

System message (adopt this persona): "{system_message}"

Task: {task}

Produce a response that:
- explains the answer step-by-step
- surfaces implicit reasoning the original instruction expects
- stays faithful to any ground-truth constraints

Return a JSON object with keys "instruction", "response", "reasoning_trace".
Return only the JSON, no prose."""

_ORCA2_TEMPLATE = """You are a teacher model applying the "{strategy}" reasoning strategy.

Strategy guide: {strategy_description}

Task: {task}

Produce a response that embodies the strategy. Return a JSON object with keys
"instruction", "response", "reasoning_trace", "strategy".
Return only the JSON, no prose."""

_PHI_TEMPLATE = """You are composing a textbook-quality training example on the topic below.
The example must be self-contained, accurate, and pedagogically clear.

Topic: {topic}

Return a JSON object with keys "instruction", "response". The instruction
should be a question a learner might ask; the response should be a clear,
complete explanation. Return only the JSON, no prose."""

_PERSONAHUB_TEMPLATE = """You are rewriting an instruction from the perspective of a specific persona.

Persona: {persona}

Original instruction: {instruction}

Produce one instruction that this persona would naturally ask, plus a response
tailored to their context. Return a JSON object with keys "instruction",
"response", "persona". Return only the JSON, no prose."""

_STAR_GEN_TEMPLATE = """You are a self-taught reasoner. Given the seed pair below, produce an
augmented version with a step-by-step reasoning trace leading to the same
final answer. Then estimate whether the reasoning trace is correct.

Seed:
{seed_json}

Return a JSON object with keys "instruction", "response", "reasoning_trace",
"rationale_correct" (boolean). Return only the JSON, no prose."""

_REST_TEMPLATE = """You are producing an improved synthetic example in a Reinforced Self-Training
(ReST) outer-loop iteration. The prior-iteration seed is provided.

Prior seed:
{seed_json}

Produce a better-quality, more reliable version. Return a JSON object with
keys "instruction", "response", "reasoning_trace", "improvement_notes".
Return only the JSON, no prose."""


# Reasoning-strategy pool for orca-2 (REF-435)
_ORCA2_STRATEGIES = {
    "step-by-step": "Walk through the problem one step at a time, showing every calculation.",
    "direct": "Answer directly with minimal preamble; cite the load-bearing fact.",
    "cautious": "Flag ambiguities and edge cases before committing to an answer.",
}

_DEFAULT_PERSONAS = [
    "a high-school student new to the topic",
    "a domain expert reviewing for rigor",
    "a skeptical engineer debugging a failure",
    "a journalist translating the topic for a general audience",
    "a teacher preparing a lesson plan",
]


# ---------------------------------------------------------------------------
# SyntheticDataGenerator
# ---------------------------------------------------------------------------


class SyntheticDataGenerator:
    """Large-batch, config-driven synthesis with a Model Collapse recursion guard."""

    def __init__(
        self,
        llm_client: Any,
        config_path: Path | str | GeneratorConfig,
        topology: MemoryTopology | None = None,
    ) -> None:
        self.llm = llm_client
        self.topology = topology
        self.config = (
            config_path
            if isinstance(config_path, GeneratorConfig)
            else GeneratorConfig.load(config_path)
        )

    # -- Public API ---------------------------------------------------------

    def generate(
        self,
        seed_records: list[CanonicalRecord] | None = None,
        allow_recursive_synthetic: bool = False,
    ) -> GenerationResult:
        """Run the configured generator and return a :class:`GenerationResult`."""
        cfg = self.config
        seeds = list(seed_records or [])

        # Step 1 — Model Collapse guard
        max_depth = _max_seed_depth(seeds)
        override_flag = False
        offending = [s.id for s in seeds if s.metadata.synthetic_depth >= 1]
        if offending:
            if not allow_recursive_synthetic:
                raise ModelCollapseGuardError(
                    _MODEL_COLLAPSE_MSG,
                    max_depth=max_depth,
                    offending_seeds=offending,
                )
            override_flag = True
            warnings.warn(
                f"Recursive synthetic generation explicitly allowed "
                f"(override_flag=True, {len(offending)} seed(s) at depth>={max_depth}). "
                f"See REF-446 / ADR-022 D10.",
                stacklevel=2,
            )

        # Step 2 — Dispatch
        prov = ProvRecord()
        t0 = time.monotonic()
        rng = random.Random()

        dispatch = {
            "orca": self._generate_orca,
            "orca-2": self._generate_orca_2,
            "phi": self._generate_phi,
            "personahub": self._generate_personahub,
            "star": self._generate_star,
            "rest": self._generate_rest,
        }
        generator_fn = dispatch[cfg.generator]

        records, cost = self._batched(
            lambda batch_seeds, batch_count: generator_fn(
                seeds=batch_seeds, count=batch_count, prov=prov, rng=rng
            ),
            seeds=seeds,
            total_count=cfg.count,
            batch_size=cfg.batch_size,
        )

        recursion_depth = max_depth + 1 if seeds else 1
        for r in records:
            # Enforce depth stamp (defensive — generator functions also set it)
            r.metadata.synthetic_depth = max(
                r.metadata.synthetic_depth, recursion_depth
            )

        duration = time.monotonic() - t0

        # Step 3 — memory-log event
        if self.topology is not None:
            try:
                event = SyntheticGenerateEvent(
                    consumer=self.topology.namespace,
                    actor=AGENT_NAME,
                    seed_examples=[s.id for s in seeds],
                    generator_agent=AGENT_NAME,
                    recursion_depth=recursion_depth,
                    quality_grade=_median_grade(records).value,
                    examples_generated=len(records),
                    override_flag=override_flag,
                )
                log_to_consumer(event, self.topology)
            except Exception:  # pragma: no cover — log best-effort
                pass

        return GenerationResult(
            records=records,
            generator_name=cfg.generator,
            recursion_depth=recursion_depth,
            examples_generated=len(records),
            override_flag=override_flag,
            total_cost=cost,
            prov_record=prov,
            config=cfg,
            duration_seconds=duration,
        )

    # -- Batched dispatch ---------------------------------------------------

    def _batched(
        self,
        fn: Any,
        *,
        seeds: list[CanonicalRecord],
        total_count: int,
        batch_size: int,
    ) -> tuple[list[CanonicalRecord], float]:
        """Invoke ``fn(seeds, n)`` in chunks until ``total_count`` attempts spent.

        Each batch consumes at most ``batch_size`` attempts; the generator may
        return fewer records than attempted (e.g., STaR reward filtering).
        Generation stops when:

        - ``total_count`` attempts have been made, or
        - ``fn`` returned zero records in a batch (avoid infinite loop).

        ``total_count`` bounds attempts, not accepted output — this matches
        "budget exhaustion" semantics from the SKILL.md.
        """
        records: list[CanonicalRecord] = []
        total_cost = 0.0
        attempts_remaining = total_count
        while attempts_remaining > 0:
            n = min(batch_size, attempts_remaining)
            batch_recs, batch_cost = fn(seeds, n)
            records.extend(batch_recs)
            total_cost += batch_cost
            attempts_remaining -= n
            if not batch_recs:
                # Generator returned nothing — stop to avoid infinite loop
                break
        return records, total_cost

    # -- Generator implementations -----------------------------------------

    def _generate_orca(
        self,
        seeds: list[CanonicalRecord],
        count: int,
        prov: ProvRecord,
        rng: random.Random,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-470 — system-message-driven explanation distillation."""
        records: list[CanonicalRecord] = []
        cost = 0.0
        system_messages = [
            "You are a patient teacher who shows every step.",
            "You are a domain expert cited for rigor and precision.",
            "You are a mentor who anticipates follower confusion.",
        ]
        for i in range(count):
            seed = seeds[i % len(seeds)] if seeds else None
            task = seed.input.user if seed else f"Explain concept #{i} clearly."
            system_msg = system_messages[i % len(system_messages)]
            prompt = _ORCA_TEMPLATE.format(system_message=system_msg, task=task)
            data, call_cost = self._json_call(prompt)
            cost += call_cost
            item = _expect_keys(data, {"instruction", "response"})
            rec = _build_synthetic_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                reasoning_trace=_maybe(item, "reasoning_trace"),
                task_type=TaskType.INSTRUCTION_FOLLOWING,
                seeds=[seed] if seed else [],
                pattern="orca",
                model=self._model_tag(),
                temperature=self.config.temperature,
                system=system_msg,
            )
            _record_prov(prov, rec, [seed] if seed else [], pattern="orca")
            records.append(rec)
        return records, cost

    def _generate_orca_2(
        self,
        seeds: list[CanonicalRecord],
        count: int,
        prov: ProvRecord,
        rng: random.Random,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-435 — reasoning-strategy-aware distillation."""
        records: list[CanonicalRecord] = []
        cost = 0.0
        strategies = list(_ORCA2_STRATEGIES.keys())
        for i in range(count):
            seed = seeds[i % len(seeds)] if seeds else None
            task = seed.input.user if seed else f"Explain concept #{i} clearly."
            strategy = strategies[i % len(strategies)]
            prompt = _ORCA2_TEMPLATE.format(
                strategy=strategy,
                strategy_description=_ORCA2_STRATEGIES[strategy],
                task=task,
            )
            data, call_cost = self._json_call(prompt)
            cost += call_cost
            item = _expect_keys(data, {"instruction", "response"})
            rec = _build_synthetic_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                reasoning_trace=_maybe(item, "reasoning_trace"),
                task_type=TaskType.REASONING,
                seeds=[seed] if seed else [],
                pattern="orca-2",
                model=self._model_tag(),
                temperature=self.config.temperature,
                reasoning_strategy=strategy,
            )
            _record_prov(prov, rec, [seed] if seed else [], pattern="orca-2")
            records.append(rec)
        return records, cost

    def _generate_phi(
        self,
        seeds: list[CanonicalRecord],
        count: int,
        prov: ProvRecord,
        rng: random.Random,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-436/437 — textbook-quality curriculum generation (no seeds required)."""
        records: list[CanonicalRecord] = []
        cost = 0.0
        topics = self._load_topic_outline() or [
            f"fundamental concept #{i + 1}" for i in range(count)
        ]
        for i in range(count):
            topic = topics[i % len(topics)]
            prompt = _PHI_TEMPLATE.format(topic=topic)
            data, call_cost = self._json_call(prompt)
            cost += call_cost
            item = _expect_keys(data, {"instruction", "response"})
            rec = _build_synthetic_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                task_type=TaskType.INSTRUCTION_FOLLOWING,
                seeds=[],
                pattern="phi",
                model=self._model_tag(),
                temperature=self.config.temperature,
                topic=topic,
            )
            _record_prov(prov, rec, [], pattern="phi")
            records.append(rec)
        return records, cost

    def _generate_personahub(
        self,
        seeds: list[CanonicalRecord],
        count: int,
        prov: ProvRecord,
        rng: random.Random,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-448 — persona-driven instruction diversity."""
        records: list[CanonicalRecord] = []
        cost = 0.0
        personas = self._load_personas() or _DEFAULT_PERSONAS
        for i in range(count):
            seed = seeds[i % len(seeds)] if seeds else None
            base_instruction = (
                seed.input.user if seed else "Explain a concept of your choosing."
            )
            persona = personas[i % len(personas)]
            prompt = _PERSONAHUB_TEMPLATE.format(
                persona=persona, instruction=base_instruction
            )
            data, call_cost = self._json_call(prompt)
            cost += call_cost
            item = _expect_keys(data, {"instruction", "response"})
            rec = _build_synthetic_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                task_type=TaskType.INSTRUCTION_FOLLOWING,
                seeds=[seed] if seed else [],
                pattern="personahub",
                model=self._model_tag(),
                temperature=self.config.temperature,
                persona=persona,
            )
            _record_prov(prov, rec, [seed] if seed else [], pattern="personahub")
            records.append(rec)
        return records, cost

    def _generate_star(
        self,
        seeds: list[CanonicalRecord],
        count: int,
        prov: ProvRecord,
        rng: random.Random,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-445 — self-taught reasoner with reward filtering."""
        records: list[CanonicalRecord] = []
        cost = 0.0
        if not seeds:
            raise GeneratorConfigError("STaR requires at least one seed record")
        for i in range(count):
            seed = seeds[i % len(seeds)]
            seed_json = json.dumps(
                {"instruction": seed.input.user, "response": _assistant_text(seed)},
                indent=2,
            )
            prompt = _STAR_GEN_TEMPLATE.format(seed_json=seed_json)
            data, call_cost = self._json_call(prompt)
            cost += call_cost
            item = _expect_keys(
                data, {"instruction", "response", "reasoning_trace"}
            )
            # Reward filter (REF-445): drop rationales flagged as incorrect
            if bool(item.get("rationale_correct", True)) is False:
                continue
            rec = _build_synthetic_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                reasoning_trace=str(item["reasoning_trace"]),
                task_type=TaskType.REASONING,
                seeds=[seed],
                pattern="star",
                model=self._model_tag(),
                temperature=self.config.temperature,
            )
            _record_prov(prov, rec, [seed], pattern="star")
            records.append(rec)
        return records, cost

    def _generate_rest(
        self,
        seeds: list[CanonicalRecord],
        count: int,
        prov: ProvRecord,
        rng: random.Random,
    ) -> tuple[list[CanonicalRecord], float]:
        """REF-456 — Reinforced Self-Training outer-loop iteration.

        This is the canonical legitimate case for the recursive-synthetic
        override, because iteration N's output becomes iteration N+1's seeds.
        """
        records: list[CanonicalRecord] = []
        cost = 0.0
        if not seeds:
            raise GeneratorConfigError("ReST requires at least one seed record")
        for i in range(count):
            seed = seeds[i % len(seeds)]
            seed_json = json.dumps(
                {"instruction": seed.input.user, "response": _assistant_text(seed)},
                indent=2,
            )
            prompt = _REST_TEMPLATE.format(seed_json=seed_json)
            data, call_cost = self._json_call(prompt)
            cost += call_cost
            item = _expect_keys(data, {"instruction", "response"})
            rec = _build_synthetic_record(
                user=str(item["instruction"]),
                assistant=str(item["response"]),
                reasoning_trace=_maybe(item, "reasoning_trace"),
                task_type=TaskType.REASONING,
                seeds=[seed],
                pattern="rest",
                model=self._model_tag(),
                temperature=self.config.temperature,
                improvement_notes=_maybe(item, "improvement_notes"),
            )
            _record_prov(prov, rec, [seed], pattern="rest")
            records.append(rec)
        return records, cost

    # -- Transport helpers -------------------------------------------------

    def _json_call(self, prompt: str) -> tuple[dict[str, Any], float]:
        before = float(getattr(self.llm, "total_cost", 0.0))
        messages = [{"role": "user", "content": prompt}]
        data = self.llm.complete_json(
            messages=messages,
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens,
        )
        after = float(getattr(self.llm, "total_cost", 0.0))
        return data, max(0.0, after - before)

    def _model_tag(self) -> str:
        """Best-effort model identifier for metadata stamping."""
        teacher = self.config.model.get("teacher") if self.config.model else None
        if teacher:
            return str(teacher)
        return getattr(self.llm, "model", "unknown")

    # -- Config-side resources ---------------------------------------------

    def _load_personas(self) -> list[str] | None:
        ds = self.config.diversity_settings
        path = ds.get("persona_pool_path")
        if not path:
            return None
        p = Path(path)
        if not p.exists():
            return None
        with p.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if isinstance(data, list):
            return [str(x) for x in data]
        if isinstance(data, dict):
            pool = data.get("personas")
            if isinstance(pool, list):
                return [str(x) for x in pool]
        return None

    def _load_topic_outline(self) -> list[str] | None:
        ds = self.config.diversity_settings
        path = ds.get("topic_outline_path")
        if not path:
            return None
        p = Path(path)
        if not p.exists():
            return None
        with p.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if isinstance(data, list):
            return [str(x) for x in data]
        if isinstance(data, dict):
            topics = data.get("topics")
            if isinstance(topics, list):
                return [str(x) for x in topics]
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _max_seed_depth(seeds: list[CanonicalRecord]) -> int:
    return max((s.metadata.synthetic_depth for s in seeds), default=0)


def _median_grade(records: list[CanonicalRecord]) -> QualityGrade:
    order = {
        QualityGrade.VERY_LOW: 0,
        QualityGrade.LOW: 1,
        QualityGrade.MODERATE: 2,
        QualityGrade.HIGH: 3,
    }
    if not records:
        return QualityGrade.MODERATE
    grades = sorted(
        (r.metadata.quality_grade for r in records), key=lambda g: order[g]
    )
    return grades[len(grades) // 2]


def _assistant_text(rec: CanonicalRecord) -> str:
    if rec.is_preference():
        return rec.require_preference_output().chosen
    return rec.require_standard_output().assistant


def _expect_keys(data: Any, keys: set[str]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise SyntheticDataError(
            f"Expected JSON object, got {type(data).__name__}: {data!r}"
        )
    missing = keys - set(data.keys())
    if missing:
        raise SyntheticDataError(f"Response missing keys {missing}: {data!r}")
    return data


def _maybe(d: dict[str, Any], key: str) -> str | None:
    v = d.get(key)
    return None if v is None else str(v)


def _build_synthetic_record(
    *,
    user: str,
    assistant: str,
    task_type: TaskType,
    seeds: list[CanonicalRecord],
    pattern: str,
    model: str,
    temperature: float,
    reasoning_trace: str | None = None,
    system: str | None = None,
    **extra: Any,
) -> CanonicalRecord:
    max_seed_depth = _max_seed_depth(seeds)
    synthetic_depth = max_seed_depth + 1

    # Merge seed domains (unique, order-preserving)
    domain: list[str] = []
    for s in seeds:
        for d in s.metadata.domain:
            if d not in domain:
                domain.append(d)

    metadata_kwargs: dict[str, Any] = {
        "quality_grade": QualityGrade.MODERATE,
        "license": _common_license(seeds),
        "provenance_id": f"prov-{pattern}-{uuid.uuid4().hex[:12]}",
        "created_at": now_iso(),
        "domain": domain,
        "source_refs": [s.id for s in seeds],
        "created_by_agent": AGENT_NAME,
        "synthetic": True,
        "synthetic_depth": synthetic_depth,
        "generation_pattern": pattern,
        "generation_model": model,
        "generation_temperature": temperature,
    }
    # Fold any pattern-specific extras onto metadata (extra="allow" is set)
    for k, v in extra.items():
        if v is not None:
            metadata_kwargs[k] = v

    metadata = ExampleMetadata(**metadata_kwargs)
    return CanonicalRecord(
        task_type=task_type,
        input=InputPayload(user=user, system=system),
        output=OutputPayload(assistant=assistant, reasoning_trace=reasoning_trace),
        metadata=metadata,
    )


def _common_license(seeds: list[CanonicalRecord]) -> str:
    if not seeds:
        return "CC-BY-4.0"
    licenses = {s.metadata.license for s in seeds}
    if len(licenses) == 1:
        return next(iter(licenses))
    return seeds[0].metadata.license


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


class SyntheticDataError(RuntimeError):
    """Raised when a generator response cannot be parsed into a record."""
