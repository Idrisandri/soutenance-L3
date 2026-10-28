# Évaluation RAG — protocole (corrections encadrant)

## 1. Séparer réglage et évaluation finale

| Jeu | Fichier | Usage |
|-----|---------|--------|
| Développement (19 Q) | `dev_questions.json` | Régler seuil, filtres, prompts. **Pas** un test indépendant. |
| Test indépendant (60 Q) | `test_questions.json` | Évaluation finale. Vérité terrain définie **avant** exécution. |

Avant le run test : figer modèles, prompts, filtres et paramètres (`config_fige.json`).

```bash
# Réglage uniquement
python scripts/evaluate_rag.py --mode dev

# Évaluation finale (paramètres figés)
python scripts/evaluate_rag.py --mode test
```

## 2. Portée des métriques automatiques

| Indicateur | Mesure réellement | Ne mesure PAS |
|------------|-------------------|---------------|
| Comportement retrieval attendu | Fiche(s) présentes/absentes selon la catégorie | Exactitude du contenu |
| Taux questions pertinentes avec résultat | ≥1 fiche sur Q pertinentes (ex-« rappel ») | Réponse correcte |
| Taux de rejet hors sujet | Hors-sujet sans fiche | Précision d'abstention |
| Hit Rate@k / MRR | Concurrent attendu dans le TOP-K | Véracité / complétude |
| Similarité moyenne | Diagnostic retrieval | Qualité de réponse |
| Prudence (mots-clés) | Heuristique exploratoire | Vérité de la réponse |

Le **100 %** éventuel doit être présenté selon sa **définition étroite**, jamais comme exactitude générale du système. Un 3/3 hors-sujet reste **exploratoire** (échantillon réduit).

## 3. Grille d'évaluation humaine (obligatoire)

Fichier généré à chaque run : `result_eval/grille_humaine_{mode}_{provider}.json`.

Pour chaque question, noter **0–3** et justifier :

1. Sources pertinentes retrouvées  
2. Exactitude des montants et devises  
3. Fidélité aux documents  
4. Complétude  
5. Abstention correcte  
6. Utilité commerciale  

Conserver les **sorties brutes** (`evaluation_*.json`) et les **justifications** des évaluateurs.

## 4. Diagnostic des échecs

```bash
python scripts/show_misses.py --mode test
```

Les échecs par question sont aussi dans `metriques.echecs_detail` du JSON de résultats.
