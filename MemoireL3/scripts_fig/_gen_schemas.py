"""Génère architecture_rag.png et modele_relationnel.png (libellés FR)."""
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = Path(__file__).resolve().parents[1] / "img"
OUT.mkdir(parents=True, exist_ok=True)

# Style mémoire : sobre, lisible, FR
C_BOX = "#F7F7F5"
C_EDGE = "#1F2937"
C_ACCENT = "#1D4E89"
C_ACCENT2 = "#2F6F4E"
C_ACCENT3 = "#8B4513"
C_TEXT = "#111827"
C_MUTED = "#4B5563"


def _box(ax, x, y, w, h, title, lines, facecolor=C_BOX, edge=C_EDGE, title_color=C_ACCENT):
    patch = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.02,rounding_size=0.08",
        linewidth=1.4, edgecolor=edge, facecolor=facecolor, zorder=2,
    )
    ax.add_patch(patch)
    ax.text(
        x + w / 2, y + h - 0.18, title,
        ha="center", va="top", fontsize=10, fontweight="bold",
        color=title_color, zorder=3, family="DejaVu Sans",
    )
    body = "\n".join(lines)
    ax.text(
        x + w / 2, y + h - 0.42, body,
        ha="center", va="top", fontsize=8.2, color=C_TEXT,
        zorder=3, family="DejaVu Sans", linespacing=1.35,
    )
    return patch


def _arrow(ax, x1, y1, x2, y2, color=C_EDGE):
    arr = FancyArrowPatch(
        (x1, y1), (x2, y2),
        arrowstyle="-|>", mutation_scale=12,
        linewidth=1.3, color=color, zorder=1,
    )
    ax.add_patch(arr)


