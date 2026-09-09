"""
Affiche uniquement les questions à vérité terrain (concurrent_attendu) qui
ont raté (hit_at_k = false), avec le détail de ce qui a été retourné à la
place. Pratique pour diagnostiquer sans tout relire.

Usage :
    python scripts/show_misses.py
"""
import json
import os

RESULTS_FILE = os.path.join(os.path.dirname(__file__), "evaluation_results.json")

with open(RESULTS_FILE, encoding="utf-8") as f:
    data = json.load(f)

details = data["details"]
avec_verite_terrain = [r for r in details if r.get("concurrent_attendu")]

print(f"Questions avec vérité terrain : {len(avec_verite_terrain)}\n")

for r in avec_verite_terrain:
    statut = "✅ TROUVÉ" if r["hit_at_k"] else "❌ RATÉ"
    print(f"{statut} — {r['id']} : attendu = {r['concurrent_attendu']}")
    print(f"   Question : {r['question']}")
    print(f"   Sources retournées : {[s['nom'] for s in r['sources']]}")
    print(f"   Similarités : {[s['similarity'] for s in r['sources']]}")
    print()