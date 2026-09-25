"""
Gestion de la mémoire de conversation : lecture/écriture de l'historique
brut, listing des conversations, et maintenance automatique (résumé des
anciens échanges au-delà d'un seuil).

IMPORTANT : les messages ne sont JAMAIS supprimés de conversation_messages.
L'historique complet reste affiché dans le chat, pour l'utilisateur. Le
résumé sert uniquement à limiter ce qui est injecté dans le PROMPT envoyé au
LLM (via get_contexte_complet), pas à limiter ce qui est affiché à l'écran.
La colonne resume_jusqua sert juste à savoir jusqu'où on a déjà résumé, pour
ne pas re-résumer les mêmes messages à chaque nouvelle question.
"""
import os
import sys

RAG_SRC_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "rag")
sys.path.insert(0, os.path.abspath(RAG_SRC_PATH))
from src.summarizer import summarize_history  # noqa: E402

from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

MAX_ECHANGES_BRUTS = 5  # au-delà, les plus anciens non encore résumés sont résumés

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


def get_historique(conversation_id: str, user_id: str, limite: int = 5) -> list[dict]:
    """Derniers échanges bruts, pour le CONTEXTE envoyé au LLM (pas l'affichage)."""
    client = _get_client()
    response = (
        client.table("conversation_messages")
        .select("id, question, reponse, created_at")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limite)
        .execute()
    )
    return list(reversed(response.data))


def get_historique_complet(conversation_id: str, user_id: str) -> list[dict]:
    """TOUT l'historique, pour l'AFFICHAGE dans le chat — jamais tronqué par
    le résumé, peu importe combien d'échanges ont eu lieu."""
    client = _get_client()
    response = (
        client.table("conversation_messages")
        .select("question, reponse, created_at")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    return response.data


def format_historique(historique: list[dict]) -> str:
    if not historique:
        return ""
    lignes = []
    for echange in historique:
        lignes.append(f"Utilisateur : {echange['question']}")
        lignes.append(f"Assistant : {echange['reponse']}")
    return "\n".join(lignes)


def get_conversations(user_id: str) -> list[dict]:
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
                "titre": msg["question"][:60],
                "derniere_activite": msg["created_at"],
            }
        else:
            par_conversation[conv_id]["derniere_activite"] = msg["created_at"]

    conversations = list(par_conversation.values())
    conversations.sort(key=lambda c: c["derniere_activite"], reverse=True)
    return conversations


def get_summary(conversation_id: str, user_id: str) -> dict | None:
    """Retourne {summary, resume_jusqua} ou None s'il n'y a pas encore de résumé."""
    client = _get_client()
    response = (
        client.table("conversation_summaries")
        .select("summary, resume_jusqua")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if response is None:
        return None
    return response.data


def save_summary(conversation_id: str, user_id: str, summary: str, resume_jusqua: str) -> None:
    client = _get_client()
    client.table("conversation_summaries").upsert({
        "conversation_id": conversation_id,
        "user_id": user_id,
        "summary": summary,
        "resume_jusqua": resume_jusqua,
    }).execute()


def sauvegarder_echange(conversation_id: str, user_id: str, question: str, reponse: str) -> None:
    client = _get_client()
    client.table("conversation_messages").insert({
        "conversation_id": conversation_id,
        "user_id": user_id,
        "question": question,
        "reponse": reponse,
    }).execute()


def maintain_memory(conversation_id: str, user_id: str) -> None:
    """
    Résume par paquets de MAX_ECHANGES_BRUTS messages NON ENCORE résumés
    (déterminé via resume_jusqua), sans jamais supprimer les lignes de
    conversation_messages — l'historique complet reste affiché dans le chat.
    """
    client = _get_client()

    resume_existant = get_summary(conversation_id, user_id)
    resume_jusqua = resume_existant["resume_jusqua"] if resume_existant else None

    query = (
        client.table("conversation_messages")
        .select("id, question, reponse, created_at")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .order("created_at", desc=False)
    )
    if resume_jusqua:
        query = query.gt("created_at", resume_jusqua)

    non_resumes = query.execute().data

    print(f"DEBUG maintain_memory: {len(non_resumes)} messages non résumés (seuil={MAX_ECHANGES_BRUTS})")  # TEMPORAIRE


    if len(non_resumes) <= MAX_ECHANGES_BRUTS:
        return  # pas encore assez de nouveaux messages pour former un paquet complet

    paquet = non_resumes[:MAX_ECHANGES_BRUTS]
    texte_paquet = "\n".join(
        f"Utilisateur : {e['question']}\nAssistant : {e['reponse']}" for e in paquet
    )

    ancien_texte_resume = resume_existant["summary"] if resume_existant else ""
    nouveau_resume = summarize_history(ancien_texte_resume, texte_paquet)

    nouveau_resume_jusqua = paquet[-1]["created_at"]
    save_summary(conversation_id, user_id, nouveau_resume, nouveau_resume_jusqua)
    # Pas de suppression — les lignes restent dans conversation_messages.


def get_contexte_complet(conversation_id: str, user_id: str, limite_brute: int = 5) -> str:
    """
    Combine résumé (mémoire long terme) + échanges bruts récents (mémoire
    court terme, plafonnée à limite_brute peu importe le total en base) en
    un texte pour le query rewriter.
    """
    resume_existant = get_summary(conversation_id, user_id)
    resume = resume_existant["summary"] if resume_existant else ""

    historique = get_historique(conversation_id, user_id, limite=limite_brute)
    texte_brut = format_historique(historique)

    parties = []
    if resume:
        parties.append(f"Résumé de la conversation jusqu'ici :\n{resume}")
    if texte_brut:
        parties.append(f"Échanges récents :\n{texte_brut}")

    return "\n\n".join(parties)


def delete_conversation(conversation_id: str, user_id: str) -> None:
    """
    Supprime tous les messages et le résumé d'une conversation, pour cet
    utilisateur précis (double filtre conversation_id + user_id, sécurité :
    on ne veut jamais qu'un utilisateur puisse supprimer la conversation
    d'un autre en devinant/forgeant un conversation_id).
    """
    client = _get_client()

    client.table("conversation_messages") \
        .delete() \
        .eq("conversation_id", conversation_id) \
        .eq("user_id", user_id) \
        .execute()

    client.table("conversation_summaries") \
        .delete() \
        .eq("conversation_id", conversation_id) \
        .eq("user_id", user_id) \
        .execute()