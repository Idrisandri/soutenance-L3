"""
Module d'analyse de sentiment des avis concurrents (type Clutch).

Pipeline :
1. Lecture des avis depuis un JSON (liste d'objets: concurrent, titre, corps, note, service_type)
2. Groupement des avis par (concurrent, service_type) — une entreprise peut avoir
   un profil mobile ET un profil web, avec des avis distincts pour chacun.
3. Appel LLM avec sortie JSON structurée forcée (tool use)
4. Agrégation des résultats -> JSON + CSV, prêts à migrer vers Supabase (table avis_analyse)

Usage :
    python analyze_reviews.py avis_input.json

Prérequis :
    pip install anthropic
    export ANTHROPIC_API_KEY="sk-ant-..."
"""

import os
import sys
import csv
import json
import time
from collections import defaultdict

from dotenv import load_dotenv
import anthropic

load_dotenv()  # charge les variables du fichier .env dans os.environ

DOSSIER_AVIS = "avis"
DOSSIER_RESULTATS = "resultats"

MODEL = "claude-haiku-4-5"
MAX_RETRIES = 3

# Liste fermée de thèmes pour rester comparable entre concurrents.
THEMES = ["delais", "communication", "qualite", "prix", "reactivite", "expertise_technique"]

ANALYSIS_TOOL = {
    "name": "enregistrer_analyse",
    "description": "Enregistre l'analyse structurée des avis clients d'un concurrent.",
    "input_schema": {
        "type": "object",
        "properties": {
            "sentiment_global": {
                "type": "string",
                "enum": ["positif", "neutre", "negatif"],
                "description": "Sentiment dominant sur l'ensemble des avis du concurrent",
            },
            "score_sentiment": {
                "type": "number",
                "description": "Score de 0 (très négatif) à 1 (très positif)",
            },
            "themes": {
                "type": "array",
                "description": "Un item par thème détecté parmi la liste fermée",
                "items": {
                    "type": "object",
                    "properties": {
                        "theme": {"type": "string", "enum": THEMES},
                        "polarite": {"type": "string", "enum": ["positif", "neutre", "negatif"]},
                        "frequence": {
                            "type": "string",
                            "enum": ["ponctuel", "recurrent"],
                            "description": "Le thème revient dans un seul avis (ponctuel) ou plusieurs (recurrent)",
                        },
                        "resume": {
                            "type": "string",
                            "description": "Résumé paraphrasé en une phrase, jamais de citation exacte du texte source",
                        },
                    },
                    "required": ["theme", "polarite", "frequence", "resume"],
                },
            },
            "points_forts": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Points forts récurrents, en quelques mots chacun",
            },
            "points_faibles": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Points faibles récurrents, en quelques mots chacun",
            },
            "autres_points": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Éléments notables hors des thèmes de la liste fermée",
            },
        },
        "required": ["sentiment_global", "score_sentiment", "themes", "points_forts", "points_faibles"],
    },
}

SYSTEM_PROMPT = """Tu analyses des avis clients laissés sur une agence de développement web/mobile (type avis Clutch).
Les avis peuvent être rédigés en anglais ou dans une autre langue : tu les comprends et les analyses normalement,
mais TOUTE ta sortie (résumés, points forts, points faibles, autres points) doit être rédigée en français,
quelle que soit la langue des avis d'origine.

Consignes strictes :
- Base-toi UNIQUEMENT sur le contenu des avis fournis, n'invente rien.
- Utilise exclusivement les thèmes de cette liste fermée : delais, communication, qualite, prix, reactivite, expertise_technique.
- Ne reproduis JAMAIS de citation exacte du texte source dans tes résumés : paraphrase toujours, et traduis en français au passage.
- "frequence": "recurrent" seulement si le thème apparaît dans plusieurs avis distincts, sinon "ponctuel".
- Le score_sentiment doit refléter la tendance globale, pas juste la moyenne des notes numériques si elles contredisent le ton du texte.
- Réponds uniquement via l'outil enregistrer_analyse, pas de texte libre en dehors."""


