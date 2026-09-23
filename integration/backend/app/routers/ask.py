"""
Router pour l'endpoint /ask.

Flow : récupère l'historique récent de la conversation -> reformule la
question si besoin (query_rewriter, pour la rendre autonome) -> appelle le
RAG (stateless) avec la question reformulée -> sauvegarde l'échange
(question ORIGINALE + réponse) dans l'historique.
"""
import os
import sys

RAG_SRC_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "rag")
sys.path.insert(0, os.path.abspath(RAG_SRC_PATH))

from src.rag import ask as rag_ask  # noqa: E402
from src.query_rewriter import rewrite_query  # noqa: E402

from fastapi import APIRouter, HTTPException, Depends
from app.schemas import QuestionRequest, AnswerResponse
from app.auth import get_current_user
from app import memory

router = APIRouter()


@router.post("/ask", response_model=AnswerResponse)
def ask_endpoint(payload: QuestionRequest, user: dict = Depends(get_current_user)):
    user_id = user["sub"]

    historique = memory.get_historique(payload.conversation_id, user_id, limite=3)
    history_text = memory.format_historique(historique)

    question_a_chercher = rewrite_query(payload.question, history_text)

    try:
        resultat = rag_ask(question_a_chercher)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur du service RAG : {e}")

    memory.sauvegarder_echange(
        conversation_id=payload.conversation_id,
        user_id=user_id,
        question=payload.question,
        reponse=resultat["reponse"],
    )

    return AnswerResponse(
        reponse=resultat["reponse"],
        sources=resultat.get("sources", []),
        hors_zone_detectee=resultat.get("hors_zone_detectee", False),
    )