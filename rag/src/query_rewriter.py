"""
Reformule la question en s'appuyant sur l'historique conversationnel, pour
que le RAG (embeddings + recherche vectorielle) reçoive une question
autonome et cherchable, même si l'utilisateur a écrit "et pour le mobile ?"
ou "et lui ?" en référence à un échange précédent.

Repris et adapté d'un projet précédent (qui utilisait MongoDB + langchain)
vers ce projet : on réutilise llm_client.generate_response() déjà en place
ici (switch Gemini/Claude via config.LLM_PROVIDER), donc pas besoin d'une
dépendance langchain supplémentaire.
"""
from . import llm_client

REWRITE_PROMPT = """Tu reformules une question pour la rendre autonome et cherchable, en te basant sur l'historique de conversation.

Règle : si la question fait déjà sens seule (pas de "il", "ça", "les autres", etc. faisant référence à un échange précédent), renvoie-la EXACTEMENT telle quelle, sans rien changer.

Si elle dépend du contexte précédent, reformule-la en une question complète et explicite, sans pronoms ambigus, en intégrant le sujet concerné.

Ne réponds JAMAIS à la question, reformule-la uniquement. Ne donne aucune explication, juste la question reformulée.

Historique :
{history}

Question à traiter :
{question}

Question reformulée :"""


def rewrite_query(question: str, history_text: str) -> str:
    """
    Retourne la question telle quelle si pas d'historique disponible, sinon
    la version reformulée par le LLM (autonome, sans référence implicite).

    En cas d'erreur d'appel LLM (API down, timeout...), retombe sur la
    question originale plutôt que de faire planter toute la requête pour un
    problème de confort — mieux vaut une recherche moins précise qu'une
    erreur 500 sur /ask.
    """
    if not history_text.strip():
        return question

    prompt = REWRITE_PROMPT.format(history=history_text, question=question)

    try:
        rewritten = llm_client.generate_response(prompt)
    except Exception:
        return question

    rewritten = rewritten.strip()
    return rewritten if rewritten else question