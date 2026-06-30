from __future__ import annotations

import hashlib
import math
import re


class LocalHashEmbeddingModel:
    version = "local-hash-ngram-v2"

    def __init__(self, dimensions: int = 384) -> None:
        self.dimensions = dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        normalized = _normalize_text(text)
        values = [0.0] * self.dimensions

        for feature in _features(normalized):
            digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
            bucket = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            weight = 1.5 if feature.startswith("word:") else 1.0
            values[bucket] += sign * weight

        norm = math.sqrt(sum(value * value for value in values))
        if norm == 0:
            return values
        return [value / norm for value in values]


def _normalize_text(text: str) -> str:
    lowered = text.lower()
    lowered = lowered.replace("ʼ", "'").replace("‘", "'").replace("`", "'")
    lowered = lowered.replace("ё", "е")
    lowered = lowered.replace("ў", "у").replace("қ", "к").replace("ғ", "г").replace("ҳ", "х")
    lowered = re.sub(r"[^0-9a-zа-яғқҳў' ]+", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _features(text: str) -> list[str]:
    if not text:
        return []

    words = text.split()
    features: list[str] = []
    features.extend(f"word:{word}" for word in words)
    features.extend(f"pair:{left}_{right}" for left, right in zip(words, words[1:]))

    compact = f" {text} "
    for size in (3, 4, 5):
        features.extend(f"char:{compact[index:index + size]}" for index in range(len(compact) - size + 1))

    return features
