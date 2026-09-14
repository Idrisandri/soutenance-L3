"""
Router pour l'endpoint /ask.

Important : ce fichier n'implémente AUCUNE logique RAG lui-même — il importe
et appelle la fonction ask() qui vit dans rag/ (à la racine du repo, sibling
de integration/). Le backend ne fait que recevoir la requête HTTP, appeler
le RAG, et formater la réponse.
"""
import os
import sys

RAG_SRC_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "rag")
sys.path.insert(0, os.path.abspath(RAG_SRC_PATH))

from src.rag import ask as rag_ask  # noqa: E402  (import après manipulation de sys.path, volontaire)

from fastapi import APIRouter, HTTPException
from app.schemas import QuestionRequest, AnswerResponse

router = APIRouter()


@router.post("/ask", response_model=AnswerResponse)
def ask_endpoint(payload: QuestionRequest):
    """
    Pose une question au RAG (logique définie dans rag/src/rag.py) et
    retourne la réponse avec ses sources.

    Note : "prompt_complet" existe dans le retour de rag_ask() mais n'est
    volontairement pas renvoyé ici (voir schemas.py) — réservé à un usage
    interne d'audit, pas à l'API publique.
    """
    try:
        resultat = rag_ask(payload.question)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur du service RAG : {e}")

    return AnswerResponse(
        reponse=resultat["reponse"],
        sources=resultat.get("sources", []),
        hors_zone_detectee=resultat.get("hors_zone_detectee", False),
    )