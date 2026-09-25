"""
Client LLM pour générer la réponse finale du RAG.

Interrupteur simple entre Gemini (gratuit, utilisé en développement) et
Claude (utilisé le jour de la soutenance) — contrôlé par LLM_PROVIDER dans le .env.
Le reste du code (rag.py) appelle juste generate_response(prompt) sans se
soucier de quel provider est actif.

OPTIMISATION : generate_response_light() est utilisé pour les tâches
secondaires (reformulation de question, résumé de conversation) — des
tâches simples qui n'ont pas besoin de la puissance du modèle principal,
peu importe LLM_PROVIDER. Ça réduit le coût et la pression sur les quotas
API sans dégrader la qualité de la réponse finale (qui, elle, continue
d'utiliser le modèle configuré normalement).
"""
from . import config
import time


def generate_response(prompt: str) -> str:
    if config.LLM_PROVIDER == "claude":
        return _generate_with_claude(prompt)
    return _generate_with_gemini(prompt)


def generate_response_light(prompt: str) -> str:
    """Toujours Gemini Flash, peu importe LLM_PROVIDER — pour les tâches
    secondaires (rewrite, résumé), qui n'ont pas besoin du modèle premium."""
    return _generate_with_gemini(prompt)


def _generate_with_gemini(prompt: str, tentative: int = 1) -> str:
    import google.generativeai as genai
    from google.api_core.exceptions import ResourceExhausted

    genai.configure(api_key=config.GEMINI_API_KEY)
    model = genai.GenerativeModel(config.GEMINI_CHAT_MODEL)

    try:
        response = model.generate_content(prompt)
        return response.text
    except ResourceExhausted as e:
        max_tentatives = 3
        if tentative <= max_tentatives:
            attente = 20 * tentative  # backoff progressif : 20s, 40s, 60s
            print(f"  ⏳ Rate limit Gemini atteint, attente {attente}s (tentative {tentative}/{max_tentatives})...")
            time.sleep(attente)
            return _generate_with_gemini(prompt, tentative + 1)
        raise


def _generate_with_claude(prompt: str) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text