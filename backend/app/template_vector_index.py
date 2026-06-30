from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from .analytics_templates import AnalyticsTemplate
from .config import Settings
from .embeddings import EmbeddingModel, build_embedding_model
from .local_embeddings import LocalHashEmbeddingModel

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TemplateSearchResult:
    template: AnalyticsTemplate
    confidence: float
    distance: float


class TemplateVectorIndex:
    def __init__(self, settings: Settings, templates: list[AnalyticsTemplate]) -> None:
        if settings.template_vector_store != "chroma":
            raise ValueError("Only ChromaDB is supported for template vector search.")

        self.settings = settings
        self.templates = {template.id: template for template in templates}
        self.embedding_model: EmbeddingModel = build_embedding_model(settings)
        self.collection: Any | None = None

    def initialize(self) -> None:
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        self._ensure_embedding_model_available()
        self.client = chromadb.PersistentClient(
            path=self.settings.chroma_path,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = self._get_or_create_collection()
        self._delete_stale_templates()
        try:
            self._upsert_changed_templates()
        except Exception as exc:
            if "dimension" not in str(exc).lower():
                raise
            self._recreate_collection()
            self._upsert_changed_templates()

    def _get_or_create_collection(self) -> Any:
        return self.client.get_or_create_collection(
            name=self.settings.template_collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def _recreate_collection(self) -> None:
        self.client.delete_collection(name=self.settings.template_collection_name)
        self.collection = self._get_or_create_collection()

    def _ensure_embedding_model_available(self) -> None:
        try:
            self.embedding_model.embed(["embedding healthcheck"])
        except Exception:
            if self.settings.embedding_provider != "gemini":
                raise
            self.embedding_model = LocalHashEmbeddingModel()

    def search(self, search_text: str, n_results: int = 3) -> TemplateSearchResult | None:
        if self.collection is None:
            raise RuntimeError("Template vector index has not been initialized.")

        # The collection is built with one embedding space (e.g. Gemini 768-dim).
        # A transient embedding failure must NOT swap in a different model/space
        # (that caused dimension-mismatch crashes); retry, then skip matching.
        query_embedding = None
        for attempt in range(2):
            try:
                query_embedding = self.embedding_model.embed([search_text])
                break
            except Exception:
                logger.warning(
                    "Template search embedding failed (attempt %d).", attempt + 1, exc_info=True
                )
        if query_embedding is None:
            return None

        result = self.collection.query(
            query_embeddings=query_embedding,
            n_results=n_results,
            include=["distances", "metadatas"],
        )
        ids = result.get("ids", [[]])[0]
        distances = result.get("distances", [[]])[0]
        if not ids or not distances:
            return None

        template_id = ids[0]
        template = self.templates.get(template_id)
        if template is None:
            return None

        distance = float(distances[0])
        confidence = max(0.0, min(1.0, 1.0 - distance))
        return TemplateSearchResult(template=template, confidence=confidence, distance=distance)

    def _delete_stale_templates(self) -> None:
        assert self.collection is not None
        existing = self.collection.get(include=["metadatas"])
        stale_ids = [item_id for item_id in existing.get("ids", []) if item_id not in self.templates]
        if stale_ids:
            self.collection.delete(ids=stale_ids)

    def _upsert_changed_templates(self) -> None:
        assert self.collection is not None
        for template in self.templates.values():
            current = self.collection.get(ids=[template.id], include=["metadatas"])
            metadata = current.get("metadatas", [None])[0] if current.get("ids") else None
            if (
                metadata
                and metadata.get("content_hash") == template.content_hash
                and metadata.get("embedding_version") == self.embedding_model.version
            ):
                continue

            self.collection.upsert(
                ids=[template.id],
                embeddings=self.embedding_model.embed([template.search_document]),
                documents=[template.search_document],
                metadatas=[self._safe_metadata(template)],
            )

    def _safe_metadata(self, template: AnalyticsTemplate) -> dict[str, Any]:
        return {
            "template_id": template.id,
            "title": template.title,
            "category": template.category,
            "content_hash": template.content_hash,
            "embedding_version": self.embedding_model.version,
            "parameters_json": json.dumps(template.parameters, ensure_ascii=False),
            "chart_json": json.dumps(template.chart, ensure_ascii=False),
            "example_count": len(template.examples),
        }

    def add_template(self, template: AnalyticsTemplate) -> None:
        self.templates[template.id] = template
        if self.collection is not None:
            self.collection.upsert(
                ids=[template.id],
                embeddings=self.embedding_model.embed([template.search_document]),
                documents=[template.search_document],
                metadatas=[self._safe_metadata(template)],
            )

