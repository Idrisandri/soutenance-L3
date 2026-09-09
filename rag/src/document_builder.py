"""
Transforme une ligne fusionnée (prix + avis) en texte lisible,
prêt à être embeddé. C'est ce texte que le RAG retrouvera et donnera
à Claude/Gemini comme contexte pour répondre.
"""
import json
from typing import Any, Optional


def _parse_json_field(value: Any) -> Any:
    """Les colonnes points_forts/points_faibles/themes sont stockées en texte JSON
    dans Supabase (ex: '["a", "b"]') — on les reparse en vraie liste Python."""
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None


def _format_prix(prix: dict) -> str:
    """Formate la partie tarifaire. Gère les deux formats possibles :
    Clutch (taux_horaire, cout_moyen_projet) ou La Fabrique du Net
    (fourchette_projets_min/max, budget_median, tranche_plus_courante)."""
    lignes = [f"{prix['nom']} ({prix['service_type']})"]

    # Rend la source explicite dans le texte embeddé, pour que les questions
    # comparant les deux sources de données (Clutch vs La Fabrique du Net)
    # trouvent ces mots-clés dans le contexte.
    if prix.get("_table") == "etat_marche_lafabriquedunet":
        source = "La Fabrique du Net"
    elif prix.get("_table") == "etat_marche":
        source = "Clutch"
    else:
        # Fallback si _table n'est pas présent à ce stade (ex: appelé depuis
        # fetch_joined_data_by_ids) : on déduit la source du champ présent.
        source = "Clutch" if prix.get("taux_horaire") is not None else "La Fabrique du Net"
    lignes.append(f"Source des données : {source}")

    # Champs communs aux deux sources
    if prix.get("budget_minimum_projet"):
        lignes.append(f"Budget minimum de projet : {prix['budget_minimum_projet']}")

    # Champs spécifiques Clutch
    if prix.get("taux_horaire"):
        lignes.append(f"Taux horaire : {prix['taux_horaire']}")
    if prix.get("cout_moyen_projet"):
        lignes.append(f"Coût moyen de projet : {prix['cout_moyen_projet']}")

    # Champs spécifiques La Fabrique du Net
    if prix.get("fourchette_projets_min") or prix.get("fourchette_projets_max"):
        lignes.append(
            f"Fourchette de prix des projets réalisés : "
            f"{prix.get('fourchette_projets_min', '?')} à {prix.get('fourchette_projets_max', '?')}"
        )
    if prix.get("budget_median"):
        lignes.append(f"Budget médian : {prix['budget_median']}")
    if prix.get("tranche_plus_courante"):
        lignes.append(f"Tranche de projet la plus courante : {prix['tranche_plus_courante']}")
    if prix.get("evaluation_tarifs"):
        lignes.append(f"Évaluation des tarifs par les clients : {prix['evaluation_tarifs']}")

    if prix.get("nombre_avis"):
        lignes.append(f"Note : {prix.get('note', 'N/A')}/5 ({prix['nombre_avis']} avis)")

    return "\n".join(lignes)


def _format_avis(avis: Optional[dict]) -> str:
    """Formate la partie sentiment (issue de avis_analyse). Vide si pas encore analysé.

    On garde uniquement points_forts / points_faibles (déjà des résumés concis) —
    le champ 'themes' répète les mêmes informations en plus verbeux, on l'omet
    pour garder chaque document court (meilleur pour le prompt final envoyé au LLM).
    """
    if avis is None:
        return "Aucune analyse d'avis clients disponible pour ce concurrent."

    lignes = [
        f"\nAnalyse des avis clients (sentiment global : {avis['sentiment_global']}, "
        f"score {avis['score_sentiment']}, basé sur {avis['nb_avis_analyses']} avis) :"
    ]

    points_forts = _parse_json_field(avis.get("points_forts")) or []
    if points_forts:
        # Limité aux 4 premiers points pour rester concis
        lignes.append("Points forts : " + "; ".join(points_forts[:4]))

    points_faibles = _parse_json_field(avis.get("points_faibles")) or []
    if points_faibles:
        lignes.append("Points faibles : " + "; ".join(points_faibles[:4]))
    else:
        lignes.append("Points faibles : aucun signalé.")

    return "\n".join(lignes)


def build_document(fusion_row: dict) -> str:
    """
    Prend une ligne du format retourné par database.fetch_joined_data()
    (avec 'competitor_id', 'prix', 'avis') et retourne le texte complet
    prêt à être embeddé.
    """
    prix = fusion_row["prix"]
    avis = fusion_row["avis"]

    texte = _format_prix(prix) + "\n" + _format_avis(avis)
    return texte.strip()