# Veille concurrentielle intelligente — Mémoire L3 (ICHTUS IT)

Système d’aide à la décision commerciale : collecte de données concurrents (web/mobile, métropole lilloise), analyse de sentiment, interrogation en langage naturel via **RAG**.

**Étudiant :** Idris ANDRIANJAKA · **Entreprise :** ICHTUS IT · **Éval 1 :** cadrage + faisabilité (MVP)

---

## Structure du dépôt

| Dossier | Rôle |
|---------|------|
| `scrapping/` | Collecte (ScrapeGraphAI), migration Supabase, monitoring prix |
| `rag/` | Pipeline RAG (embeddings, recherche, génération, évaluation) |
| `integration/backend/` | API FastAPI (`/ask`, historique) |
| `integration/frontend/` | Interface React (MVP) |
| `MemoireL3/` | Sources LaTeX du mémoire |

---

## Prérequis

- Python 3.11+ (recommandé)
- Node.js 18+ (frontend / scripts scraping)
- Projet Supabase avec `pgvector` et tables du schéma (voir mémoire / SQL du projet)
- Clés API : Gemini (obligatoire), Anthropic (si `LLM_PROVIDER=claude`)

---

## 1. Service RAG (cœur du système)

```bash
cd rag
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
# source .venv/bin/activate

pip install -r ../requirements.txt
copy .env.example .env
# puis remplir .env
```

### Tester une question

```bash
python scripts/test_rag.py "Quel est le budget minimum de projet demandé par Build Me App ?"
```

### Générer les embeddings manquants

```bash
python scripts/embed_new_entries.py
```

### Évaluation (protocole Éval 1 / mémoire)

```bash
# Jeu de développement (réglage) — 19 questions
python scripts/evaluate_rag.py --mode dev

# Jeu de test indépendant — 60 questions (config figée)
python scripts/evaluate_rag.py --mode test

# Smoke test rapide
python scripts/evaluate_rag.py --mode test --limit 5
```

Fichiers utiles :
- `scripts/dev_questions.json` — jeu de développement
- `scripts/test_questions.json` — jeu de test indépendant
- `scripts/config_fige.json` — paramètres figés avant test
- `scripts/EVALUATION.md` — protocole
- `result_eval/` — sorties brutes + grille humaine

---

## 2. MVP (API + interface)

### Backend

```bash
cd integration/backend
copy .env.example .env
# remplir .env (dont SUPABASE_JWT_SECRET)

# Depuis integration/backend, avec le PYTHONPATH incluant rag si besoin
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd integration/frontend
copy .env.example .env
# VITE_API_BASE_URL=http://localhost:8000 (local)
# ou URL du backend déployé (MVP en ligne)

npm install
npm run dev
```

Le MVP déployé (démo Éval 1) : indiquer l’URL publique dans la diapo / le dépôt de soutenance.

---

## 3. Variables d’environnement

Ne jamais committer de fichier `.env` (déjà ignoré par Git).

Modèles :
- `rag/.env.example`
- `integration/backend/.env.example`
- `integration/frontend/.env.example`

| Variable | Où | Rôle |
|----------|-----|------|
| `SUPABASE_URL` | rag, backend | API Supabase |
| `SUPABASE_SERVICE_KEY` | rag, backend | Accès service (côté serveur uniquement) |
| `GEMINI_API_KEY` | rag, backend | Embeddings + chat (si provider gemini) |
| `LLM_PROVIDER` | rag, backend | `gemini` ou `claude` |
| `ANTHROPIC_API_KEY` | rag, backend | Chat Claude |
| `SUPABASE_JWT_SECRET` | backend | Vérif JWT Auth |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | frontend | Auth client |
| `VITE_API_BASE_URL` | frontend | URL de l’API |

---

## Preuve de faisabilité (Éval 1)

1. Clone du dépôt GitHub  
2. Remplir les `.env` à partir des `.env.example`  
3. `python scripts/test_rag.py "..."` **ou** ouvrir le MVP en ligne  
4. Montrer : question nominative + sources ; question hors sujet / hors zone  

---

## Licence / données

Données concurrentielles issues de sources **publiques** (veille métier). Ne pas redistribuer de clés API ni de dumps contenant des secrets.