def lire_avis(chemin_json):
    """Lit le JSON (liste d'objets avis) et regroupe les avis par (concurrent, service_type).

    Format attendu :
    [
      {"concurrent": "XYZ Digital", "titre": "...", "corps": "...", "note": 3, "service_type": "web"},
      ...
    ]
    Le champ "note" est optionnel. "service_type" par défaut à "mobile" si absent
    (mais dans notre pipeline il est toujours présent, cf. discovery.js).

    IMPORTANT : on groupe par (concurrent, service_type) et non juste par concurrent,
    car une même entreprise peut avoir 2 profils Clutch distincts (mobile + web) avec
    des competitor_id différents côté Supabase. Grouper uniquement par nom fusionnerait
    à tort les avis des deux profils et on perdrait la correspondance avec le bon id.
    """
    with open(chemin_json, encoding="utf-8") as f:
        avis_bruts = json.load(f)

    if not isinstance(avis_bruts, list):
        raise ValueError("Le JSON d'entrée doit être une liste d'objets avis.")

    avis_par_cle = defaultdict(list)
    for i, avis in enumerate(avis_bruts):
        concurrent = (avis.get("concurrent") or "").strip()
        service_type = (avis.get("service_type") or "mobile").strip()
        if not concurrent:
            print(f"  [!] Avis #{i} ignoré : champ 'concurrent' manquant ou vide")
            continue
        cle = (concurrent, service_type)
        avis_par_cle[cle].append(
            {
                "titre": (avis.get("titre") or "").strip(),
                "corps": (avis.get("corps") or "").strip(),
                "note": str(avis.get("note", "")).strip(),
            }
        )
    return avis_par_cle


def formatter_avis_pour_prompt(avis_liste):
    """Transforme la liste d'avis d'un concurrent en texte lisible pour le prompt."""
    blocs = []
    for i, avis in enumerate(avis_liste, 1):
        note = f" (note: {avis['note']}/5)" if avis["note"] else ""
        blocs.append(f"Avis {i}{note}\nTitre : {avis['titre']}\nTexte : {avis['corps']}")
    return "\n\n".join(blocs)


def analyser_concurrent(client, concurrent, service_type, avis_liste):
    """Envoie tous les avis d'un (concurrent, service_type) en un seul appel batché."""
    texte_avis = formatter_avis_pour_prompt(avis_liste)
    user_prompt = (
        f"Concurrent : {concurrent} (service : {service_type})\n"
        f"Nombre d'avis : {len(avis_liste)}\n\n{texte_avis}"
    )

    for tentative in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=2000,
                system=SYSTEM_PROMPT,
                tools=[ANALYSIS_TOOL],
                tool_choice={"type": "tool", "name": "enregistrer_analyse"},
                messages=[{"role": "user", "content": user_prompt}],
            )
            for bloc in response.content:
                if bloc.type == "tool_use" and bloc.name == "enregistrer_analyse":
                    resultat = bloc.input
                    resultat["concurrent"] = concurrent
                    resultat["service_type"] = service_type
                    resultat["nb_avis_analyses"] = len(avis_liste)
                    return resultat
            raise ValueError("Pas de tool_use trouvé dans la réponse")
        except Exception as e:
            print(f"  [!] Tentative {tentative}/{MAX_RETRIES} échouée pour {concurrent} [{service_type}] : {e}")
            if tentative < MAX_RETRIES:
                time.sleep(2 * tentative)
            else:
                return {
                    "concurrent": concurrent,
                    "service_type": service_type,
                    "erreur": str(e),
                    "nb_avis_analyses": len(avis_liste),
                }


def deduire_prefixe_sortie(chemin_json_entree):
    """Déduit le nom de sortie à partir du nom d'entrée, pour un fichier par entreprise/lot.

    glush.json          -> resultats_analyse_glush
    avis_entreprisex.json -> resultats_analyse_entreprisex   (compatibilité avec l'ancien préfixe)

    Ça évite d'écraser un résultat existant à chaque lancement : chaque lot
    d'avis garde son propre fichier de résultat dans resultats/, que
    migrate-avis-analyse.mjs ira ensuite chercher tout seul.
    """
    nom_fichier = os.path.basename(chemin_json_entree)
    nom_sans_ext = os.path.splitext(nom_fichier)[0]
    if nom_sans_ext.startswith("avis_"):
        suffixe = nom_sans_ext[len("avis_"):]
    else:
        suffixe = nom_sans_ext
    return f"resultats_analyse_{suffixe}"


