"""Local vector embedding service using sentence-transformers (all-MiniLM-L6-v2).

Model is lazy-loaded on first call — startup is not blocked. The 90 MB model
is cached in /root/.cache/huggingface (Docker volume: hf_cache).
"""
from __future__ import annotations

import threading
import numpy as np
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"
_model: SentenceTransformer | None = None
_model_lock = threading.Lock()


def _get_model() -> SentenceTransformer:
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(_MODEL_NAME)
    return _model


def get_embedding(text: str) -> list[float]:
    """Return a 384-dim L2-normalized embedding for text."""
    model = _get_model()
    vec = model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
    return vec.tolist()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two pre-normalized vectors (dot product)."""
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)
