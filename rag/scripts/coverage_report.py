"""
Calcule les métriques de couverture des données — à citer dans le mémoire
et à présenter en soutenance.

Usage :
    python scripts/coverage_report.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.database import get_client


def compter(table, condition_colonne=None):
    """Compte le nombre de lignes dans une table, optionnellement avec une
    colonne non-null comme condition (ex: embedding is not null)."""
    client = get_client()
    query = client.table(table).select("*", count="exact")
    if condition_colonne:
        query = query.not_.is_(condition_colonne, "null")
    response = query.execute()
    return response.count


def main():
    print(" Rapport de couverture des données\n")
    print("=" * 60)

    # --- Concurrents (identité) ---
    total_competitors = compter("competitors")
    print(f"\nTotal concurrents référencés : {total_competitors}")

    # --- Prix : Clutch ---
    total_etat_marche = compter("etat_marche")
    embeddings_etat_marche = compter("etat_marche", "embedding")
    print(f"\n[Clutch] etat_marche : {total_etat_marche} concurrents")
    print(f"[Clutch] avec embedding : {embeddings_etat_marche}/{total_etat_marche} "
          f"({100 * embeddings_etat_marche / total_etat_marche:.1f}%)" if total_etat_marche else "  (vide)")

    # --- Prix : La Fabrique du Net ---
    total_lfdn = compter("etat_marche_lafabriquedunet")
    embeddings_lfdn = compter("etat_marche_lafabriquedunet", "embedding")
    print(f"\n[La Fabrique du Net] etat_marche_lafabriquedunet : {total_lfdn} concurrents")
    if total_lfdn:
        print(f"[La Fabrique du Net] avec embedding : {embeddings_lfdn}/{total_lfdn} "
              f"({100 * embeddings_lfdn / total_lfdn:.1f}%)")
    else:
        print("  (vide)")

    # --- Totaux combinés ---
    total_prix = total_etat_marche + total_lfdn
    total_embeddings = embeddings_etat_marche + embeddings_lfdn
    print(f"\n--- TOTAL PRIX (2 sources combinées) ---")
    print(f"Concurrents avec données de prix : {total_prix}")
    print(f"Concurrents avec embedding généré : {total_embeddings}/{total_prix} "
          f"({100 * total_embeddings / total_prix:.1f}%)" if total_prix else "  (vide)")

    # --- Analyse de sentiment ---
    total_avis = compter("avis_analyse")
    print(f"\n--- ANALYSE DE SENTIMENT ---")
    print(f"Concurrents avec analyse de sentiment : {total_avis}/{total_prix} "
          f"({100 * total_avis / total_prix:.1f}%)" if total_prix else "  (vide)")

    print("\n" + "=" * 60)
    


if __name__ == "__main__":
    main()