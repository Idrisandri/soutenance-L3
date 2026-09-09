"""
Point d'entrée principal du RAG.

Assemble : question de l'utilisateur → recherche des concurrents pertinents
→ construction du prompt avec contexte → appel au LLM (Gemini ou Claude selon
LLM_PROVIDER) → réponse finale.

MODIFS (cf. discussion éval) :
1. Court-circuit "hors zone géographique" AVANT tout appel embedding/LLM,
   via hors_zone.py — filtre structurel, indépendant de l'obéissance du LLM
   au prompt.
2. Le texte réellement envoyé au LLM (contexte complet, pas juste le nom du
   concurrent) est maintenant conservé dans le retour de ask(), sous la clé
   "extrait", pour permettre l'audit a posteriori des réponses (vérifier
   qu'une affirmation du LLM correspond bien au contenu de la fiche source,
   au lieu de devoir faire une confiance aveugle).
"""
from . import search as search_module
from . import llm_client
from . import hors_zone


PROMPT_TEMPLATE = """Tu es un assistant qui aide l'équipe commerciale d'une agence de développement web et mobile à Lille à se positionner face à la concurrence.

Voici des données réelles sur des concurrents pertinents pour la question posée :

{contexte}

Question de l'équipe commerciale : {question}

Consignes :
- Réponds en français, de façon concise et directement utilisable par un commercial.
- Base-toi uniquement sur les données fournies ci-dessus. Si les données ne
  permettent pas de répondre complètement, dis-le clairement plutôt que de
  supposer ou d'inventer des informations.
- Vérifie que les documents fournis correspondent réellement aux critères
  explicites de la question (localisation géographique mentionnée, type de
  prestation précis demandé, etc.). Nos données couvrent uniquement des
  concurrents situés à Lille et ses environs, sur des prestations de
  développement web et mobile. Si la question porte sur une zone géographique
  différente, ou sur une prestation qui n'est pas explicitement mentionnée
  dans les documents fournis (ex: SEO, référencement, maintenance...), indique
  clairement cette limite au lieu de répondre comme si les documents
  correspondaient parfaitement.
{note_couverture}"""


NOTE_COUVERTURE_FAIBLE = """
- Attention : la question posée est large ou peu spécifique, donc la recherche
  n'a pu identifier que peu de concurrents avec une forte correspondance
  sémantique. Les données ci-dessus ne représentent qu'un échantillon de notre
  base de {total_base} concurrents, pas l'ensemble du marché lillois. Précise
  explicitement cette limite dans ta réponse, et suggère à l'utilisateur de
  reformuler avec un critère plus précis (nom d'entreprise, budget, taux
  horaire, thème d'avis...) pour une réponse plus complète."""


NO_RESULTS_MESSAGE = (
    "Je n'ai pas de données fiables sur ce point dans notre base de "
    "concurrents actuelle. Essaie de reformuler la question, ou il faudra "
    "peut-être élargir la collecte de données pour couvrir ce cas."
)

# Nombre total de concurrents en base, utilisé uniquement pour contextualiser
# la note de couverture faible ci-dessus (pas une valeur critique — à ajuster
# si la base grandit significativement).
TOTAL_CONCURRENTS_BASE = 69


def ask(question: str) -> dict:
    """
    Fonction principale : pose une question au RAG, retourne la réponse
    ainsi que les sources utilisées (pour affichage/transparence) et,
    maintenant, l'extrait de contexte réel envoyé au LLM (pour audit).
    """
    # --- Fix 1 : court-circuit hors zone, avant tout appel coûteux ---
    if hors_zone.question_hors_zone(question):
        return {
            "reponse": hors_zone.MESSAGE_HORS_ZONE,
            "sources": [],
            "hors_zone_detectee": True,
        }

    resultats = search_module.search(question)

    if not resultats:
        return {
            "reponse": NO_RESULTS_MESSAGE,
            "sources": [],
        }

    contexte = "\n\n---\n\n".join(r["document"] for r in resultats)

    # Si la majorité des résultats sont sous le seuil de confiance (donc
    # ajoutés uniquement pour garantir un minimum), on prévient le LLM pour
    # qu'il nuance sa réponse plutôt que de la présenter comme exhaustive.
    nb_confiance_faible = sum(1 for r in resultats if r.get("confiance_faible"))
    note_couverture = (
        NOTE_COUVERTURE_FAIBLE.format(total_base=TOTAL_CONCURRENTS_BASE)
        if nb_confiance_faible > len(resultats) / 2
        else ""
    )

    prompt = PROMPT_TEMPLATE.format(
        contexte=contexte, question=question, note_couverture=note_couverture
    )

    reponse = llm_client.generate_response(prompt)

    return {
        "reponse": reponse,
        "sources": [
            {
                "nom": r["nom"],
                "service_type": r["service_type"],
                "similarity": r["similarity"],
                "confiance_faible": r.get("confiance_faible", False),
                # Fix 2 : on garde le texte réellement vu par le LLM pour ce
                # concurrent, afin de pouvoir vérifier après coup que la
                # réponse générée ne dit rien qui ne soit pas dans ce texte.
                "extrait": r["document"],
            }
            for r in resultats
        ],
        # Utile en éval : permet de rejouer/vérifier le prompt exact envoyé.
        "prompt_complet": prompt,
    }