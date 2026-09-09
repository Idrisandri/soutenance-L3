"""
Connexion à Supabase et récupération des données pour le RAG.

Le SDK Python de Supabase ne permet pas de faire une vraie jointure SQL
directement — on récupère donc etat_marche et avis_analyse séparément,
puis on les fusionne en mémoire par competitor_id (largement suffisant
vu le volume de données : quelques dizaines de concurrents, pas des millions).
"""
from typing import Any
from supabase import create_client, Client

from . import config

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
    return _client


def fetch_etat_marche(only_missing_embedding: bool = False) -> list[dict[str, Any]]:
    """Récupère les lignes de etat_marche (prix actuels, source Clutch)."""
    client = get_client()
    query = client.table("etat_marche").select("*")
    if only_missing_embedding:
        query = query.is_("embedding", "null")
    response = query.execute()
    # On tague chaque ligne avec sa table d'origine, pour savoir où écrire
    # l'embedding plus tard (cf. update_embedding).
    for row in response.data:
        row["_table"] = "etat_marche"
    return response.data


def fetch_etat_marche_lafabriquedunet(only_missing_embedding: bool = False) -> list[dict[str, Any]]:
    """Récupère les lignes de etat_marche_lafabriquedunet (prix actuels, autre source)."""
    client = get_client()
    query = client.table("etat_marche_lafabriquedunet").select("*")
    if only_missing_embedding:
        query = query.is_("embedding", "null")
    response = query.execute()
    for row in response.data:
        row["_table"] = "etat_marche_lafabriquedunet"
    return response.data


def fetch_avis_analyse() -> list[dict[str, Any]]:
    """Récupère les lignes de avis_analyse (sentiment par concurrent)."""
    client = get_client()
    response = client.table("avis_analyse").select("*").execute()
    return response.data


def fetch_joined_data(only_missing_embedding: bool = False) -> list[dict[str, Any]]:
    """
    Fusionne etat_marche + etat_marche_lafabriquedunet (deux sources de prix,
    formats différents) avec avis_analyse, par competitor_id.
    Un concurrent donné n'existe que dans UNE des deux tables de prix
    (les deux sources référencent des entreprises différentes), donc pas
    de conflit possible entre les deux.
    """
    etat_marche = fetch_etat_marche(only_missing_embedding=only_missing_embedding)
    etat_marche_lfdn = fetch_etat_marche_lafabriquedunet(only_missing_embedding=only_missing_embedding)
    avis_analyse = fetch_avis_analyse()

    avis_par_competitor = {row["competitor_id"]: row for row in avis_analyse}

    fusion = []
    for ligne_prix in etat_marche + etat_marche_lfdn:
        competitor_id = ligne_prix["competitor_id"]
        fusion.append({
            "competitor_id": competitor_id,
            "prix": ligne_prix,
            "avis": avis_par_competitor.get(competitor_id),  # None si pas encore analysé
        })

    return fusion


def fetch_joined_data_by_ids(competitor_ids: list[int]) -> list[dict[str, Any]]:
    """
    Comme fetch_joined_data(), mais restreint à une liste précise de competitor_id.
    Cherche dans les deux tables de prix (un concurrent donné n'est que dans une
    des deux) et fusionne avec avis_analyse si disponible.
    """
    if not competitor_ids:
        return []

    client = get_client()

    etat_marche = (
        client.table("etat_marche").select("*").in_("competitor_id", competitor_ids).execute().data
    )
    etat_marche_lfdn = (
        client.table("etat_marche_lafabriquedunet")
        .select("*")
        .in_("competitor_id", competitor_ids)
        .execute()
        .data
    )
    avis_analyse = (
        client.table("avis_analyse").select("*").in_("competitor_id", competitor_ids).execute().data
    )

    avis_par_competitor = {row["competitor_id"]: row for row in avis_analyse}

    fusion = []
    for ligne_prix in etat_marche + etat_marche_lfdn:
        competitor_id = ligne_prix["competitor_id"]
        fusion.append({
            "competitor_id": competitor_id,
            "prix": ligne_prix,
            "avis": avis_par_competitor.get(competitor_id),
        })

    return fusion


def match_competitors(query_embedding: list[float], match_count: int) -> list[dict[str, Any]]:
    """
    Appelle la fonction SQL match_competitors (recherche par similarité vectorielle).
    Retourne une liste de {competitor_id, nom, service_type, similarity}, triée
    par pertinence décroissante.
    """
    client = get_client()
    response = client.rpc(
        "match_competitors",
        {"query_embedding": query_embedding, "match_count": match_count},
    ).execute()
    return response.data


def update_embedding(competitor_id: int, embedding: list[float], table: str = "etat_marche") -> None:
    """Écrit l'embedding calculé dans la colonne embedding de la table concernée
    (etat_marche pour Clutch, etat_marche_lafabriquedunet pour l'autre source)."""
    client = get_client()
    client.table(table).update({"embedding": embedding}).eq(
        "competitor_id", competitor_id
    ).execute()