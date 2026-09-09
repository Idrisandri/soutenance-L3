"""
Génération d'embeddings via l'API Gemini (gratuite, quota généreux).
"""
import google.generativeai as genai

from . import config

genai.configure(api_key=config.GEMINI_API_KEY)


def embed_text(text: str, task_type: str = "retrieval_document") -> list[float]:
    """
    Génère l'embedding d'un texte.
    task_type :
      - "retrieval_document" pour les fiches concurrents qu'on stocke
      - "retrieval_query" pour la question posée par l'utilisateur au moment de chercher

    output_dimensionality est forcé à 768 explicitement : sans ce paramètre,
    l'API Gemini renvoie désormais 3072 dimensions par défaut, ce qui ne
    correspond plus à la colonne vector(768) créée dans Supabase.
    """
    result = genai.embed_content(
        model=config.EMBEDDING_MODEL,
        content=text,
        task_type=task_type,
        output_dimensionality=config.EMBEDDING_DIMENSIONS,
    )
    return result["embedding"]


def embed_query(question: str) -> list[float]:
    """Raccourci pour embedder une question utilisateur (utilisé dans search.py)."""
    return embed_text(question, task_type="retrieval_query")