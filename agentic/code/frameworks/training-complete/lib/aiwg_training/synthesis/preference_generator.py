"""Preference pair generation for DPO/KTO/ORPO/SimPO training (#839).

Given candidate ``CanonicalRecord`` pairs (two responses to the same prompt),
pick the ``chosen`` / ``rejected`` side via one of three modes:

* ``llm-judge`` — rank-model elicits preference + confidence + rationale
  (RLAIF / UltraFeedback pattern). Opus is default for ambiguous decisions;
  Sonnet can be selected via ``model`` override.
* ``rule-based`` — 5 deterministic heuristics with weighted scoring.
* ``human`` — interactive ``print()``/``input()`` with pluggable callback.

Each surviving pair becomes a new ``CanonicalRecord`` with
``task_type=PREFERENCE`` and ``output=PreferenceOutput``. Pairs below
``min_confidence`` are dropped. The run emits a ``preference-generate`` event
to the consumer's memory log.

See:
    - SKILL: ``skills/preference-generator/SKILL.md``
    - Export formats: :mod:`aiwg_training.synthesis.preference_export`
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Callable, Literal

from aiwg_training.core import MemoryTopology, log_to_consumer, now_iso
from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    PreferenceGenerateEvent,
    PreferenceOutput,
    QualityGrade,
    TaskType,
)
from aiwg_training.synthesis.llm_client import (
    MODEL_OPUS,
    MODEL_SONNET,
    JSONParseError,
    LLMClient,
)
from aiwg_training.synthesis.mock_client import MockLLMClient

JudgeMode = Literal["llm-judge", "rule-based", "human"]

# --- Judge rubric (UltraFeedback-lite) ------------------------------------

_SYSTEM_PROMPT_JUDGE = """You are a rigorous preference judge for training data.

Evaluate two candidate responses to the same prompt and pick the better one
based on this rubric, applied in order:

1. Correctness — factually accurate, follows instruction, no hallucination.
2. Clarity — well-structured, unambiguous, free of filler.
3. Completeness — covers required aspects without padding.
4. Safety — no unsafe advice, no PII leaks, no harmful content.

If the two candidates are genuinely indistinguishable, output ``tie``.

