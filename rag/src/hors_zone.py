"""
Détection "hors zone géographique" AVANT la recherche vectorielle.

Pourquoi ce module existe :
Les documents embeddés (voir document_builder.py) ne contiennent AUCUNE
mention de localisation par concurrent — seul le prompt système rappelle au
LLM "nos données couvrent Lille et environs". Résultat : sur une question
comme "prix appli mobile chez un concurrent à Tokyo", la similarité
sémantique reste élevée (les mots "prix", "application", "mobile" matchent
très bien), et TOUT repose sur le fait que le LLM respecte bien la consigne
du prompt. En pratique, ce n'est pas garanti à 100% (constaté en éval :
comportement_correct est passé de correct à incorrect sur cette question
d'un run à l'autre, sans changement de code).

Ce module ajoute une vérification structurelle, indépendante du LLM :
si la question mentionne explicitement une ville/pays connu comme hors
zone (et qu'aucun mot-clé de la zone couverte n'apparaît aussi — au cas où
quelqu'un compare explicitement Lille à Tokyo), on court-circuite AVANT
d'appeler l'embedding et le LLM, et on retourne directement le message
"aucune donnée fiable". C'est plus rapide, moins cher, et 100% fiable pour
ce cas précis — contrairement à une instruction de prompt.

Limites assumées : la liste VILLES_HORS_ZONE_CONNUES n'est pas exhaustive.
Elle ne remplace donc PAS la consigne dans le prompt (rag.py), qui reste le
filet de sécurité pour tous les cas non couverts ici (ex: une ville hors
zone qui n'est pas dans la liste). Les deux mécanismes sont complémentaires :
celui-ci attrape les cas fréquents/évidents avec certitude, le prompt gère
le reste avec une fiabilité moindre mais non nulle.
"""
import re
import unicodedata

from . import config


def _normaliser(texte: str) -> str:
    """Minuscule + suppression des accents, pour un matching robuste."""
    texte = texte.lower()
    texte = unicodedata.normalize("NFKD", texte)
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    return texte


def _contient_un_mot_de(texte_normalise: str, liste_mots: list[str]) -> bool:
    """Vérifie la présence d'un mot/expression en tant que mot entier
    (pas une sous-chaîne au milieu d'un autre mot)."""
    for mot in liste_mots:
        mot_normalise = _normaliser(mot)
        if re.search(rf"\b{re.escape(mot_normalise)}\b", texte_normalise):
            return True
    return False


def question_hors_zone(question: str) -> bool:
    """
    Retourne True si la question mentionne explicitement une localisation
    connue comme hors de la zone couverte (Lille et environs), SANS mentionner
    aussi la zone couverte elle-même (cas d'une comparaison volontaire, ex.
    "comparez un concurrent lillois à un concurrent tokyoïte" — dans ce cas on
    laisse passer, le prompt gérera la nuance).

    Reste conservateur par design : en cas de doute (aucune ville détectée
    dans un sens ou dans l'autre), retourne False et laisse la recherche
    vectorielle + le prompt LLM gérer normalement.
    """
    texte_normalise = _normaliser(question)

    mentionne_hors_zone = _contient_un_mot_de(
        texte_normalise, config.VILLES_HORS_ZONE_CONNUES
    )
    if not mentionne_hors_zone:
        return False

    mentionne_zone_couverte = _contient_un_mot_de(
        texte_normalise, config.ZONE_COUVERTURE_KEYWORDS
    )
    if mentionne_zone_couverte:
        # Comparaison explicite Lille vs ailleurs : on laisse passer.
        return False

    return True


MESSAGE_HORS_ZONE = (
    "Notre base de données couvre uniquement des concurrents situés à Lille "
    "et ses environs. La question porte sur une zone géographique qui ne fait "
    "pas partie de notre périmètre actuel — reformule ta question sur une "
    "agence lilloise, ou il faudra élargir la collecte de données pour "
    "couvrir cette zone."
)