def gen_architecture():
    fig, ax = plt.subplots(figsize=(12.5, 7.2), dpi=160)
    ax.set_xlim(0, 12.5)
    ax.set_ylim(0, 7.2)
    ax.axis("off")
    fig.patch.set_facecolor("white")

    ax.text(
        6.25, 6.95,
        "Architecture du pipeline RAG — veille concurrentielle (web / mobile, Lille)",
        ha="center", va="top", fontsize=13, fontweight="bold", color=C_TEXT,
        family="DejaVu Sans",
    )
    ax.text(
        6.25, 6.55,
        "Schéma figé pour l'évaluation · périmètre implémenté au stade du mémoire",
        ha="center", va="top", fontsize=8.5, color=C_MUTED, family="DejaVu Sans",
    )

    # Ligne haute : collecte → stockage → enrichissement
    _box(ax, 0.3, 4.55, 2.3, 1.55, "1. Collecte", [
        "ScrapeGraphAI",
        "Clutch.co (USD)",
        "La Fabrique du Net (€)",
        "Avis clients",
    ], facecolor="#EEF4FA", edge=C_ACCENT)

    _box(ax, 3.0, 4.55, 2.5, 1.55, "2. Stockage", [
        "Supabase / PostgreSQL",
        "competitors",
        "etat_marche (+ LFDN)",
        "avis_analyse · historique",
    ], facecolor="#EEF4FA", edge=C_ACCENT)

    _box(ax, 5.9, 4.55, 2.6, 1.55, "3. Enrichissement", [
        "Sentiment : Claude Haiku",
        "JSON structuré",
        "Embeddings : Gemini",
        "vecteur(768) · pgvector",
    ], facecolor="#EEF7F0", edge=C_ACCENT2)

    _box(ax, 8.9, 4.55, 3.2, 1.55, "4. Index RAG", [
        "build_document (fiche texte)",
        "embed_new_entries.py",
        "Recalcul si prix/avis changent",
        "(embedding → null)",
    ], facecolor="#EEF7F0", edge=C_ACCENT2)

    _arrow(ax, 2.6, 5.3, 3.0, 5.3, C_ACCENT)
    _arrow(ax, 5.5, 5.3, 5.9, 5.3, C_ACCENT)
    _arrow(ax, 8.5, 5.3, 8.9, 5.3, C_ACCENT2)

    # Ligne basse : question → filtres → retrieval → LLM → réponse
    _box(ax, 0.3, 1.35, 2.2, 1.7, "5. Question", [
        "Équipe commerciale",
        "Reformulation si besoin",
        "(historique conversation)",
    ], facecolor="#FFF8EE", edge=C_ACCENT3)

    _box(ax, 2.85, 1.35, 2.5, 1.7, "6. Gardes-fous", [
        "Filtre géographique",
        "Filtre web / mobile",
        "Seuil τ = 0,60",
        "Plancher k = 5",
    ], facecolor="#FFF8EE", edge=C_ACCENT3)

    _box(ax, 5.7, 1.35, 2.6, 1.7, "7. Recherche", [
        "Embedding requête",
        "Similarité cosinus",
        "TOP-K (match_competitors)",
        "Contexte C(q)",
    ], facecolor="#EEF4FA", edge=C_ACCENT)

    _box(ax, 8.65, 1.35, 3.45, 1.7, "8. Génération + sortie", [
        "LLM : Gemini (dev) / Claude",
        "Prompt : ne pas inventer",
        "Réponse FR + sources citées",
        "Extraits auditables",
    ], facecolor="#EEF7F0", edge=C_ACCENT2)

    _arrow(ax, 2.5, 2.2, 2.85, 2.2, C_ACCENT3)
    _arrow(ax, 5.35, 2.2, 5.7, 2.2, C_ACCENT3)
    _arrow(ax, 8.3, 2.2, 8.65, 2.2, C_ACCENT)

    # Lien vertical index → recherche
    _arrow(ax, 10.5, 4.55, 10.5, 3.1, C_MUTED)
    ax.text(
        10.7, 3.85, "fiches\nvectorisées",
        ha="left", va="center", fontsize=7.5, color=C_MUTED, family="DejaVu Sans",
    )

    # Lien stockage → recherche (lecture)
    ax.annotate(
        "", xy=(7.0, 3.05), xytext=(4.25, 4.55),
        arrowprops=dict(arrowstyle="-|>", color=C_MUTED, lw=1.1,
                        connectionstyle="arc3,rad=-0.25"),
    )
    ax.text(5.15, 3.55, "lecture SQL", fontsize=7.5, color=C_MUTED, family="DejaVu Sans")

    ax.text(
        6.25, 0.45,
        "Hors schéma (déploiement en cours) : API FastAPI · interface React · Render · Supabase Auth",
        ha="center", va="center", fontsize=8, color=C_MUTED, style="italic",
        family="DejaVu Sans",
    )
    ax.text(
        6.25, 0.15,
        "Date du schéma : configuration figée pour l'évaluation RAG",
        ha="center", va="center", fontsize=7.5, color=C_MUTED, family="DejaVu Sans",
    )

    path = OUT / "architecture_rag.png"
    fig.savefig(path, bbox_inches="tight", facecolor="white", edgecolor="none")
    plt.close(fig)
    print("OK", path)


def _table(ax, x, y, w, h, name, fields, pk=None, color=C_ACCENT):
    header_h = 0.32
    # header
    ax.add_patch(FancyBboxPatch(
        (x, y + h - header_h), w, header_h,
        boxstyle="square,pad=0", linewidth=1.2, edgecolor=color,
        facecolor=color, zorder=2,
    ))
    ax.text(
        x + w / 2, y + h - header_h / 2, name,
        ha="center", va="center", fontsize=9, fontweight="bold",
        color="white", zorder=3, family="DejaVu Sans",
    )
    # body
    ax.add_patch(FancyBboxPatch(
        (x, y), w, h - header_h,
        boxstyle="square,pad=0", linewidth=1.2, edgecolor=color,
        facecolor="#FAFBFC", zorder=2,
    ))
    line_h = (h - header_h - 0.08) / max(len(fields), 1)
    for i, f in enumerate(fields):
        yy = y + h - header_h - 0.06 - (i + 0.5) * line_h
        prefix = "PK " if pk and f.startswith(pk) else ("FK " if f.startswith("competitor_id") and name != "competitors" else "   ")
        label = f"{prefix}{f}"
        weight = "bold" if prefix.strip() in ("PK", "FK") else "normal"
        ax.text(
            x + 0.08, yy, label,
            ha="left", va="center", fontsize=7.4, color=C_TEXT,
            family="DejaVu Sans", fontweight=weight, zorder=3,
        )