Output ONLY minified JSON with this exact shape:
{"chosen": "a" | "b" | "tie", "confidence": <float 0.0-1.0>, "rationale": "<one sentence>"}
"""


# --- Rule-based heuristics ------------------------------------------------

# Simple pattern for "source claim without actual source_refs"
_SOURCE_CLAIM_PATTERN = re.compile(
    r"(according to|source:|as (?:cited|referenced) in|per the|\bref\.?|citation)",
    re.IGNORECASE,
)

# Terminal punctuation (considers sentence completion).
_TERMINAL_PUNCT = (".", "!", "?", '"', "'", ")", "]", "`")


@dataclass
class JudgementResult:
    """Normalized output of any judge mode for a single pair."""

    winner: Literal["a", "b", "tie"]
    confidence: float
    rationale: str
    model_used: str | None = None


@dataclass
class PreferenceResult:
    """Outcome of a full ``generate()`` / ``generate_from_pool()`` call."""

    records: list[CanonicalRecord] = field(default_factory=list)
    """Accepted preference records (task_type=PREFERENCE)."""

    rationale_notes: list[CanonicalRecord] = field(default_factory=list)
    """Optional companion analysis notes linked via ``rationale_note_id``."""

    dropped_low_confidence: int = 0
    dropped_ties: int = 0
    confidence_distribution: dict[str, int] = field(default_factory=dict)
    mode: str = "llm-judge"

    @property
    def pair_count(self) -> int:
        return len(self.records)


# --- Main class -----------------------------------------------------------


class PreferenceGenerator:
    """Generate preference pairs from candidate tuples or a pool."""

    def __init__(
        self,
        llm_client: LLMClient | None = None,
        topology: MemoryTopology | None = None,
        *,
        model: str = MODEL_OPUS,
        human_prompt_callback: Callable[[CanonicalRecord, CanonicalRecord], str] | None = None,
    ) -> None:
        self.llm_client: LLMClient = llm_client if llm_client is not None else MockLLMClient()
        self.topology = topology
        self.model = model
        self.human_prompt_callback = human_prompt_callback

    # ---------------------------------------------------------------- public

    def generate(
        self,
        candidates: list[tuple[CanonicalRecord, CanonicalRecord]],
        mode: JudgeMode = "llm-judge",
        min_confidence: float = 0.7,
        target_format: str = "dpo",
        *,
        capture_rationale_notes: bool = True,
    ) -> PreferenceResult:
        """Produce preference records from explicit candidate pairs.

        Each tuple is ``(candidate_a, candidate_b)`` — both already scored
        against the same prompt. The winner becomes ``chosen``, loser becomes
        ``rejected``. Pairs where the prompts differ are rejected with a
        ``ValueError`` — callers should prefilter.
        """
        result = PreferenceResult(mode=mode)
        source_example_ids: list[str] = []

        for cand_a, cand_b in candidates:
            self._assert_same_prompt(cand_a, cand_b)
            source_example_ids.extend([cand_a.id, cand_b.id])

            judgement = self._judge(cand_a, cand_b, mode=mode)

            # Drop ties and low-confidence pairs.
            if judgement.winner == "tie":
                result.dropped_ties += 1
                self._bump_distribution(result.confidence_distribution, judgement.confidence)
                continue
            if judgement.confidence < min_confidence:
                result.dropped_low_confidence += 1
                self._bump_distribution(result.confidence_distribution, judgement.confidence)
                continue

            chosen_rec, rejected_rec = (
                (cand_a, cand_b) if judgement.winner == "a" else (cand_b, cand_a)
            )

            rationale_note: CanonicalRecord | None = None
            if capture_rationale_notes and judgement.rationale:
                rationale_note = self._build_rationale_note(
                    chosen=chosen_rec,
                    rejected=rejected_rec,
                    rationale=judgement.rationale,
                    mode=mode,
                    confidence=judgement.confidence,
                )
                result.rationale_notes.append(rationale_note)

            pref_record = self._build_preference_record(
                chosen=chosen_rec,
                rejected=rejected_rec,
                confidence=judgement.confidence,
                rationale_note_id=rationale_note.id if rationale_note else None,
                target_format=target_format,
                mode=mode,
            )
            result.records.append(pref_record)
            self._bump_distribution(result.confidence_distribution, judgement.confidence)

        # Emit preference-generate event via memory log (if topology provided).
        if self.topology is not None:
            self._emit_event(result, source_example_ids, target_format)

        return result

    def generate_from_pool(
        self,
        pool: list[CanonicalRecord],
        pair_count: int,
        mode: JudgeMode = "llm-judge",
        min_confidence: float = 0.7,
        target_format: str = "dpo",
        *,
        capture_rationale_notes: bool = True,
    ) -> PreferenceResult:
        """Derive pairs from a pool by grouping candidates with identical prompts."""
        groups: dict[str, list[CanonicalRecord]] = {}
        for rec in pool:
            prompt_key = rec.input.user
            groups.setdefault(prompt_key, []).append(rec)

        pairs: list[tuple[CanonicalRecord, CanonicalRecord]] = []
        for prompt_key, recs in groups.items():
            if len(recs) < 2:
                continue
            # Pair adjacent items (round-robin style): (0,1), (2,3), ...
            # Grouping by quality-grade contrast would be ideal, but the
            # prompt pool alone is already a reasonable default.
            for i in range(0, len(recs) - 1, 2):
                pairs.append((recs[i], recs[i + 1]))
                if len(pairs) >= pair_count:
                    break
            if len(pairs) >= pair_count:
                break

        pairs = pairs[:pair_count]
        return self.generate(
            pairs,
            mode=mode,
            min_confidence=min_confidence,
            target_format=target_format,
            capture_rationale_notes=capture_rationale_notes,
        )

    # ---------------------------------------------------------------- judge

    def _judge(
        self,
        cand_a: CanonicalRecord,
        cand_b: CanonicalRecord,
        *,
        mode: JudgeMode,
    ) -> JudgementResult:
        if mode == "llm-judge":
            return self._judge_with_llm(cand_a, cand_b)
        if mode == "rule-based":
            return self._judge_by_rules(cand_a, cand_b)
        if mode == "human":
            return self._judge_with_human(cand_a, cand_b)
        raise ValueError(f"Unknown judge mode: {mode!r}")

    # -- llm-judge ---------

    def _judge_with_llm(
        self,
        cand_a: CanonicalRecord,
        cand_b: CanonicalRecord,
        *,
        model: str | None = None,
    ) -> JudgementResult:
        chosen_model = model or self._select_model(cand_a, cand_b)
        prompt = self._build_judge_prompt(cand_a, cand_b)
        messages = [{"role": "user", "content": prompt}]

        # Allow callers to pre-set the client's model; swap it only if the
        # client exposes a ``model`` attribute we can toggle.
        prior_model = getattr(self.llm_client, "model", None)
        try:
            if prior_model is not None:
                self.llm_client.model = chosen_model  # type: ignore[attr-defined]
            try:
                parsed = self.llm_client.complete_json(
                    messages=messages,
                    system=_SYSTEM_PROMPT_JUDGE,
                    schema_hint={
                        "chosen": "a | b | tie",
                        "confidence": "0.0-1.0",
                        "rationale": "one-sentence string",
                    },
                    temperature=0.0,
                )
            except JSONParseError:
                return JudgementResult(
                    winner="tie",
                    confidence=0.0,
                    rationale="judge returned invalid JSON after retries",
                    model_used=chosen_model,
                )
        finally:
            if prior_model is not None:
                self.llm_client.model = prior_model  # type: ignore[attr-defined]

        if not isinstance(parsed, dict):
            return JudgementResult(
                winner="tie",
                confidence=0.0,
                rationale="judge returned non-object JSON",
                model_used=chosen_model,
            )

        winner_raw = str(parsed.get("chosen", "tie")).strip().lower()
        if winner_raw not in {"a", "b", "tie"}:
            winner_raw = "tie"
        try:
            confidence = float(parsed.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        rationale = str(parsed.get("rationale", "")).strip()

        return JudgementResult(
            winner=winner_raw,  # type: ignore[arg-type]
            confidence=confidence,
            rationale=rationale,
            model_used=chosen_model,
        )

    def _select_model(self, cand_a: CanonicalRecord, cand_b: CanonicalRecord) -> str:
        """Opus for ambiguous cases, Sonnet otherwise.

        "Ambiguous" = either candidate has LOW/VERY_LOW grade, or the two
        grades disagree significantly (e.g., HIGH vs LOW).
        """
        grade_a = cand_a.metadata.quality_grade
        grade_b = cand_b.metadata.quality_grade
        low_grades = {QualityGrade.LOW, QualityGrade.VERY_LOW}
        if grade_a in low_grades or grade_b in low_grades:
            return self.model  # default is Opus
        if grade_a != grade_b:
            return self.model
        return MODEL_SONNET

    def _build_judge_prompt(
        self,
        cand_a: CanonicalRecord,
        cand_b: CanonicalRecord,
    ) -> str:
        resp_a = _response_text(cand_a)
        resp_b = _response_text(cand_b)
        return (
            f"PROMPT:\n{cand_a.input.user}\n\n"
            f"CANDIDATE A:\n{resp_a}\n\n"
            f"CANDIDATE B:\n{resp_b}\n\n"
            "Return ONLY the JSON object described in the system prompt."
        )

    # -- rule-based --------

    def _judge_by_rules(
        self,
        cand_a: CanonicalRecord,
        cand_b: CanonicalRecord,
    ) -> JudgementResult:
        """Apply 5 weighted heuristics; return winner + bounded confidence."""
        score_a = 0.0
        score_b = 0.0
        reasons: list[str] = []

        text_a = _response_text(cand_a)
        text_b = _response_text(cand_b)

        # (1) Shorter wins when both correct (length diff > 50 chars): shorter +1
        diff = len(text_a) - len(text_b)
        if abs(diff) > 50:
            if diff < 0:
                score_a += 1.0
                reasons.append("A shorter (>50 chars)")
            else:
                score_b += 1.0
                reasons.append("B shorter (>50 chars)")

        # (2) Cites source wins (+2 if source_refs in metadata)
        refs_a = bool(cand_a.metadata.source_refs)
        refs_b = bool(cand_b.metadata.source_refs)
        if refs_a and not refs_b:
            score_a += 2.0
            reasons.append("A cites sources")
        elif refs_b and not refs_a:
            score_b += 2.0
            reasons.append("B cites sources")

        # (3) Reasoning-trace present wins (+1 if output.reasoning_trace)
        trace_a = _has_reasoning_trace(cand_a)
        trace_b = _has_reasoning_trace(cand_b)
        if trace_a and not trace_b:
            score_a += 1.0
            reasons.append("A has reasoning trace")
        elif trace_b and not trace_a:
            score_b += 1.0
            reasons.append("B has reasoning trace")

        # (4) No-hallucination over hallucination: response claims source exists
        #     but no source_refs → -2
        if _claims_source_without_refs(text_a, refs_a):
            score_a -= 2.0
            reasons.append("A claims source without refs")
        if _claims_source_without_refs(text_b, refs_b):
            score_b -= 2.0
            reasons.append("B claims source without refs")

        # (5) Coherent over truncated (no terminal punctuation → -1)
        if not _ends_coherently(text_a):
            score_a -= 1.0
            reasons.append("A truncated")
        if not _ends_coherently(text_b):
            score_b -= 1.0
            reasons.append("B truncated")

        if score_a == score_b:
            winner: Literal["a", "b", "tie"] = "tie"
            confidence = 0.0
        elif score_a > score_b:
            winner = "a"
            confidence = _rule_confidence(score_a - score_b)
        else:
            winner = "b"
            confidence = _rule_confidence(score_b - score_a)

        rationale = "; ".join(reasons) if reasons else "no heuristic triggered"
        return JudgementResult(
            winner=winner,
            confidence=confidence,
            rationale=f"rule-based: {rationale}",
            model_used="rule-based",
        )

    # -- human -------------

    def _judge_with_human(
        self,
        cand_a: CanonicalRecord,
        cand_b: CanonicalRecord,
    ) -> JudgementResult:
        """Interactive prompt; falls through to ``human_prompt_callback`` if set."""
        if self.human_prompt_callback is not None:
            choice = self.human_prompt_callback(cand_a, cand_b).strip().lower()
        else:
            print("=" * 60)
            print(f"PROMPT:\n{cand_a.input.user}")
            print("-" * 60)
            print("CANDIDATE A:")
            print(_response_text(cand_a))
            print("-" * 60)
            print("CANDIDATE B:")
            print(_response_text(cand_b))
            print("=" * 60)
            choice = input("Prefer [a/b/skip]: ").strip().lower()

        if choice == "a":
            return JudgementResult(
                winner="a", confidence=0.95, rationale="human selected A", model_used="human",
            )
        if choice == "b":
            return JudgementResult(
                winner="b", confidence=0.95, rationale="human selected B", model_used="human",
            )
        return JudgementResult(
            winner="tie", confidence=0.0, rationale="human skipped", model_used="human",
        )

    # ---------------------------------------------------------------- build

    def _build_preference_record(
        self,
        *,
        chosen: CanonicalRecord,
        rejected: CanonicalRecord,
        confidence: float,
        rationale_note_id: str | None,
        target_format: str,
        mode: str,
    ) -> CanonicalRecord:
        """Wrap a judged pair in a PREFERENCE CanonicalRecord."""
        chosen_text = _response_text(chosen)
        rejected_text = _response_text(rejected)

        pref_output = PreferenceOutput(
            chosen=chosen_text,
            rejected=rejected_text,
            confidence=confidence,
            rationale_note_id=rationale_note_id,
        )

        # Provenance: track source example IDs on metadata (extra=allow).
        metadata = ExampleMetadata(
            quality_grade=chosen.metadata.quality_grade,
            license=chosen.metadata.license,
            provenance_id=str(uuid.uuid4()),
            created_at=now_iso(),
            domain=list(chosen.metadata.domain or []),
            source_refs=list(dict.fromkeys(
                [*chosen.metadata.source_refs, *rejected.metadata.source_refs]
            )),
            created_by_agent=f"preference-generator/{mode}",
            synthetic=True,
            synthetic_depth=max(chosen.metadata.synthetic_depth, rejected.metadata.synthetic_depth) + 1,
        )
        # Record the pair provenance (out-of-band via pydantic extra fields).
        metadata_extras = {
            "chosen_source_id": chosen.id,
            "rejected_source_id": rejected.id,
            "target_format": target_format,
            "judge_mode": mode,
        }

        record = CanonicalRecord(
            task_type=TaskType.PREFERENCE,
            input=InputPayload(user=chosen.input.user, system=chosen.input.system),
            output=pref_output,
            metadata=metadata,
        )
        # Attach extras via model_extra (pydantic v2 preserves via ConfigDict(extra='allow')).
        for key, val in metadata_extras.items():
            setattr(record.metadata, key, val)
        return record

    def _build_rationale_note(
        self,
        *,
        chosen: CanonicalRecord,
        rejected: CanonicalRecord,
        rationale: str,
        mode: str,
        confidence: float,
    ) -> CanonicalRecord:
        """Capture judge rationale as a standalone COMPLETION note."""
        note_body = (
            f"Preference judgment ({mode}, confidence={confidence:.2f}):\n"
            f"Prompt: {chosen.input.user[:200]}\n"
            f"Chosen: {chosen.id}\n"
            f"Rejected: {rejected.id}\n"
            f"Rationale: {rationale}"
        )
        return CanonicalRecord(
            task_type=TaskType.COMPLETION,
            input=InputPayload(user=f"rationale for preference between {chosen.id} and {rejected.id}"),
            output=OutputPayload(assistant=note_body),
            metadata=ExampleMetadata(
                quality_grade=QualityGrade.MODERATE,
                license=chosen.metadata.license,
                provenance_id=str(uuid.uuid4()),
                created_at=now_iso(),
                domain=list(chosen.metadata.domain or []),
                created_by_agent=f"preference-generator/{mode}",
                synthetic=True,
                synthetic_depth=1,
            ),
        )

    # ---------------------------------------------------------------- event

    def _emit_event(
        self,
        result: PreferenceResult,
        source_example_ids: list[str],
        target_format: str,
    ) -> None:
        assert self.topology is not None  # noqa: S101
        event = PreferenceGenerateEvent(
            consumer=self.topology.namespace or "training-complete",
            pair_count=result.pair_count,
            source_examples=sorted(set(source_example_ids)),
            generator_agent=f"preference-generator/{result.mode}",
            confidence_distribution=dict(result.confidence_distribution),
            output=f"in-memory:{target_format}:{result.pair_count}pairs",
        )
        log_to_consumer(event, self.topology)

    # ---------------------------------------------------------------- utils

    @staticmethod
    def _assert_same_prompt(a: CanonicalRecord, b: CanonicalRecord) -> None:
        if a.input.user != b.input.user:
            raise ValueError(
                f"Pair ({a.id}, {b.id}) has mismatched prompts — "
                "candidates must share the same input.user"
            )

    @staticmethod
    def _bump_distribution(dist: dict[str, int], confidence: float) -> None:
        if confidence < 0.5:
            bucket = "low"
        elif confidence < 0.7:
            bucket = "medium"
        elif confidence < 0.9:
            bucket = "high"
        else:
            bucket = "very_high"
        dist[bucket] = dist.get(bucket, 0) + 1


# --- Helpers --------------------------------------------------------------


def _response_text(rec: CanonicalRecord) -> str:
    """Extract the response text from either OutputPayload or PreferenceOutput."""
    out = rec.output
    if isinstance(out, PreferenceOutput):
        return out.chosen
    assert isinstance(out, OutputPayload)  # noqa: S101
    return out.assistant


def _has_reasoning_trace(rec: CanonicalRecord) -> bool:
    out = rec.output
    if isinstance(out, OutputPayload) and out.reasoning_trace:
        return bool(out.reasoning_trace.strip())
    return False


def _claims_source_without_refs(text: str, has_refs: bool) -> bool:
    """Detect 'according to X' style claims without any source_refs metadata."""
    if has_refs:
        return False
    return bool(_SOURCE_CLAIM_PATTERN.search(text))


def _ends_coherently(text: str) -> bool:
    stripped = text.rstrip()
    if not stripped:
        return False
    return stripped.endswith(_TERMINAL_PUNCT)


def _rule_confidence(score_gap: float) -> float:
    """Map rule score-gap to a capped confidence (max 0.8)."""
    # gap=1 -> 0.55, gap=2 -> 0.65, gap=3 -> 0.75, gap>=4 -> 0.8
    return min(0.8, 0.45 + 0.1 * score_gap)


__all__ = [
    "JudgeMode",
    "JudgementResult",
    "PreferenceGenerator",
    "PreferenceResult",
]
