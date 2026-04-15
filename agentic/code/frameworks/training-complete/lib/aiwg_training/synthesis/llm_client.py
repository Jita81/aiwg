"""Shared LLM client wrapper for agentic modules (synthesis, quality, etc.).

This module provides a thin wrapper around the official ``anthropic`` SDK
with cost tracking, retry-with-backoff, and a JSON-completion helper that
self-corrects on parse failures.

The ``anthropic`` package is an **optional** dependency. Import ``LLMClient``
lazily — if ``anthropic`` is not installed, instantiation raises a helpful
``ImportError`` directing the operator to ``pip install anthropic`` (or
``pip install aiwg-training[agentic]``). Tests exercise the duck-typed
:class:`~aiwg_training.synthesis.mock_client.MockLLMClient` and therefore
do not require ``anthropic`` at all.

Models and pricing follow the RLM cost-guidance convention:

- HAIKU for classification / filtering (cheap, fast)
- SONNET for standard reasoning / synthesis (default)
- OPUS for hard judgment / rare cases (expensive)

Pricing constants are public Anthropic list prices (USD per 1M tokens).
Update when Anthropic publishes new pricing.
"""

from __future__ import annotations

import json
import os
import random
import re
import time
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Model identifiers + pricing
# ---------------------------------------------------------------------------

MODEL_HAIKU = "claude-haiku-4-5-20251001"
MODEL_SONNET = "claude-sonnet-4-6"
MODEL_OPUS = "claude-opus-4-6"

# USD per 1M tokens: (input_per_1m, output_per_1m).
# Unknown models fall back to cost=0.0 so callers can still use them.
PRICING: dict[str, tuple[float, float]] = {
    MODEL_HAIKU: (1.0, 5.0),
    MODEL_SONNET: (3.0, 15.0),
    MODEL_OPUS: (15.0, 75.0),
}

_RETRYABLE_SUBSTRINGS = (
    "rate_limit",
    "overloaded",
    "timeout",
    "timed out",
    "connection",
    "temporarily",
    "503",
    "502",
    "504",
    "429",
)

_INSTALL_HINT = (
    "The `anthropic` package is required for LLMClient. Install it via "
    "`pip install anthropic` or `pip install aiwg-training[agentic]`."
)


# ---------------------------------------------------------------------------
# Response dataclass
# ---------------------------------------------------------------------------


@dataclass
class LLMResponse:
    """Normalized response returned by :class:`LLMClient`.

    ``cost`` is computed lazily from ``PRICING`` based on ``model`` and token
    counts. If ``model`` is not in ``PRICING``, ``cost`` returns ``0.0``.
    """

    content: str
    input_tokens: int
    output_tokens: int
    model: str
    stop_reason: str | None = None
    raw: Any = field(default=None, repr=False)

    @property
    def cost(self) -> float:
        """Cost in USD for this response, using public Anthropic pricing."""
        pricing = PRICING.get(self.model)
        if pricing is None:
            return 0.0
        in_price, out_price = pricing
        return (self.input_tokens / 1_000_000.0) * in_price + (
            self.output_tokens / 1_000_000.0
        ) * out_price

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class LLMClientError(RuntimeError):
    """Raised when an LLM call fails after exhausting retries."""


class JSONParseError(LLMClientError):
    """Raised by :meth:`LLMClient.complete_json` after retries fail to parse."""


# ---------------------------------------------------------------------------
# LLMClient
# ---------------------------------------------------------------------------


