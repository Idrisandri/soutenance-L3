"""
Évalue le RAG sur un jeu de questions représentatif (scripts/test_questions.json)
et calcule les métriques à présenter en soutenance / dans le mémoire.

Usage :
    python scripts/evaluate_rag.py
"""
import sys
import os
import time
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.rag import ask

QUESTIONS_FILE = os.path.join(os.path.dirname(__file__), "test_questions.json")
RESULTS_FILE = os.path.join(os.path.dirname(__file__), "evaluation_results.json")

# Marqueurs textuels indiquant que le LLM répond avec prudence (signale une
# limite des données plutôt que d'affirmer quelque chose de non vérifiable).
# Liste non exhaustive, heuristique par mots-clés — à enrichir si de nouvelles
# formulations apparaissent dans de futurs tests.
MARQUEURS_PRUDENCE = [
    "ne permettent pas", "ne permet pas", "aucune donnée",
    "aucune information", "impossible de", "ne mentionne pas",
    "ne contiennent pas", "ne disposons pas", "ne dispose pas",
]


def charger_questions():
    with open(QUESTIONS_FILE, encoding="utf-8") as f:
        return json.load(f)


def evaluer_une_question(item):
    """Pose une question au RAG, chronomètre, et vérifie si le comportement
    correspond à ce qui était attendu (source trouvée ou pas)."""
    debut = time.time()
    resultat = ask(item["question"])
    duree = time.time() - debut

    a_des_sources = len(resultat["sources"]) > 0
    similarite_moyenne = (
        sum(s["similarity"] for s in resultat["sources"]) / len(resultat["sources"])
        if a_des_sources
        else None
    )

    # Détermine si le comportement est celui attendu, selon la catégorie
    attendu = item["attendu"]
    if attendu == "reponse_avec_sources":
        correct = a_des_sources
    elif attendu == "aucune_source":
        correct = not a_des_sources
    elif attendu == "aucune_source_ou_faible_confiance":
        # Correct si aucune source, OU si toutes les sources retournées sont
        # en dessous du vrai seuil de confiance (donc ajoutées uniquement par
        # le floor de search.py, pas par une correspondance sémantique réelle).
        toutes_faible_confiance = a_des_sources and all(
            s.get("confiance_faible", False) for s in resultat["sources"]
        )
        correct = (not a_des_sources) or toutes_faible_confiance
    elif attendu == "aucune_source_ou_reponse_prudente":
        # Correct si aucune source, OU si le texte de la réponse contient un
        # marqueur explicite de prudence (le LLM signale une limite plutôt
        # que d'affirmer quelque chose que les données ne permettent pas de
        # dire).
        reponse_prudente = any(
            m in resultat["reponse"].lower() for m in MARQUEURS_PRUDENCE
        )
        correct = (not a_des_sources) or reponse_prudente
    else:
        # Cas vraiment non prévus : on ne juge pas automatiquement.
        correct = None

    # --- Hit Rate@k et Mean Reciprocal Rank, pour les questions où on connaît
    # la (les) bonne(s) réponse(s) avec certitude (concurrent nommé explicitement
    # dans la question). Les sources sont déjà triées par similarité décroissante.
    reciprocal_rank = None
    hit = None
    concurrents_attendus = item.get("concurrent_attendu")
    if concurrents_attendus:
        noms_attendus_lower = [c.lower() for c in concurrents_attendus]
        rang_trouve = None
        for rang, source in enumerate(resultat["sources"], start=1):
            if source["nom"].lower() in noms_attendus_lower:
                rang_trouve = rang
                break
        hit = rang_trouve is not None
        reciprocal_rank = (1 / rang_trouve) if rang_trouve else 0.0

    return {
        "id": item["id"],
        "question": item["question"],
        "categorie": item["categorie"],
        "attendu": attendu,
        "a_trouve_des_sources": a_des_sources,
        "nb_sources": len(resultat["sources"]),
        "similarite_moyenne": round(similarite_moyenne, 3) if similarite_moyenne else None,
        "temps_reponse_sec": round(duree, 2),
        "comportement_correct": correct,
        "concurrent_attendu": concurrents_attendus,
        "hit_at_k": hit,
        "reciprocal_rank": reciprocal_rank,
        "reponse": resultat["reponse"],
        "sources": resultat["sources"],
    }


