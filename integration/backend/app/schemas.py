"""
Modèles Pydantic pour les requêtes/réponses de l'API.
Séparés des routes pour rester lisible si l'API grandit (auth, autres routers...).
"""
from pydantic import BaseModel, Field


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=3, description="Question en langage naturel")
    conversation_id: str = Field(..., description="UUID généré côté front pour regrouper un fil de discussion")


class Source(BaseModel):
    nom: str
    service_type: str
    similarity: float
    confiance_faible: bool = False
    extrait: str | None = None


class AnswerResponse(BaseModel):
    reponse: str
    sources: list[Source]
    hors_zone_detectee: bool = False
    # Volontairement PAS exposé par défaut : c'est le prompt système complet
    # envoyé au LLM (structure interne, instructions...). Utile en interne
    # pour l'audit/debug, mais pas destiné à un utilisateur final de l'app.
    # Si besoin en debug, décommenter et le renvoyer uniquement derrière un
    # flag admin/debug côté ask.py — pas en clair pour tout le monde.
    # prompt_complet: str | None = None