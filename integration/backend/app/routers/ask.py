"""
Router pour l'endpoint /ask.

Flow : récupère le contexte de la conversation (résumé + échanges bruts
récents) -> reformule la question si besoin (query_rewriter, pour la rendre
autonome) -> appelle le RAG (stateless) avec la question reformulée ->
sauvegarde l'échange (question ORIGINALE + réponse) -> vérifie si les
anciens échanges doivent être résumés (maintain_memory), pour garder
l'historique brut léger sans perdre le contexte.
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

    # Contexte = résumé (si la conversation a déjà dépassé le seuil au moins
    # une fois) + échanges bruts récents non encore résumés.
    contexte = memory.get_contexte_complet(payload.conversation_id, user_id)

    question_a_chercher = rewrite_query(payload.question, contexte)

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

    # Vérifie si le nombre d'échanges bruts dépasse le seuil maintenant que
    # ce nouvel échange a été ajouté — si oui, résume les plus anciens et
    # les supprime de conversation_messages.
    memory.maintain_memory(payload.conversation_id, user_id)

    return AnswerResponse(
        reponse=resultat["reponse"],
        sources=resultat.get("sources", []),
        hors_zone_detectee=resultat.get("hors_zone_detectee", False),
    )