def gen_relationnel():
    fig, ax = plt.subplots(figsize=(13.2, 8.0), dpi=160)
    ax.set_xlim(0, 13.2)
    ax.set_ylim(0, 8.0)
    ax.axis("off")
    fig.patch.set_facecolor("white")

    ax.text(
        6.6, 7.75,
        "Modèle relationnel (extrait) — base Supabase / PostgreSQL",
        ha="center", va="top", fontsize=13, fontweight="bold", color=C_TEXT,
        family="DejaVu Sans",
    )
    ax.text(
        6.6, 7.35,
        "Clé de jointure : competitor_id · Unicité métier : (url_profil, service_type)",
        ha="center", va="top", fontsize=8.5, color=C_MUTED, family="DejaVu Sans",
    )

    # competitors centre haut
    _table(ax, 4.7, 5.35, 3.8, 1.7, "competitors", [
        "id",
        "nom",
        "url_profil",
        "ville",
        "service_type",
    ], pk="id", color=C_ACCENT)

    # etat_marche gauche
    _table(ax, 0.25, 2.55, 3.7, 2.35, "etat_marche  (Clutch)", [
        "competitor_id",
        "nom · service_type",
        "taux_horaire (min/max)",
        "budget_minimum_projet",
        "cout_moyen_projet",
        "note · nombre_avis",
        "embedding vector(768)",
    ], color="#1D4E89")

    # etat_marche LFDN droite
    _table(ax, 9.25, 2.55, 3.7, 2.35, "etat_marche_lafabriquedunet", [
        "competitor_id",
        "nom · service_type",
        "budget_minimum_projet (€)",
        "budget_median · tranche",
        "fourchette_projets_min/max",
        "evaluation_tarifs · note",
        "embedding vector(768)",
    ], color="#2F6F4E")

    # avis_analyse bas centre
    _table(ax, 4.55, 2.55, 4.1, 2.2, "avis_analyse", [
        "competitor_id",
        "sentiment_global · score",
        "points_forts / faibles",
        "themes · nb_avis_analyses",
        "date_analyse",
    ], color="#8B4513")

    # historiques
    _table(ax, 0.25, 0.35, 3.7, 1.7, "historique_prix", [
        "competitor_id",
        "champs prix (snapshot)",
        "date_releve (append-only)",
    ], color="#6B7280")

    _table(ax, 9.25, 0.35, 3.7, 1.7, "historique_prix_lafabriquedunet", [
        "competitor_id",
        "champs prix LFDN",
        "date_releve (append-only)",
    ], color="#6B7280")

    # Relations 1-N
    def rel(x1, y1, x2, y2, label, side="1", many="N"):
        ax.annotate(
            "", xy=(x2, y2), xytext=(x1, y1),
            arrowprops=dict(arrowstyle="-", color=C_EDGE, lw=1.2),
        )
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.08, f"{side} ── {many}", ha="center", fontsize=7.5,
                color=C_MUTED, family="DejaVu Sans")
        if label:
            ax.text(mx, my - 0.12, label, ha="center", fontsize=7, color=C_MUTED,
                    family="DejaVu Sans", style="italic")

    # competitors -> etat_marche
    rel(4.7, 5.9, 3.95, 4.7, "prix Clutch")
    # competitors -> LFDN
    rel(8.5, 5.9, 9.25, 4.7, "prix LFDN")
    # competitors -> avis
    rel(6.6, 5.35, 6.6, 4.75, "sentiment", side="1", many="0..1")
    # etat_marche -> histo
    rel(2.1, 2.55, 2.1, 2.05, "", side="1", many="N")
    # LFDN -> histo LFDN
    rel(11.1, 2.55, 11.1, 2.05, "", side="1", many="N")

    ax.text(
        6.6, 0.12,
        "Effectifs typiques au moment de l'analyse : competitors ≈ 78 · fiches prix = 69 (62 Clutch + 7 LFDN) · avis_analyse = 39",
        ha="center", va="center", fontsize=7.5, color=C_MUTED, family="DejaVu Sans",
    )

    path = OUT / "modele_relationnel.png"
    fig.savefig(path, bbox_inches="tight", facecolor="white", edgecolor="none")
    plt.close(fig)
    print("OK", path)


if __name__ == "__main__":
    gen_architecture()
    gen_relationnel()
