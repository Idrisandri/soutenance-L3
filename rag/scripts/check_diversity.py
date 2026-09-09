"""
Vérifie si certains concurrents reviennent de façon disproportionnée dans
les résultats, sur des questions pourtant différentes — signe possible que
le RAG "sur-représente" toujours les mêmes entreprises plutôt que de bien
discriminer selon le contenu réel de la question.

Usage :
    python scripts/check_diversity.py
"""
import json
import os
from collections import Counter

RESULTS_FILE = os.path.join(os.path.dirname(__file__), "evaluation_results.json")

with open(RESULTS_FILE, encoding="utf-8") as f:
    data = json.load(f)

details = data["details"]

# On ne regarde que les questions qui ont vraiment retourné des sources
# (les hors-sujet rejetées n'en ont pas, normal, pas pertinent ici)
questions_avec_sources = [r for r in details if r["a_trouve_des_sources"]]

compteur = Counter()
for r in questions_avec_sources:
    for source in r["sources"]:
        compteur[source["nom"]] += 1

nb_questions = len(questions_avec_sources)
nb_slots_total = sum(len(r["sources"]) for r in questions_avec_sources)

print(f" Analyse de diversité sur {nb_questions} questions (avec sources)\n")
print(f"{'Entreprise':<30} {'Apparitions':<12} {'% des questions'}")
print("-" * 60)

for nom, count in compteur.most_common():
    pct_questions = round(100 * count / nb_questions, 1)
    alerte = " ⚠️" if pct_questions >= 50 else ""
    print(f"{nom:<30} {count:<12} {pct_questions}%{alerte}")

nb_entreprises_uniques = len(compteur)
print(f"\n {nb_entreprises_uniques} entreprise(s) unique(s) sur {nb_slots_total} apparitions totales")
print(f" Entreprises apparues dans ≥50% des questions (potentielle sur-représentation) :")
sur_representees = [nom for nom, c in compteur.items() if c / nb_questions >= 0.5]
if sur_representees:
    for nom in sur_representees:
        print(f"   - {nom}")
else:
    print("   Aucune — bonne diversité des résultats.")