def sauvegarder_resultats(resultats, prefixe="resultats_analyse"):
    """Écrit les résultats en JSON (détaillé, pour migration Supabase) et CSV (vue agrégée),
    dans le dossier resultats/ (créé automatiquement s'il n'existe pas)."""
    os.makedirs(DOSSIER_RESULTATS, exist_ok=True)

    chemin_json = os.path.join(DOSSIER_RESULTATS, f"{prefixe}.json")
    with open(chemin_json, "w", encoding="utf-8") as f:
        json.dump(resultats, f, ensure_ascii=False, indent=2)

    chemin_csv = os.path.join(DOSSIER_RESULTATS, f"{prefixe}.csv")
    with open(chemin_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "concurrent",
                "service_type",
                "sentiment_global",
                "score_sentiment",
                "nb_avis_analyses",
                "points_forts",
                "points_faibles",
                "themes_recurrents_negatifs",
                "themes_recurrents_positifs",
            ]
        )
        for r in resultats:
            if "erreur" in r:
                writer.writerow(
                    [r["concurrent"], r.get("service_type", ""), "ERREUR", "", r.get("nb_avis_analyses", ""), "", "", r["erreur"], ""]
                )
                continue
            themes = r.get("themes", [])
            neg_recurrents = [t["theme"] for t in themes if t["polarite"] == "negatif" and t["frequence"] == "recurrent"]
            pos_recurrents = [t["theme"] for t in themes if t["polarite"] == "positif" and t["frequence"] == "recurrent"]
            writer.writerow(
                [
                    r["concurrent"],
                    r.get("service_type", ""),
                    r.get("sentiment_global", ""),
                    r.get("score_sentiment", ""),
                    r.get("nb_avis_analyses", ""),
                    " | ".join(r.get("points_forts", [])),
                    " | ".join(r.get("points_faibles", [])),
                    " | ".join(neg_recurrents),
                    " | ".join(pos_recurrents),
                ]
            )
    return chemin_json, chemin_csv


def resoudre_chemin_entree(argument):
    """Résout le chemin du fichier d'avis à lire.

    - Si l'argument est un chemin qui existe tel quel (ex: avis/glush.json,
      ou un chemin absolu), on l'utilise directement.
    - Sinon, si un simple nom de fichier est donné (ex: glush.json), on va
      le chercher automatiquement dans le dossier avis/.
    """
    if os.path.exists(argument):
        return argument
    chemin_dans_avis = os.path.join(DOSSIER_AVIS, argument)
    if os.path.exists(chemin_dans_avis):
        return chemin_dans_avis
    return argument  # on laisse échouer avec un message clair plus bas


def main():
    if len(sys.argv) < 2:
        print(f"Usage : python analyze_reviews.py <fichier.json>  (cherché dans {DOSSIER_AVIS}/ si juste un nom)")
        sys.exit(1)

    chemin_json_entree = resoudre_chemin_entree(sys.argv[1])
    if not os.path.exists(chemin_json_entree):
        print(f"Fichier introuvable : {chemin_json_entree} (ni tel quel, ni dans {DOSSIER_AVIS}/)")
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Variable d'environnement ANTHROPIC_API_KEY manquante.")
        sys.exit(1)

    client = anthropic.Anthropic()

    print(f"Lecture des avis depuis {chemin_json_entree}...")
    avis_par_cle = lire_avis(chemin_json_entree)
    print(f"{len(avis_par_cle)} couple(s) (concurrent, service_type) détecté(s) :")
    for (concurrent, service_type), avis_liste in avis_par_cle.items():
        print(f"  - {concurrent} [{service_type}] : {len(avis_liste)} avis")

    resultats = []
    for (concurrent, service_type), avis_liste in avis_par_cle.items():
        print(f"\nAnalyse de {concurrent} [{service_type}] ({len(avis_liste)} avis)...")
        resultat = analyser_concurrent(client, concurrent, service_type, avis_liste)
        resultats.append(resultat)
        if "erreur" not in resultat:
            print(f"  -> sentiment global : {resultat['sentiment_global']} (score {resultat['score_sentiment']})")

    prefixe = deduire_prefixe_sortie(chemin_json_entree)
    chemin_json, chemin_csv_out = sauvegarder_resultats(resultats, prefixe=prefixe)
    print(f"\nTerminé. Résultats écrits dans :\n  - {chemin_json} (détail complet, à migrer vers Supabase)\n  - {chemin_csv_out} (vue agrégée)")


if __name__ == "__main__":
    main()