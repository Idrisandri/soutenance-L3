"""
Résume l'historique d'une conversation pour la mémoire à long terme.
Repris du principe de l'ancien projet (summarize_history), adapté pour
réutiliser llm_client.generate_response() déjà en place ici.
"""
from . import llm_client

SUMMARY_PROMPT = """Tu résumes une conversation entre un utilisateur et un assistant d'intelligence concurrentielle, pour garder le contexte essentiel sans garder tous les détails.

Résumé précédent (peut être vide s'il n'y en a pas encore) :
{previous_summary}

Nouveaux échanges à intégrer dans le résumé :
{new_exchanges}

Consignes :
- Produis un résumé court (5-10 lignes maximum), qui garde les informations importantes : quels concurrents ont été discutés, quels sujets (prix, avis, comparaisons...), et toute conclusion ou préférence exprimée par l'utilisateur.
- Fusionne le résumé précédent avec les nouveaux échanges en un seul résumé cohérent, pas une simple concaténation.
- Ne réponds à aucune question, ne fais que résumer.

Résumé mis à jour :"""


def summarize_history(previous_summary: str, new_exchanges: str) -> str:
    prompt = SUMMARY_PROMPT.format(
        previous_summary=previous_summary or "(aucun résumé précédent)",
        new_exchanges=new_exchanges,
    )

    try:
        return llm_client.generate_response_light(prompt).strip()
    except Exception:
        return f"{previous_summary}\n{new_exchanges}".strip()