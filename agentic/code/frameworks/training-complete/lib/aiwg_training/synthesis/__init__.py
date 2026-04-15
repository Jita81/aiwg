"""Agentic synthesis utilities (LLM client, synthesizers, preference generators).

Exports:
    * LLM client infrastructure — :class:`LLMClient`, :class:`MockLLMClient`,
      :class:`LLMResponse`, :data:`MODEL_HAIKU` / :data:`MODEL_SONNET` /
      :data:`MODEL_OPUS`, :data:`PRICING`, plus :class:`LLMClientError` and
      :class:`JSONParseError`.
    * Preference generation (#839) — :class:`PreferenceGenerator`,
      :class:`PreferenceResult`, :class:`JudgementResult`.
    * Preference export (#839) — :func:`export` dispatcher plus
      :func:`export_dpo`, :func:`export_kto`, :func:`export_orpo`,
      :func:`export_simpo`.
    * Example synthesis (#838) — :class:`ExampleSynthesizer`,
      :class:`SynthesisResult`, :class:`SynthesisError`.
    * Synthetic data generation (#840) — :class:`SyntheticDataGenerator`,
      :class:`GenerationResult`, :class:`GeneratorConfig`,
      :class:`ModelCollapseGuardError`.
"""

from aiwg_training.synthesis.example_synthesizer import (
    SUPPORTED_PATTERNS,
    ExampleSynthesizer,
    SynthesisError,
    SynthesisResult,
)
from aiwg_training.synthesis.llm_client import (
    MODEL_HAIKU,
    MODEL_OPUS,
    MODEL_SONNET,
    PRICING,
    JSONParseError,
    LLMClient,
    LLMClientError,
    LLMResponse,
)
from aiwg_training.synthesis.mock_client import MockLLMClient
from aiwg_training.synthesis.preference_export import (
    ExportFormat,
    export,
    export_dpo,
    export_kto,
    export_orpo,
    export_simpo,
)
from aiwg_training.synthesis.preference_generator import (
    JudgeMode,
    JudgementResult,
    PreferenceGenerator,
    PreferenceResult,
)
from aiwg_training.synthesis.synthetic_data_generator import (
    SUPPORTED_GENERATORS,
    GenerationResult,
    GeneratorConfig,
    GeneratorConfigError,
    ModelCollapseGuardError,
    SyntheticDataError,
    SyntheticDataGenerator,
)

__all__ = [
    "ExampleSynthesizer",
    "ExportFormat",
    "GenerationResult",
    "GeneratorConfig",
    "GeneratorConfigError",
    "JSONParseError",
    "JudgeMode",
    "JudgementResult",
    "LLMClient",
    "LLMClientError",
    "LLMResponse",
    "MODEL_HAIKU",
    "MODEL_OPUS",
    "MODEL_SONNET",
    "MockLLMClient",
    "ModelCollapseGuardError",
    "PRICING",
    "PreferenceGenerator",
    "PreferenceResult",
    "SUPPORTED_GENERATORS",
    "SUPPORTED_PATTERNS",
    "SynthesisError",
    "SynthesisResult",
    "SyntheticDataError",
    "SyntheticDataGenerator",
    "export",
    "export_dpo",
    "export_kto",
    "export_orpo",
    "export_simpo",
]
