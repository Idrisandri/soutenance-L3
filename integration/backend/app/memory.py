"""
Gestion de la mémoire de conversation : lecture de l'historique récent d'un
fil de discussion, et sauvegarde de chaque nouvel échange.

Le RAG lui-même (rag/src/rag.py) n'a aucune notion de conversation — chaque
appel est stateless. C'est ce module + query_rewriter.py qui apportent la
mémoire, en reformulant la question avec le contexte avant de l'envoyer au
RAG, plutôt qu'en modifiant le RAG lui-même.
"""
import os
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


def get_historique(conversation_id: str, user_id: str, limite: int = 3) -> list[dict]:
    """
    Récupère les derniers échanges d'une conversation, filtrés par user_id
    (sécurité : même avec la clé service côté backend, on ne veut jamais
    qu'un conversation_id d'un autre utilisateur soit lisible ici).
    Retourne les messages du plus ancien au plus récent (ordre chronologique).
    """
    client = _get_client()
    response = (
        client.table("conversation_messages")
        .select("question, reponse, created_at")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limite)
        .execute()
    )
    return list(reversed(response.data))


def format_historique(historique: list[dict]) -> str:
    """
    Transforme l'historique en texte simple pour le prompt du query rewriter
    (format "Utilisateur: ... / Assistant: ..."). Vide si pas d'historique.
    """
    if not historique:
        return ""

    lignes = []
    for echange in historique:
        lignes.append(f"Utilisateur : {echange['question']}")
        lignes.append(f"Assistant : {echange['reponse']}")

    return "\n".join(lignes)


def sauvegarder_echange(conversation_id: str, user_id: str, question: str, reponse: str) -> None:
    """
    Enregistre un échange dans l'historique. On sauvegarde la QUESTION
    ORIGINALE (pas la version reformulée par le rewriter) — l'historique
    affiché/stocké doit refléter ce que l'utilisateur a réellement tapé.
    """
    client = _get_client()
    client.table("conversation_messages").insert({
        "conversation_id": conversation_id,
        "user_id": user_id,
        "question": question,
        "reponse": reponse,
    }).execute()


def get_conversations(user_id: str) -> list[dict]:
    """
    Retourne la liste des conversations distinctes d'un utilisateur, triées
    par date du message le plus récent. Chaque entrée contient
    conversation_id, un aperçu (première question) et la date du dernier
    échange.

    Note : ce n'est pas la requête la plus optimale (on récupère tous les
    messages puis on regroupe en Python plutôt qu'un vrai GROUP BY SQL),
    mais largement suffisant vu le volume attendu (un usage personnel/équipe
    restreinte, pas des millions de messages).
    """
    client = _get_client()
    response = (
        client.table("conversation_messages")
        .select("conversation_id, question, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )

    par_conversation = {}
    for msg in response.data:
        conv_id = msg["conversation_id"]
        if conv_id not in par_conversation:
            par_conversation[conv_id] = {
                "conversation_id": conv_id,
                "titre": msg["question"][:60],  # aperçu = 1re question, tronquée
                "derniere_activite": msg["created_at"],
            }
        else:
            par_conversation[conv_id]["derniere_activite"] = msg["created_at"]

    conversations = list(par_conversation.values())
    conversations.sort(key=lambda c: c["derniere_activite"], reverse=True)
    return conversations