class LLMClient:
    """Wrapper around the Anthropic Python SDK with retry + cost tracking.

    Parameters
    ----------
    model:
        Model identifier; default :data:`MODEL_SONNET`.
    api_key:
        Anthropic API key. Falls back to ``ANTHROPIC_API_KEY`` env var.
    max_retries:
        Number of retry attempts on rate-limit / transient errors. The initial
        attempt is not counted; a value of ``3`` means up to 4 total calls.

    Attributes
    ----------
    total_cost:
        Running USD total accumulated across every successful call on this
        instance. Reset with :meth:`reset_cost`.
    total_input_tokens / total_output_tokens:
        Running token counters.
    call_count:
        Number of successful completions on this instance.
    """

    def __init__(
        self,
        model: str = MODEL_SONNET,
        api_key: str | None = None,
        max_retries: int = 3,
    ) -> None:
        try:
            import anthropic  # type: ignore[import-not-found]
        except ImportError as e:  # pragma: no cover - import-path only
            raise ImportError(_INSTALL_HINT) from e

        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise ValueError(
                "No API key provided. Pass api_key= or set ANTHROPIC_API_KEY."
            )

        self._anthropic = anthropic
        self._client = anthropic.Anthropic(api_key=key)
        self.model = model
        self.max_retries = max(0, int(max_retries))

        self.total_cost: float = 0.0
        self.total_input_tokens: int = 0
        self.total_output_tokens: int = 0
        self.call_count: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def complete(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """Send a completion request and return a normalized :class:`LLMResponse`.

        Messages use the standard Anthropic schema: ``{"role": "user"|"assistant",
        "content": str}``. ``system`` is the system prompt (optional).
        """
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system is not None:
            kwargs["system"] = system

        resp = self._call_with_retry(kwargs)
        llm_resp = self._parse_sdk_response(resp)
        self._record_usage(llm_resp)
        return llm_resp

    def complete_json(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        schema_hint: str | dict[str, Any] | None = None,
        max_retries: int = 2,
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> dict[str, Any]:
        """Call :meth:`complete` and parse the response as a JSON object.

        Wraps ``system`` with instructions to emit valid JSON and optionally a
        schema hint. On parse failure, appends the error to the conversation
        and asks the model to repair its output. Gives up after ``max_retries``
        retries and raises :class:`JSONParseError`.
        """
        hint_text = ""
        if schema_hint is not None:
            hint_text = "\n\nRespond with a single JSON object matching this shape:\n"
            if isinstance(schema_hint, dict):
                hint_text += json.dumps(schema_hint, indent=2)
            else:
                hint_text += str(schema_hint)

        json_system = (
            (system or "")
            + "\n\nIMPORTANT: Respond with a single JSON object and nothing else. "
            "Do not wrap the JSON in prose or markdown fences."
            + hint_text
        ).strip()

        convo: list[dict[str, Any]] = list(messages)
        last_err: Exception | None = None

        for _ in range(max_retries + 1):
            resp = self.complete(
                messages=convo,
                system=json_system,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            try:
                return _extract_json_object(resp.content)
            except ValueError as e:
                last_err = e
                # Feed the error back and ask for a repair.
                convo = list(convo) + [
                    {"role": "assistant", "content": resp.content},
                    {
                        "role": "user",
                        "content": (
                            f"That response could not be parsed as JSON: {e}. "
                            "Reply with ONLY a valid JSON object matching the "
                            "requested schema. No prose, no markdown fences."
                        ),
                    },
                ]

        raise JSONParseError(
            f"Failed to parse JSON after {max_retries + 1} attempts: {last_err}"
        )

    def reset_cost(self) -> None:
        """Reset running cost + token counters."""
        self.total_cost = 0.0
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.call_count = 0

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _call_with_retry(self, kwargs: dict[str, Any]) -> Any:
        """Invoke ``messages.create`` with exponential-backoff retry."""
        attempt = 0
        while True:
            try:
                return self._client.messages.create(**kwargs)
            except Exception as e:  # noqa: BLE001 — SDK raises diverse types
                if attempt >= self.max_retries or not _is_retryable(e):
                    raise LLMClientError(f"Anthropic API call failed: {e}") from e
                # Exponential backoff with jitter: 1s, 2s, 4s, ... + [0, 0.5)s
                delay = (2**attempt) + random.random() * 0.5
                time.sleep(delay)
                attempt += 1

    def _parse_sdk_response(self, resp: Any) -> LLMResponse:
        """Extract our normalized fields from the SDK response object."""
        # anthropic.types.Message: .content is a list of blocks
        content_parts: list[str] = []
        for block in getattr(resp, "content", []) or []:
            text = getattr(block, "text", None)
            if text is not None:
                content_parts.append(text)
        content = "".join(content_parts)

        usage = getattr(resp, "usage", None)
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)

        return LLMResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=getattr(resp, "model", self.model),
            stop_reason=getattr(resp, "stop_reason", None),
            raw=resp,
        )

    def _record_usage(self, r: LLMResponse) -> None:
        self.total_cost += r.cost
        self.total_input_tokens += r.input_tokens
        self.total_output_tokens += r.output_tokens
        self.call_count += 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_retryable(e: BaseException) -> bool:
    """True if the exception looks like a rate-limit / transient error."""
    name = type(e).__name__.lower()
    msg = str(e).lower()
    if "ratelimit" in name or "timeout" in name or "overload" in name:
        return True
    status = getattr(e, "status_code", None)
    if status in (408, 429, 500, 502, 503, 504):
        return True
    return any(s in msg for s in _RETRYABLE_SUBSTRINGS)


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.DOTALL)


def _extract_json_object(text: str) -> dict[str, Any]:
    """Extract the first JSON object from ``text``.

    Tolerates markdown code fences and stray prose around a single JSON block.
    Raises :class:`ValueError` if no parseable object is found.
    """
    if not text or not text.strip():
        raise ValueError("empty response")

    candidates: list[str] = []
    # Strategy 1: raw text
    candidates.append(text.strip())
    # Strategy 2: markdown code fence
    m = _JSON_FENCE_RE.search(text)
    if m:
        candidates.append(m.group(1))
    # Strategy 3: first {...} brace-balanced span
    span = _first_balanced_object(text)
    if span is not None:
        candidates.append(span)

    last_err: Exception | None = None
    for c in candidates:
        try:
            data = json.loads(c)
        except json.JSONDecodeError as e:
            last_err = e
            continue
        if isinstance(data, dict):
            return data
        last_err = ValueError(f"JSON root is {type(data).__name__}, expected object")

    raise ValueError(f"could not parse JSON: {last_err}")


def _first_balanced_object(text: str) -> str | None:
    """Return the substring of the first brace-balanced ``{...}`` span."""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


__all__ = [
    "JSONParseError",
    "LLMClient",
    "LLMClientError",
    "LLMResponse",
    "MODEL_HAIKU",
    "MODEL_OPUS",
    "MODEL_SONNET",
    "PRICING",
]
