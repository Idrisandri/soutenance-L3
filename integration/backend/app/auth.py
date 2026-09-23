"""
Vérification du token JWT émis par Supabase Auth, via les JWT Signing Keys
(JWKS) — le projet Supabase utilise les nouvelles clés asymétriques
(ES256/RS256), pas l'ancien secret partagé HS256.
"""
import os

import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

# PyJWKClient récupère et met en cache les clés publiques de Supabase
_jwks_client = PyJWKClient(JWKS_URL)


def get_current_user(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Header Authorization manquant ou mal formé")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée, reconnecte-toi")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token invalide — raison réelle : {e}")

    return payload


def get_user_id(user: dict) -> str:
    return user["sub"]