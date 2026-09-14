"""
Point d'entrée de l'API. Ne contient aucune logique métier — juste la
configuration de l'app FastAPI et le branchement des routers.

Lancer en local (depuis le dossier backend/) :
    uvicorn app.main:app --reload --port 8000

Puis :
    - Doc interactive : http://localhost:8000/docs
    - curl -X POST http://localhost:8000/ask -H "Content-Type: application/json" -d '{"question": "Quel est le prix moyen d une app mobile ?"}'
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import ask

app = FastAPI(
    title="API — Intelligence concurrentielle",
    description="Expose l'agent RAG (dossier ../rag) pour l'équipe commerciale.",
    version="1.0.0",
)

# CORS restreint aux origines connues du frontend React en développement.
# Vite (port 5173) et Create React App (port 3000) sont couverts par défaut —
# retire celui que tu n'utilises pas, et ajoute l'URL de prod le jour du déploiement
# (ex: "https://ton-app-deployee.vercel.app").
FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Vérifie que l'API tourne — utile pour un futur déploiement/monitoring."""
    return {"status": "ok"}


app.include_router(ask.router)