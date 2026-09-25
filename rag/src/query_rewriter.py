"""
Reformule la question en s'appuyant sur l'historique conversationnel, pour
que le RAG (embeddings + recherche vectorielle) reçoive une question
autonome et cherchable, même si l'utilisateur a écrit "et pour le mobile ?"
ou "et lui ?" en référence à un échange précédent.

OPTIMISATION : deux mesures pour réduire la consommation d'appels LLM,
identifiée comme cause principale des erreurs de rate limit Gemini :
1. Filtre heuristique — si la question ne contient aucun indice de
   dépendance au contexte (pronom, "et..."), on ne fait même pas l'appel
   LLM, elle est presque toujours déjà autonome dans ce cas.
2. Modèle léger — l'appel qui reste nécessaire utilise generate_response_light
   (modèle plus rapide/économique), pas le modèle principal configuré pour
   la réponse finale — cette tâche de reformulation est simple et n'a pas
   besoin de la puissance du modèle premium.
"""
import re
from . import llm_client

# Mots/tournures qui indiquent une possible dépendance au contexte précédent.
# Si aucun de ces indices n'est présent, on ne fait même pas l'appel LLM —
# la question est presque toujours déjà autonome dans ce cas.
INDICES_DEPENDANCE_CONTEXTE = [
    r"\bil\b", r"\belle\b", r"\bils\b", r"\belles\b",
    r"\beux\b", r"\blui\b", r"\bleur\b", r"\bleurs\b",
    r"\bça\b", r"\bcela\b", r"\bcelui\b", r"\bcelle\b", r"\bceux\b",
    r"\bce dernier\b", r"\bcet autre\b", r"\bles deux\b",
    r"^et\b",  # "Et son budget ?", "Et pour le mobile ?"
]


def _semble_dependre_du_contexte(question: str) -> bool:
    q = question.lower()
    return any(re.search(pattern, q) for pattern in INDICES_DEPENDANCE_CONTEXTE)


REWRITE_PROMPT = """Tu reformules une question pour la rendre autonome et cherchable, en te basant sur l'historique de conversation.

Règle stricte : reformule UNIQUEMENT si la question contient une référence implicite claire à un élément précis de l'historique — un pronom ("il", "elle", "ça", "eux", "leur") ou une expression comme "celui-ci", "cet autre", "les deux premiers" qui ne fait sens qu'avec le contexte.

Si la question ne contient AUCUNE référence de ce type — même si elle porte sur un sujet déjà abordé, même si elle est générale ou ouverte — renvoie-la EXACTEMENT telle quelle. Une question générale comme "quels concurrents ont les avis les plus négatifs ?" ou "compare les tarifs entre le web et le mobile" doit TOUJOURS être traitée comme portant sur l'ENSEMBLE de la base de données, jamais restreinte aux seuls concurrents déjà mentionnés dans la conversation, sauf si la question le demande explicitement (ex: "et eux, ils sont chers ?", "entre ces deux-là, lequel est le moins cher ?").

Ne réponds JAMAIS à la question, reformule-la uniquement. Ne donne aucune explication, juste la question reformulée.

Historique :
{history}

Question à traiter :
{question}

Question reformulée :"""


def rewrite_query(question: str, history_text: str) -> str:
    """
    Retourne la question telle quelle si :
    - pas d'historique disponible, OU
    - la question ne contient aucun indice de dépendance au contexte
      (filtre heuristique, économise l'appel LLM dans la majorité des cas).

    Sinon, appelle le LLM léger pour reformuler. En cas d'erreur, retombe
    sur la question originale plutôt que de faire planter toute la requête.
    """
    if not history_text.strip():
        return question

    if not _semble_dependre_du_contexte(question):
        return question

    prompt = REWRITE_PROMPT.format(history=history_text, question=question)

    try:
        rewritten = llm_client.generate_response_light(prompt)
    except Exception:
        return question

    rewritten = rewritten.strip()
    return rewritten if rewritten else question