"""
Router pour l'historique des conversations.

Séparé de ask.py pour rester lisible — cette route est en lecture seule,
elle ne fait qu'exposer memory.get_historique() au frontend, pour réafficher
une conversation après un rechargement de page (le frontend persiste
conversation_id dans localStorage, voir integration/frontend).
"""
from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app import memory

router = APIRouter()


@router.get("/history/{conversation_id}")
def get_history_endpoint(conversation_id: str, user: dict = Depends(get_current_user)):
    """Retourne l'historique d'une conversation précise, filtré par
    l'utilisateur connecté (sécurité : on ne retourne jamais l'historique
    d'un conversation_id appartenant à un autre utilisateur)."""
    user_id = user["sub"]
    historique = memory.get_historique(conversation_id, user_id, limite=50)
    return {"messages": historique}


@router.get("/conversations")
def list_conversations_endpoint(user: dict = Depends(get_current_user)):
    """
    Liste les conversations distinctes de l'utilisateur connecté, triées par
    date du dernier message. Pour chaque conversation, retourne son id et
    un aperçu (la première question posée, utilisée comme "titre").
    """
    user_id = user["sub"]
    conversations = memory.get_conversations(user_id)
    return {"conversations": conversations}