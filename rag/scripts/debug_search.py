"""
Script de diagnostic : montre les scores de similarité BRUTS (sans filtre de
seuil de confiance) pour une question donnée. Utile pour comprendre pourquoi
une question pertinente est rejetée à tort.

Usage :
    python scripts/debug_search.py "ta question ici"
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src import embeddings
from src import database
from src import config


def main():
    if len(sys.argv) > 1:
        question = " ".join(sys.argv[1:])
    else:
        question = "Quels arguments puis-je utiliser face à un concurrent qui a des avis négatifs sur la communication ?"

    print(f"❓ Question : {question}\n")

    query_embedding = embeddings.embed_query(question)

    # On demande 10 résultats, SANS filtrer par seuil — juste pour observer
    resultats = database.match_competitors(query_embedding=query_embedding, match_count=10)

    print(f"Seuil de confiance actuel : {config.CONFIDENCE_THRESHOLD}\n")
    print(f"{'Nom':<30} {'Service':<10} {'Similarité':<12} {'Au-dessus du seuil ?'}")
    print("-" * 70)

    for r in resultats:
        au_dessus = "✅ oui" if r["similarity"] >= config.CONFIDENCE_THRESHOLD else "❌ non"
        print(f"{r['nom']:<30} {r['service_type']:<10} {r['similarity']:<12.3f} {au_dessus}")


if __name__ == "__main__":
    main()