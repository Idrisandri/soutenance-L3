"""
Charge et valide les variables d'environnement nécessaires au service RAG.
"""
import os
from dotenv import load_dotenv

load_dotenv()


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Variable d'environnement manquante : {name}")
    return value


def _optional(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


SUPABASE_URL = _required("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _required("SUPABASE_SERVICE_KEY")

# --- Embeddings : Gemini (gratuit) ---
GEMINI_API_KEY = _required("GEMINI_API_KEY")
EMBEDDING_MODEL = "gemini-embedding-2"
EMBEDDING_DIMENSIONS = 768  # doit correspondre à vector(768) dans Supabase

# --- Réponse finale (LLM) : interrupteur gemini / claude ---
# En dev : LLM_PROVIDER=gemini (gratuit)
# Le jour de la soutenance : change juste cette ligne dans le .env en LLM_PROVIDER=claude
LLM_PROVIDER = _optional("LLM_PROVIDER", "gemini")  # "gemini" ou "claude"

GEMINI_CHAT_MODEL = "gemini-3.5-flash"  # modèle de chat pour la réponse finale (LLM)
ANTHROPIC_API_KEY = _optional("ANTHROPIC_API_KEY")  # requis seulement si LLM_PROVIDER=claude
CLAUDE_MODEL = "claude-sonnet-4-5b"  # modèle de chat pour la réponse finale (LLM)

if LLM_PROVIDER == "claude" and not ANTHROPIC_API_KEY:
    raise RuntimeError(
        "LLM_PROVIDER=claude mais ANTHROPIC_API_KEY est manquant dans le .env"
    )

# Nombre de concurrents les plus pertinents à donner en contexte au LLM
TOP_K_RESULTS = 5

# Seuil de confiance (similarité cosinus, entre 0 et 1) en dessous duquel
# un résultat est considéré comme non pertinent. Évite que le LLM réponde
# à partir de concurrents qui n'ont en fait rien à voir avec la question.
CONFIDENCE_THRESHOLD = 0.60

ZONE_COUVERTURE_KEYWORDS = [
    "lille", "nord", "hauts-de-france", "hauts de france", "roubaix",
    "tourcoing", "villeneuve d'ascq", "villeneuve-d'ascq", "wasquehal",
    "marcq-en-baroeul", "lomme", "métropole lilloise", "mel",
]

VILLES_HORS_ZONE_CONNUES = [
    "tokyo", "paris", "londres", "london", "new york", "berlin",
    "bruxelles", "marseille", "lyon", "bordeaux", "toulouse",
    "amsterdam", "madrid", "barcelone", "rome", "milan",
]