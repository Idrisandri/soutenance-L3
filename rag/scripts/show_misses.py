"""
Affiche les échecs détaillés (retrieval + hit@k) à partir du dernier run.

Usage :
    python scripts/show_misses.py
    python scripts/show_misses.py --mode test
    python scripts/show_misses.py --file ../result_eval/evaluation_test_gemini.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from src import config

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "result_eval")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["dev", "test"], default="test")
    parser.add_argument("--file", default=None)
    args = parser.parse_args()

    path = args.file or os.path.join(
        RESULTS_DIR, f"evaluation_{args.mode}_{config.LLM_PROVIDER}.json"
    )
    # Fallback legacy
    if not os.path.exists(path):
        legacy = os.path.join(os.path.dirname(__file__), f"evaluation_results_{config.LLM_PROVIDER}.json")
        if os.path.exists(legacy):
            path = legacy
        else:
            alt = os.path.join(RESULTS_DIR, "evaluation_results.json")
            path = alt if os.path.exists(alt) else path

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    metriques = data.get("metriques", {})
    echecs = metriques.get("echecs_detail")
    if echecs:
        print(f"Fichier : {path}\n")
        print(f"=== Échecs retrieval ({len(echecs.get('retrieval', []))}) ===")
        for e in echecs.get("retrieval", []):
            print(f"\n❌ {e['id']} [{e['categorie']}] attendu={e['attendu']}")
            print(f"   Q : {e['question']}")
            print(f"   Sources : {e['sources_retournees']} sim={e['similarites']}")
            print(f"   Extrait : {e['extrait_reponse'][:200]}...")
        print(f"\n=== Miss Hit@k ({len(echecs.get('hit_rate', []))}) ===")
        for e in echecs.get("hit_rate", []):
            print(f"\n❌ {e['id']} attendu={e['concurrent_attendu']}")
            print(f"   Q : {e['question']}")
            print(f"   Sources : {e['sources_retournees']}")
        return

    # Legacy format
    details = data.get("details", [])
    verite = [r for r in details if r.get("concurrent_attendu")]
    print(f"Questions avec vérité terrain : {len(verite)}\n")
    for r in verite:
        statut = "✅ TROUVÉ" if r.get("hit_at_k") else "❌ RATÉ"
        print(f"{statut} — {r['id']} : attendu = {r['concurrent_attendu']}")
        print(f"   Question : {r['question']}")
        print(f"   Sources retournées : {[s['nom'] for s in r['sources']]}")
        print(f"   Similarités : {[s['similarity'] for s in r['sources']]}")
        print()


if __name__ == "__main__":
    main()
