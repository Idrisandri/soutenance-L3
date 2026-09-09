"""
Script à relancer périodiquement : embedde uniquement les concurrents
qui n'ont pas encore d'embedding dans etat_marche (colonne embedding is null).

Usage :
    python scripts/embed_new_entries.py
"""
import sys
import time
import os

# Permet d'importer le package src/ quand on lance ce script directement
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src import database
from src import embeddings
from src.document_builder import build_document

DELAY_ENTRE_APPELS = 1.0  # secondes, reste tranquille sur le quota gratuit Gemini


def main():
    print("📥 Récupération des concurrents sans embedding...")
    lignes = database.fetch_joined_data(only_missing_embedding=True)

    if not lignes:
        print(" Rien à faire — tous les concurrents ont déjà un embedding à jour.")
        return

    print(f" {len(lignes)} concurrent(s) à embedder.\n")

    nb_ok = 0
    nb_erreurs = 0

    for i, ligne in enumerate(lignes, start=1):
        nom = ligne["prix"]["nom"]
        service = ligne["prix"]["service_type"]
        competitor_id = ligne["competitor_id"]

        print(f"[{i}/{len(lignes)}] {nom} ({service})...", end=" ")

        try:
            texte = build_document(ligne)
            vecteur = embeddings.embed_text(texte, task_type="retrieval_document")
            table_origine = ligne["prix"].get("_table", "etat_marche")
            database.update_embedding(competitor_id, vecteur, table=table_origine)
            print("✅")
            nb_ok += 1
        except Exception as err:
            print(f"❌ Erreur : {err}")
            nb_erreurs += 1

        time.sleep(DELAY_ENTRE_APPELS)

    print(f"\n📊 Terminé : {nb_ok} embeddé(s), {nb_erreurs} erreur(s).")


if __name__ == "__main__":
    main()