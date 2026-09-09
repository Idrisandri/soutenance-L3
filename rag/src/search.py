"""
Recherche des concurrents les plus pertinents pour une question donnée,
via similarité vectorielle (cosine similarity, pgvector).

Applique un seuil de confiance : les résultats trop peu similaires à la
question sont écartés, pour éviter que le LLM ne réponde à partir de
concurrents qui n'ont en fait rien à voir avec la demande (hallucination).
"""
from typing import Any

from . import config
from . import database
from . import embeddings
from .document_builder import build_document

# Nombre minimum de résultats à fournir au LLM, même si peu d'entre eux
# dépassent le seuil de confiance. Évite l'effet "un seul concurrent trouvé"
# sur des questions génériques ("Parle-moi de la concurrence à Lille"), qui
# donne l'impression trompeuse que la base ne couvre presque personne.
MIN_RESULTS_FLOOR = 5


def search(question: str) -> list[dict[str, Any]]:
    """
    Retourne une liste de résultats pertinents pour la question, chacun sous
    la forme {"nom", "service_type", "similarity", "document", "confiance_faible"}
    où "document" est le texte complet (prix + sentiment) prêt à donner en
    contexte au LLM, et "confiance_faible" indique un résultat en dessous du
    seuil de confiance, gardé uniquement pour atteindre MIN_RESULTS_FLOOR.

    Retourne une liste vide si aucun résultat brut n'existe du tout, ou si
    aucun ne dépasse le seuil de confiance — c'est à rag.py de gérer ce cas
    (répondre "je n'ai pas d'information fiable").
    """
    query_embedding = embeddings.embed_query(question)

    resultats_bruts = database.match_competitors(
        query_embedding=query_embedding,
        match_count=max(config.TOP_K_RESULTS, 12),
    )

    if not resultats_bruts:
        return []

    # Seuil de confiance : on écarte tout ce qui est en dessous
    resultats_filtres = [
        r for r in resultats_bruts if r["similarity"] >= config.CONFIDENCE_THRESHOLD
    ]

    # Si le seuil élimine presque tout MAIS qu'il reste au moins 1 résultat
    # pertinent (question vague mais réellement liée au sujet, ex: "Parle-moi
    # de la concurrence à Lille"), on complète jusqu'à MIN_RESULTS_FLOOR avec
    # les meilleurs résultats restants sous le seuil.
    #
    # IMPORTANT : si resultats_filtres est VIDE (0 résultat pertinent), on ne
    # complète surtout PAS — c'est le signal qu'une question est hors sujet
    # (météo, recette, bitcoin...), et il faut laisser cette fonction retourner
    # [] pour déclencher le message "aucune donnée fiable" plutôt que de forcer
    # des résultats sans rapport dans le contexte et risquer une hallucination.
    if 0 < len(resultats_filtres) < MIN_RESULTS_FLOOR:
        ids_deja_pris = {r["competitor_id"] for r in resultats_filtres}
        complement = [
            r for r in resultats_bruts
            if r["competitor_id"] not in ids_deja_pris
        ]
        # resultats_bruts est déjà trié par similarité décroissante (renvoyé
        # ainsi par match_competitors), donc complement l'est aussi.
        nb_a_ajouter = MIN_RESULTS_FLOOR - len(resultats_filtres)
        resultats_filtres = resultats_filtres + complement[:nb_a_ajouter]

    if not resultats_filtres:
        return []

    # On récupère les données complètes (prix + avis) uniquement pour ces résultats,
    # puis on reconstruit le texte formaté via document_builder (cohérent avec
    # ce qui a été embeddé).
    competitor_ids = [r["competitor_id"] for r in resultats_filtres]
    donnees_completes = database.fetch_joined_data_by_ids(competitor_ids)
    donnees_par_id = {d["competitor_id"]: d for d in donnees_completes}

    resultats_finaux = []
    for r in resultats_filtres:
        donnees = donnees_par_id.get(r["competitor_id"])
        if donnees is None:
            continue  # sécurité, ne devrait pas arriver
        resultats_finaux.append({
            "nom": r["nom"],
            "service_type": r["service_type"],
            "similarity": round(r["similarity"], 3),
            "document": build_document(donnees),
            "confiance_faible": r["similarity"] < config.CONFIDENCE_THRESHOLD,
        })

    return resultats_finaux