"""Deterministic in-process LLM client for tests.

``MockLLMClient`` is duck-typed against :class:`aiwg_training.synthesis.
llm_client.LLMClient` — it exposes the same ``complete`` / ``complete_json``
surface, so production code does not need to branch on client type. It does
NOT import ``anthropic``, so it runs wherever ``pydantic`` and the stdlib
are available.

Typical use in tests:

.. code-block:: python

    from aiwg_training.synthesis.mock_client import MockLLMClient

    mock = MockLLMClient(responses=[
        '{"factors_present": ["clear_reasoning"], "notes": "ok"}',
        '{"factors_present": [], "notes": "no reasoning trace"}',
    ])
    data = mock.complete_json(messages=[{"role": "user", "content": "x"}])
    assert data["notes"] == "ok"
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from aiwg_training.synthesis.llm_client import (
    JSONParseError,
    LLMResponse,
    MODEL_SONNET,
    _extract_json_object,
)


@dataclass
class MockLLMClient:
    """FIFO-queue test double that returns canned responses in order.

    Parameters
    ----------
    responses:
        Queue of canned outputs. Each entry may be:

        - ``str`` — returned as ``LLMResponse.content``
        - ``dict`` / ``list`` — JSON-encoded into ``LLMResponse.content``
        - :class:`LLMResponse` — used verbatim
    model:
        Model tag recorded on each response (default :data:`MODEL_SONNET`).
    default_response:
        Returned (repeatedly) when the queue is empty. Defaults to empty
        string, which will raise :class:`JSONParseError` from
        ``complete_json``.
    input_tokens / output_tokens:
        Fake token counts used to build :class:`LLMResponse` objects so cost
        tracking can be unit-tested. Defaults to 100 each.

    Attributes
    ----------
    call_log:
        Every call recorded as a dict for test assertions.
    total_cost / total_input_tokens / total_output_tokens / call_count:
        Same running counters as :class:`LLMClient` for test parity.
    """

    responses: list[Any] = field(default_factory=list)
    model: str = MODEL_SONNET
    default_response: Any = ""
    input_tokens: int = 100
    output_tokens: int = 100
    max_retries: int = 2

    call_log: list[dict[str, Any]] = field(default_factory=list)
    total_cost: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    call_count: int = 0

    # ------------------------------------------------------------------
    # Public API (duck-types LLMClient)
    # ------------------------------------------------------------------

    def complete(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """Pop the next canned response and return it as an ``LLMResponse``."""
        self.call_log.append(
            {
                "kind": "complete",
                "messages": messages,
                "system": system,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
        )
        canned = self._next()
        resp = self._to_response(canned)
        self.total_cost += resp.cost
        self.total_input_tokens += resp.input_tokens
        self.total_output_tokens += resp.output_tokens
        self.call_count += 1
        return resp

    def complete_json(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        schema_hint: str | dict[str, Any] | None = None,
        max_retries: int | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> dict[str, Any]:
        """Return the next canned response parsed as a JSON object.

        Retries (by popping additional responses) if parsing fails, mirroring
        the repair loop in :meth:`LLMClient.complete_json`.
        """
        retries = self.max_retries if max_retries is None else max_retries
        last_err: Exception | None = None
        for _ in range(retries + 1):
            resp = self.complete(
                messages=messages,
                system=system,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            try:
                return _extract_json_object(resp.content)
            except ValueError as e:
                last_err = e
                continue
        raise JSONParseError(
            f"MockLLMClient: could not parse JSON after {retries + 1} attempts: {last_err}"
        )

    def reset_cost(self) -> None:
        self.total_cost = 0.0
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.call_count = 0

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _next(self) -> Any:
        if self.responses:
            return self.responses.pop(0)
        return self.default_response

    def _to_response(self, canned: Any) -> LLMResponse:
        if isinstance(canned, LLMResponse):
            return canned
        if isinstance(canned, (dict, list)):
            content = json.dumps(canned)
        else:
            content = str(canned) if canned is not None else ""
        return LLMResponse(
            content=content,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            model=self.model,
            stop_reason="end_turn",
        )


__all__ = ["MockLLMClient"]