def calculer_metriques(resultats):
    """Calcule les métriques globales à partir de tous les résultats."""
    n = len(resultats)
    temps_total = sum(r["temps_reponse_sec"] for r in resultats)

    # Precision/recall sur les cas jugeables (reponse_avec_sources / aucune_source)
    jugeables = [r for r in resultats if r["comportement_correct"] is not None]
    corrects = [r for r in jugeables if r["comportement_correct"]]

    pertinentes_avec_sources = [
        r for r in resultats if r["categorie"].startswith("pertinente") and r["a_trouve_des_sources"]
    ]
    pertinentes_total = [r for r in resultats if r["categorie"].startswith("pertinente")]

    hors_sujet_rejetees = [
        r for r in resultats if r["categorie"] == "hors_sujet" and not r["a_trouve_des_sources"]
    ]
    hors_sujet_total = [r for r in resultats if r["categorie"] == "hors_sujet"]

    similarites = [r["similarite_moyenne"] for r in resultats if r["similarite_moyenne"] is not None]

    # --- Hit Rate@k et MRR, sur le sous-ensemble de questions avec un
    # concurrent attendu connu avec certitude ---
    questions_avec_verite_terrain = [r for r in resultats if r["hit_at_k"] is not None]
    hit_rate = None
    mrr = None
    if questions_avec_verite_terrain:
        hits = [r for r in questions_avec_verite_terrain if r["hit_at_k"]]
        hit_rate = round(100 * len(hits) / len(questions_avec_verite_terrain), 1)
        mrr = round(
            sum(r["reciprocal_rank"] for r in questions_avec_verite_terrain)
            / len(questions_avec_verite_terrain),
            3,
        )

    return {
        "nb_questions_testees": n,
        "temps_reponse_moyen_sec": round(temps_total / n, 2) if n else 0,
        "taux_comportement_correct": round(100 * len(corrects) / len(jugeables), 1) if jugeables else None,
        "rappel_questions_pertinentes": (
            f"{len(pertinentes_avec_sources)}/{len(pertinentes_total)} "
            f"({round(100 * len(pertinentes_avec_sources) / len(pertinentes_total), 1)}%)"
            if pertinentes_total else "N/A"
        ),
        "precision_rejet_hors_sujet": (
            f"{len(hors_sujet_rejetees)}/{len(hors_sujet_total)} "
            f"({round(100 * len(hors_sujet_rejetees) / len(hors_sujet_total), 1)}%)"
            if hors_sujet_total else "N/A"
        ),
        "similarite_moyenne_globale": round(sum(similarites) / len(similarites), 3) if similarites else None,
        "hit_rate_at_5": (
            f"{hit_rate}% ({len(questions_avec_verite_terrain)} question(s) avec vérité terrain)"
            if hit_rate is not None else "N/A (aucune question avec concurrent_attendu)"
        ),
        "mrr": mrr if mrr is not None else "N/A",
    }


def main():
    questions = charger_questions()
    print(f" Évaluation du RAG sur {len(questions)} questions...\n")

    resultats = []
    for i, item in enumerate(questions, start=1):
        print(f"[{i}/{len(questions)}] {item['id']} ({item['categorie']})...", end=" ")
        r = evaluer_une_question(item)
        resultats.append(r)
        verdict = "✅" if r["comportement_correct"] else ("❓" if r["comportement_correct"] is None else "❌")
        print(f"{verdict} ({r['temps_reponse_sec']}s, {r['nb_sources']} source(s))")

        # Petite pause pour rester sous la limite gratuite Gemini (5 req/min)
        if i < len(questions):
            time.sleep(3)

    metriques = calculer_metriques(resultats)

    print("\n" + "=" * 60)
    print(" MÉTRIQUES GLOBALES")
    print("=" * 60)
    for cle, valeur in metriques.items():
        print(f"{cle} : {valeur}")

    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump({"metriques": metriques, "details": resultats}, f, ensure_ascii=False, indent=2)

    print(f"\n Résultats détaillés sauvegardés dans {RESULTS_FILE}")
    


if __name__ == "__main__":
    main()