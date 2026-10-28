"""
Évalue le RAG en séparant clairement réglage et évaluation finale.

Jeux :
  - développement (19 Q) : scripts/dev_questions.json  → --mode dev
  - test indépendant (60 Q) : scripts/test_questions.json → --mode test (défaut)

Les paramètres (modèles, seuils, filtres) doivent être figés avant --mode test
(voir scripts/config_fige.json).

Métriques automatiques (portée étroite — NE PAS assimiler à une exactitude globale) :
  - taux_questions_pertinentes_avec_resultat : ≥1 fiche retournée sur Q pertinentes
  - taux_rejet_hors_sujet : hors-sujet sans fiche (pas une précision d'abstention)
  - hit_rate_at_k / mrr : diagnostic de recherche (vérité terrain nominative)
  - similarite_moyenne : diagnostic de retrieval
  - prudence_par_mots_cles : heuristique exploratoire, échantillon réduit

La qualité réelle (exactitude montants/devises, fidélité, complétude, utilité)
passe par la grille d'évaluation humaine (champs grille_humaine + sorties brutes).

Usage :
    python scripts/evaluate_rag.py
    python scripts/evaluate_rag.py --mode test
    python scripts/evaluate_rag.py --mode dev
    python scripts/evaluate_rag.py --mode test --limit 5
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.rag import ask
from src import config

SCRIPTS_DIR = os.path.dirname(__file__)
RESULTS_DIR = os.path.join(os.path.dirname(SCRIPTS_DIR), "result_eval")

MARQUEURS_PRUDENCE = [
    "ne permettent pas", "ne permet pas", "aucune donnée",
    "aucune information", "impossible de", "ne mentionne pas",
    "ne contiennent pas", "ne disposons pas", "ne dispose pas",
]

DEFINITIONS_METRIQUES = {
    "taux_comportement_retrieval_attendu": (
        "Part des questions où le comportement de retrieval attendu est observé "
        "(fiche(s) présentes ou absentes selon la catégorie). "
        "Définition ÉTROITE : ne mesure PAS l'exactitude du contenu de la réponse."
    ),
    "taux_questions_pertinentes_avec_resultat": (
        "Parmi les questions pertinentes, part ayant reçu au moins une fiche. "
        "Une source retournée ne prouve pas une réponse correcte. "
        "Ancien nom trompeur : « rappel »."
    ),
    "taux_rejet_hors_sujet": (
        "Parmi les questions hors sujet, part sans fiche retournée. "
        "Ce n'est PAS la précision de l'abstention ; le résultat hors-sujet "
        "reste exploratoire si l'échantillon est petit."
    ),
    "hit_rate_at_k": (
        "Diagnostic de recherche : le concurrent attendu apparaît-il dans le TOP-K ? "
        "Ne mesure pas la véracité ni la complétude de la réponse générée."
    ),
    "mrr": (
        "Mean Reciprocal Rank sur le sous-ensemble à vérité terrain nominative. "
        "Diagnostic de ranking, pas d'exactitude de réponse."
    ),
    "similarite_moyenne_globale": (
        "Moyenne des similarités cosinus des fiches retournées. Diagnostic retrieval."
    ),
    "prudence_par_mots_cles": (
        "Heuristique par mots-clés sur le texte de réponse. "
        "Une formule prudente peut accompagner une erreur ; échantillon souvent réduit."
    ),
}


def _chemin_questions(mode: str) -> str:
    nom = "dev_questions.json" if mode == "dev" else "test_questions.json"
    return os.path.join(SCRIPTS_DIR, nom)


def _chemin_resultats(mode: str) -> str:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    return os.path.join(
        RESULTS_DIR,
        f"evaluation_{mode}_{config.LLM_PROVIDER}.json",
    )


def charger_questions(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "questions" in data:
        return data["questions"]
    raise ValueError(f"Format de questions non reconnu dans {path}")


def evaluer_une_question(item: dict) -> dict:
    """Exécute le RAG et juge uniquement le comportement de retrieval attendu."""
    debut = time.time()
    resultat = ask(item["question"])
    duree = time.time() - debut

    a_des_sources = len(resultat["sources"]) > 0
    similarite_moyenne = (
        sum(s["similarity"] for s in resultat["sources"]) / len(resultat["sources"])
        if a_des_sources
        else None
    )

    attendu = item["attendu"]
    if attendu == "reponse_avec_sources":
        correct = a_des_sources
    elif attendu == "aucune_source":
        correct = not a_des_sources
    elif attendu == "aucune_source_ou_faible_confiance":
        toutes_faible_confiance = a_des_sources and all(
            s.get("confiance_faible", False) for s in resultat["sources"]
        )
        correct = (not a_des_sources) or toutes_faible_confiance
    elif attendu == "aucune_source_ou_reponse_prudente":
        reponse_prudente = any(
            m in resultat["reponse"].lower() for m in MARQUEURS_PRUDENCE
        )
        correct = (not a_des_sources) or reponse_prudente
    else:
        correct = None

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

    # Grille humaine : conserver le template du jeu (non rempli ici)
    grille = item.get("grille_humaine") or {
        "sources_pertinentes": None,
        "exactitude_montants_devises": None,
        "fidelite_documents": None,
        "completude": None,
        "abstention_correcte": None,
        "utilite_commerciale": None,
        "justification": None,
        "evaluateur": None,
    }

    return {
        "id": item["id"],
        "question": item["question"],
        "categorie": item["categorie"],
        "attendu": attendu,
        "reponse_attendue": item.get("reponse_attendue"),
        "a_trouve_des_sources": a_des_sources,
        "nb_sources": len(resultat["sources"]),
        "similarite_moyenne": round(similarite_moyenne, 3) if similarite_moyenne else None,
        "temps_reponse_sec": round(duree, 2),
        "comportement_retrieval_attendu": correct,
        # alias conservé pour scripts legacy (show_misses, check_diversity)
        "comportement_correct": correct,
        "concurrent_attendu": concurrents_attendus,
        "hit_at_k": hit,
        "reciprocal_rank": reciprocal_rank,
        "reponse": resultat["reponse"],
        "sources": resultat["sources"],
        "grille_humaine": grille,
    }


def _detail_echec(r: dict) -> dict:
    return {
        "id": r["id"],
        "categorie": r["categorie"],
        "question": r["question"],
        "attendu": r["attendu"],
        "comportement_retrieval_attendu": r["comportement_retrieval_attendu"],
        "hit_at_k": r["hit_at_k"],
        "concurrent_attendu": r["concurrent_attendu"],
        "sources_retournees": [s["nom"] for s in r["sources"]],
        "similarites": [s.get("similarity") for s in r["sources"]],
        "extrait_reponse": (r["reponse"] or "")[:280],
        "reponse_attendue": r.get("reponse_attendue"),
    }


def calculer_metriques(resultats: list[dict]) -> dict:
    n = len(resultats)
    temps_total = sum(r["temps_reponse_sec"] for r in resultats)

    jugeables = [r for r in resultats if r["comportement_retrieval_attendu"] is not None]
    corrects = [r for r in jugeables if r["comportement_retrieval_attendu"]]

    pertinentes_total = [r for r in resultats if r["categorie"].startswith("pertinente")]
    pertinentes_avec_sources = [r for r in pertinentes_total if r["a_trouve_des_sources"]]

    hors_sujet_total = [r for r in resultats if r["categorie"] == "hors_sujet"]
    hors_sujet_rejetees = [r for r in hors_sujet_total if not r["a_trouve_des_sources"]]

    similarites = [r["similarite_moyenne"] for r in resultats if r["similarite_moyenne"] is not None]

    verite = [r for r in resultats if r["hit_at_k"] is not None]
    hit_rate = None
    mrr = None
    if verite:
        hits = [r for r in verite if r["hit_at_k"]]
        hit_rate = round(100 * len(hits) / len(verite), 1)
        mrr = round(sum(r["reciprocal_rank"] for r in verite) / len(verite), 3)

    # Prudence par mots-clés — exploratoire, sur hors_couverture surtout
    hors_couv = [r for r in resultats if r["categorie"] == "hors_couverture"]
    hors_couv_prudentes = [
        r for r in hors_couv
        if any(m in (r["reponse"] or "").lower() for m in MARQUEURS_PRUDENCE)
        or not r["a_trouve_des_sources"]
    ]

    echecs_retrieval = [
        _detail_echec(r) for r in resultats
        if r["comportement_retrieval_attendu"] is False
    ]
    echecs_hit = [
        _detail_echec(r) for r in resultats
        if r["hit_at_k"] is False
    ]

    taux_retrieval = (
        round(100 * len(corrects) / len(jugeables), 1) if jugeables else None
    )
    taux_pertinentes = (
        round(100 * len(pertinentes_avec_sources) / len(pertinentes_total), 1)
        if pertinentes_total else None
    )
    taux_rejet = (
        round(100 * len(hors_sujet_rejetees) / len(hors_sujet_total), 1)
        if hors_sujet_total else None
    )

    return {
        "nb_questions_testees": n,
        "temps_reponse_moyen_sec": round(temps_total / n, 2) if n else 0,
        "taux_comportement_retrieval_attendu": {
            "valeur": (
                f"{len(corrects)}/{len(jugeables)} ({taux_retrieval}%)"
                if jugeables else "N/A"
            ),
            "definition": DEFINITIONS_METRIQUES["taux_comportement_retrieval_attendu"],
            "avertissement": (
                "Ne pas présenter ce pourcentage comme une exactitude générale du système."
            ),
        },
        "taux_questions_pertinentes_avec_resultat": {
            "valeur": (
                f"{len(pertinentes_avec_sources)}/{len(pertinentes_total)} ({taux_pertinentes}%)"
                if pertinentes_total else "N/A"
            ),
            "definition": DEFINITIONS_METRIQUES["taux_questions_pertinentes_avec_resultat"],
        },
        "taux_rejet_hors_sujet": {
            "valeur": (
                f"{len(hors_sujet_rejetees)}/{len(hors_sujet_total)} ({taux_rejet}%)"
                if hors_sujet_total else "N/A"
            ),
            "definition": DEFINITIONS_METRIQUES["taux_rejet_hors_sujet"],
            "avertissement": (
                f"Échantillon hors-sujet = {len(hors_sujet_total)} ; "
                "résultat exploratoire si N est faible."
            ),
        },
        "hit_rate_at_k": {
            "valeur": (
                f"{hit_rate}% ({len(verite)} question(s) avec concurrent_attendu)"
                if hit_rate is not None else "N/A"
            ),
            "k": config.TOP_K_RESULTS,
            "definition": DEFINITIONS_METRIQUES["hit_rate_at_k"],
        },
        "mrr": {
            "valeur": mrr if mrr is not None else "N/A",
            "definition": DEFINITIONS_METRIQUES["mrr"],
        },
        "similarite_moyenne_globale": {
            "valeur": (
                round(sum(similarites) / len(similarites), 3) if similarites else None
            ),
            "definition": DEFINITIONS_METRIQUES["similarite_moyenne_globale"],
        },
        "prudence_par_mots_cles": {
            "valeur": (
                f"{len(hors_couv_prudentes)}/{len(hors_couv)}"
                if hors_couv else "N/A"
            ),
            "definition": DEFINITIONS_METRIQUES["prudence_par_mots_cles"],
        },
        "echecs_detail": {
            "retrieval": echecs_retrieval,
            "hit_rate": echecs_hit,
        },
    }


def _snapshot_config() -> dict:
    return {
        "LLM_PROVIDER": config.LLM_PROVIDER,
        "GEMINI_CHAT_MODEL": config.GEMINI_CHAT_MODEL,
        "CLAUDE_MODEL": config.CLAUDE_MODEL,
        "EMBEDDING_MODEL": config.EMBEDDING_MODEL,
        "TOP_K_RESULTS": config.TOP_K_RESULTS,
        "CONFIDENCE_THRESHOLD": config.CONFIDENCE_THRESHOLD,
        "ZONE_COUVERTURE_KEYWORDS": list(config.ZONE_COUVERTURE_KEYWORDS),
        "VILLES_HORS_ZONE_CONNUES": list(config.VILLES_HORS_ZONE_CONNUES),
        "config_fige_ref": "scripts/config_fige.json",
    }


def _exporter_grille_humaine(resultats: list[dict], mode: str) -> str:
    """Fichier dédié pour l'annotation humaine (sorties brutes + cases vides)."""
    path = os.path.join(RESULTS_DIR, f"grille_humaine_{mode}_{config.LLM_PROVIDER}.json")
    payload = []
    for r in resultats:
        payload.append({
            "id": r["id"],
            "question": r["question"],
            "categorie": r["categorie"],
            "reponse_attendue": r.get("reponse_attendue"),
            "reponse_systeme": r["reponse"],
            "sources_systeme": r["sources"],
            "grille_humaine": r["grille_humaine"],
            "consigne": (
                "Noter 0–3 : sources_pertinentes, exactitude_montants_devises, "
                "fidelite_documents, completude, abstention_correcte, utilite_commerciale. "
                "Remplir justification + evaluateur. Conserver ce fichier tel quel."
            ),
        })
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def main():
    parser = argparse.ArgumentParser(description="Évaluation RAG (dev vs test)")
    parser.add_argument(
        "--mode", choices=["dev", "test"], default="test",
        help="dev = jeu de réglage (19 Q) ; test = évaluation finale indépendante (60 Q)",
    )
    parser.add_argument("--limit", type=int, default=None, help="Limiter le nombre de questions")
    parser.add_argument("--sleep", type=float, default=3.0, help="Pause entre appels (rate limit)")
    args = parser.parse_args()

    questions_path = _chemin_questions(args.mode)
    results_path = _chemin_resultats(args.mode)
    questions = charger_questions(questions_path)
    if args.limit:
        questions = questions[: args.limit]

    print(f" Mode={args.mode} | {len(questions)} questions | provider={config.LLM_PROVIDER}")
    print(f" Fichier : {questions_path}")
    if args.mode == "test":
        print(" RAPPEL : paramètres figés (config_fige.json) — pas de réglage pendant ce run.\n")
    else:
        print(" Mode DEV : réglage autorisé ; ne pas publier ces scores comme résultats finaux.\n")

    resultats = []
    for i, item in enumerate(questions, start=1):
        print(f"[{i}/{len(questions)}] {item['id']} ({item['categorie']})...", end=" ", flush=True)
        r = evaluer_une_question(item)
        resultats.append(r)
        ok = r["comportement_retrieval_attendu"]
        verdict = "✅" if ok else ("❓" if ok is None else "❌")
        print(f"{verdict} ({r['temps_reponse_sec']}s, {r['nb_sources']} source(s))")
        if i < len(questions):
            time.sleep(args.sleep)

    metriques = calculer_metriques(resultats)

    print("\n" + "=" * 60)
    print(" MÉTRIQUES (portée étroite — voir définitions)")
    print("=" * 60)
    for cle, valeur in metriques.items():
        if cle == "echecs_detail":
            n_ret = len(valeur["retrieval"])
            n_hit = len(valeur["hit_rate"])
            print(f"echecs_detail : {n_ret} échec(s) retrieval, {n_hit} miss hit@k")
            continue
        if isinstance(valeur, dict) and "valeur" in valeur:
            print(f"{cle} : {valeur['valeur']}")
        else:
            print(f"{cle} : {valeur}")

    sortie = {
        "meta": {
            "mode": args.mode,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "questions_file": os.path.basename(questions_path),
            "config": _snapshot_config(),
            "avertissement_global": (
                "Les taux automatiques mesurent le comportement de retrieval / rejet, "
                "pas l'exactitude générale des réponses. Compléter par la grille humaine."
            ),
        },
        "metriques": metriques,
        "details": resultats,
    }

    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(sortie, f, ensure_ascii=False, indent=2)

    grille_path = _exporter_grille_humaine(resultats, args.mode)

    print(f"\n Résultats bruts : {results_path}")
    print(f" Grille humaine  : {grille_path}")
    print(" Remplir grille_humaine (0–3 + justification) avant de conclure dans le mémoire.")


if __name__ == "__main__":
    main()
