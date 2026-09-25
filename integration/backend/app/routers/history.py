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
    """Retourne l'historique COMPLET d'une conversation, pour l'affichage —
    jamais tronqué par le résumé (voir memory.get_historique_complet)."""
    user_id = user["sub"]
    historique = memory.get_historique_complet(conversation_id, user_id)
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

@router.delete("/conversations/{conversation_id}")
def delete_conversation_endpoint(conversation_id: str, user: dict = Depends(get_current_user)):
    """
    Supprime complètement une conversation : tous ses messages ET son
    résumé associé (le résumé est stocké dans une table séparée, donc il
    faut le supprimer explicitement — pas de cascade automatique entre les
    deux tables).
    """
    user_id = user["sub"]
    memory.delete_conversation(conversation_id, user_id)
    return {"status": "ok"}