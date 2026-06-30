from __future__ import annotations

import logging
from typing import Protocol

from .config import Settings
from .local_embeddings import LocalHashEmbeddingModel

logger = logging.getLogger(__name__)


class EmbeddingModel(Protocol):
    version: str

    def embed(self, texts: list[str]) -> list[list[float]]:
        ...


class GeminiEmbeddingModel:
    def __init__(self, settings: Settings) -> None:
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required for Gemini embeddings.")

        from google import genai

        self.model = settings.gemini_embedding_model
        self.dimensions = settings.gemini_embedding_dimensions
        self.version = f"gemini:{self.model}:dim-{self.dimensions}"
        self.client = genai.Client(api_key=settings.gemini_api_key)

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        from google.genai import types

        response = self.client.models.embed_content(
            model=self.model,
            contents=texts,
            config=types.EmbedContentConfig(output_dimensionality=self.dimensions),
        )
        embeddings = getattr(response, "embeddings", None)
        if not embeddings:
            single = getattr(response, "embedding", None)
            embeddings = [single] if single is not None else []

        vectors = [list(getattr(embedding, "values")) for embedding in embeddings]
        if len(vectors) != len(texts):
            raise RuntimeError("Gemini embedding response count did not match request count.")
        return vectors


def build_embedding_model(settings: Settings) -> EmbeddingModel:
    if settings.embedding_provider == "gemini":
        try:
            return GeminiEmbeddingModel(settings)
        except Exception as exc:
            logger.warning("Falling back to local embeddings: %s", exc)
            return LocalHashEmbeddingModel()

    if settings.embedding_provider == "local":
        return LocalHashEmbeddingModel()

    raise ValueError(f"Unsupported embedding provider: {settings.embedding_provider}")
