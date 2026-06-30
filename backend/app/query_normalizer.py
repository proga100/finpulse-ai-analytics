from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol

from .config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NormalizedQuery:
    detected_language: str
    corrected_text: str
    latin_text: str
    cyrillic_text: str
    english_search_text: str
    intent_keywords: tuple[str, ...]

    @property
    def search_text(self) -> str:
        return "\n".join(
            part
            for part in (
                self.english_search_text,
                self.latin_text,
                self.cyrillic_text,
                self.corrected_text,
                " ".join(self.intent_keywords),
            )
            if part
        )


class QueryNormalizer(Protocol):
    def normalize(self, question: str, language: str | None) -> NormalizedQuery:
        ...


class PassthroughQueryNormalizer:
    def normalize(self, question: str, language: str | None) -> NormalizedQuery:
        return NormalizedQuery(
            detected_language=language or "unknown",
            corrected_text=question,
            latin_text=question,
            cyrillic_text=question,
            english_search_text=question,
            intent_keywords=(),
        )


class GeminiQueryNormalizer:
    def __init__(self, settings: Settings) -> None:
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required for Gemini query normalization.")

        from google import genai

        self.model = settings.query_normalizer_model
        self.client = genai.Client(api_key=settings.gemini_api_key)

    def normalize(self, question: str, language: str | None) -> NormalizedQuery:
        from google.genai import types

        prompt = _normalization_prompt(question, language)
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0,
            ),
        )
        payload = _parse_json_payload(response.text)
        return NormalizedQuery(
            detected_language=str(payload.get("detected_language") or language or "unknown"),
            corrected_text=str(payload.get("corrected_text") or question),
            latin_text=str(payload.get("latin_text") or ""),
            cyrillic_text=str(payload.get("cyrillic_text") or ""),
            english_search_text=str(payload.get("english_search_text") or question),
            intent_keywords=tuple(str(item) for item in payload.get("intent_keywords") or ()),
        )


def build_query_normalizer(settings: Settings) -> QueryNormalizer:
    if not settings.query_normalizer_enabled:
        return PassthroughQueryNormalizer()

    if settings.query_normalizer_provider == "gemini":
        try:
            return GeminiQueryNormalizer(settings)
        except Exception as exc:
            logger.warning("Falling back to passthrough query normalization: %s", exc)
            return PassthroughQueryNormalizer()

    if settings.query_normalizer_provider == "none":
        return PassthroughQueryNormalizer()

    raise ValueError(f"Unsupported query normalizer provider: {settings.query_normalizer_provider}")


def _normalization_prompt(question: str, language: str | None) -> str:
    return f"""
You normalize analytics-chat user questions for template retrieval only.
You must not generate SQL and must not mention database schema.

Return strict JSON with these keys:
- detected_language: BCP-47-ish language code such as uz-Cyrl, uz-Latn, ru, en, unknown
- corrected_text: corrected original-language question
- latin_text: Uzbek Latin transliteration when useful, otherwise empty string
- cyrillic_text: Uzbek Cyrillic transliteration when useful, otherwise empty string
- english_search_text: concise English semantic search phrase
- intent_keywords: 3 to 8 short English keywords

User language hint: {language or "unknown"}
User question: {question}
""".strip()


def _parse_json_payload(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    return json.loads(cleaned)
