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

from app.routers import ask, history

app = FastAPI(
    title="API — Intelligence concurrentielle",
    description="Expose l'agent RAG (dossier ../rag) pour l'équipe commerciale.",
    version="1.0.0",
)

FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
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
    return {"status": "ok"}


app.include_router(ask.router)
app.include_router(history.router)