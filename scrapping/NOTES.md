# Notes — Pipelines de scraping concurrents

Ce fichier documente le fonctionnement des 2 pipelines de veille concurrentielle
(Clutch et LaFabriqueDuNet), pour ne jamais perdre le fil sur qui fait quoi.

---

## 🟦 Pipeline Clutch (mobile + web)

Beaucoup de pages/entreprises → on optimise les coûts en séparant découverte
légère et scraping de prix.

### 1. `discovery.js` — Trouve les concurrents

**Rôle** : scrape la page listing Clutch (mobile ou web) pour récupérer
l'identité de chaque agence.

**Ce qu'il récupère** : `nom`, `url_profil`, `ville` — rien d'autre (pas de
prix, volontairement, car Clutch a trop de pages/entreprises pour se
permettre un scraping complet dès la découverte).

**Commande** :
```bash
node discovery.js --service=mobile
node discovery.js --service=web
```

**Ce qu'il produit** : `competitors.json` + `competitors.csv` (fusionne avec
l'existant, dédoublonne par `url_profil + service_type`, ne perd jamais les
anciennes entrées).

---

### 2. `migrate-to-supabase.mjs` — Envoie les identités vers Supabase

**Rôle** : upsert les entreprises de `competitors.json` dans la table
Supabase `competitors`.

**Ce qu'il fait** : identités uniquement (nom/url/ville/service_type/date_ajout).
Ne touche **jamais** aux prix (`etat_marche`, `historique_prix`).

**Commande** :
```bash
node migrate-to-supabase.mjs
```

**⚠️ Important** : 100% safe à relancer autant de fois que voulu, même avec un
`competitors.json` mis à jour (nouvelles entrées ajoutées). Les entreprises
déjà connues ne sont jamais dupliquées (grâce à
`onConflict: 'url_profil,service_type'`) et leurs prix déjà collectés ne sont
**jamais** écrasés — ce script ne touche structurellement pas la table
`etat_marche`.

> Historique : l'ancienne version de ce script contenait aussi
> `migrerEtatMarche()` et `migrerHistorique()`, prévues pour lire des fichiers
> `etat_marche.json` / `historique_prix.json` qui n'ont **jamais existé** côté
> Clutch. Ces fonctions ne s'exécutaient donc jamais (code mort) et ont été
> supprimées pour la clarté. Le comportement réel du script n'a pas changé.

---

### 3. `monitoring-supabase.mjs` — Scrape et suit les prix

**Rôle** : pour chaque entreprise connue dans Supabase, va chercher les
vraies données tarifaires (`taux_horaire`, `budget_minimum_projet`,
`cout_moyen_projet`, `note`, `nombre_avis`) sur sa page Clutch.

**C'est LUI qui fait le premier scraping de prix** (pour une nouvelle
entreprise) et qui détecte les changements ensuite (pour les anciennes).

**Ce qu'il fait** :
- Si l'entreprise n'a jamais eu de ligne `etat_marche` → 1ère mesure enregistrée
  (`ancienneDonnee = null` → `aChange()` retourne `true` automatiquement).
- Si elle en a déjà une → compare ancien/nouveau, n'écrit que si ça a changé.
- Écrit dans 2 tables : `etat_marche` (état actuel, 1 ligne par entreprise) et
  `historique_prix` (append-only, jamais écrasé — garde toutes les mesures
  dans le temps).
- Reset `embedding: null` à chaque changement (pour forcer le recalcul plus
  tard, côté RAG).

**Commandes** :
```bash
node monitoring-supabase.mjs                       # tout le monde
node monitoring-supabase.mjs --limit=2              # test sur 2 entreprises
node monitoring-supabase.mjs --service=web          # que le web
node monitoring-supabase.mjs --service=mobile --limit=5   # combinable
```

---

### Ordre d'utilisation (Clutch)

```bash
node discovery.js --service=web        # 1. trouve les nouvelles agences
node migrate-to-supabase.mjs           # 2. crée leur identité dans Supabase
node monitoring-supabase.mjs           # 3. scrape leurs prix pour la 1ère fois
                                        #    + vérifie les changements sur les anciennes
```

---

## 🟩 Pipeline LaFabriqueDuNet (web uniquement, pour l'instant)

Peu d'agences à Lille → on peut se permettre de tout scraper (prix + avis)
dès la découverte, sans exploser les coûts.

### 1. `discovery-lafabriquedunet.js` — Trouve ET scrape tout en une fois

**Rôle** : 2 étapes en une seule exécution :
- **Étape 1 (listing)** : scrape la page listing pour récupérer `nom`,
  `url_profil`, `ville`, `note`, `nombre_avis` de chaque agence.
- **Étape 2 (profil)** : pour chaque agence qui a au moins 1 avis (filtre
  `nombre_avis > 0`, pour ne pas gaspiller de crédits sur les agences sans
  avis exploitables), va chercher directement sur sa page profil : tous les
  tarifs (`budget_minimum_projet`, `fourchette_projets_min/max`,
  `budget_median`, `tranche_plus_courante`, `evaluation_tarifs`) **et** la
  liste complète des avis clients.

**Commande** :
```bash
node discovery-lafabriquedunet.js
```

**Ce qu'il produit** :
- `competitors-lafabriquedunet-web.json` + `.csv` → identités **+ tarifs
  déjà remplis**
- `avis/avis_lafabriquedunet_web.json` → tous les avis collectés, prêt pour
  `analyze_reviews.py`

---

### 2. `migration-lafabriquedunet.js` — Envoie identités ET tarifs vers Supabase

**Rôle** : contrairement à `migrate-to-supabase.mjs` (Clutch) qui ne fait que
les identités, ce script fait tout d'un coup, car le fichier local contient
déjà les prix :
1. Upsert dans `competitors` (identité, table partagée avec Clutch).
2. Compare avec `etat_marche_lafabriquedunet` existant → si un tarif a
   changé (ou 1ère fois), upsert dans `etat_marche_lafabriquedunet`
   (+ reset `embedding: null`).
3. Si changement détecté → insert dans `historique_prix_lafabriquedunet`
   (append-only).

**⚡ Donc pour LaFabriqueDuNet, la migration = la première mesure de prix.**
Pas besoin d'un monitoring séparé pour avoir la 1ère donnée (contrairement à
Clutch).

**Commande** :
```bash
node migration-lafabriquedunet.js
```

---

### 3. `monitoring-lafabriquedunet.mjs` — Suit les changements de prix ensuite

**Rôle** : relit les entreprises depuis Supabase (celles déjà présentes dans
`etat_marche_lafabriquedunet` — c'est le critère utilisé pour savoir "qui
vient de LaFabriqueDuNet", faute de colonne `source` dans `competitors`),
rescrape leur page profil, compare avec l'état actuel, et n'écrit que si un
tarif a changé.

**Différence avec le monitoring Clutch** : ne compare que les champs
tarifaires (`budget_minimum_projet`, `fourchette_projets_min/max`,
`budget_median`, `tranche_plus_courante`, `evaluation_tarifs`) — **pas**
`note`/`nombre_avis`, car ces 2-là bougent tout le temps et ne sont pas ce
qu'on veut suivre en historique de prix.

**Commandes** :
```bash
node monitoring-lafabriquedunet.mjs
node monitoring-lafabriquedunet.mjs --limit=2
node monitoring-lafabriquedunet.mjs --service=web
```

---

### Ordre d'utilisation (LaFabriqueDuNet)

```bash
node discovery-lafabriquedunet.js       # 1. trouve + scrape tarifs + avis en une fois
node migration-lafabriquedunet.js       # 2. envoie identités + PREMIÈRE mesure de prix
node monitoring-lafabriquedunet.mjs     # 3. (plus tard) détecte les changements suivants
```

---

## 📊 Tableau comparatif Clutch vs LaFabriqueDuNet

| | Clutch | LaFabriqueDuNet |
|---|---|---|
| Discovery récupère les prix ? | ❌ Non (trop de pages) | ✅ Oui (peu d'agences) |
| Migration écrit les prix ? | ❌ Non (identités seulement) | ✅ Oui (1ère mesure) |
| 1ère mesure de prix faite par | `monitoring-supabase.mjs` | `migration-lafabriquedunet.js` |
| Fichiers locaux intermédiaires prix | Aucun (direct Supabase via monitoring) | `competitors-lafabriquedunet-web.json` |
| Tables Supabase (prix) | `etat_marche`, `historique_prix` | `etat_marche_lafabriquedunet`, `historique_prix_lafabriquedunet` |
| Table Supabase (identités) | `competitors` (partagée) | `competitors` (partagée) |
| Avis clients collectés ? | ❌ Non | ✅ Oui (`avis_lafabriquedunet_web.json`) |

---

## 🔑 Points clés à retenir

1. **La table `competitors` est partagée** entre les 2 sources — elle ne
   contient que l'identité (nom, url, ville, service_type). Les prix vivent
   dans des tables séparées par source.

2. **Relancer une migration (Clutch ou LaFabriqueDuNet) avec un fichier
   local mis à jour est toujours safe** pour les entreprises déjà connues :
   grâce à `onConflict` sur `url_profil + service_type`, aucune duplication,
   et les scripts ne touchent que ce qu'ils sont censés toucher (jamais
   d'écrasement à `null` des prix déjà collectés).

3. **"Pas de ligne" ≠ "valeurs à null"** : tant qu'une entreprise n'a pas
   été monitorée (Clutch) ou migrée avec ses tarifs (LaFabriqueDuNet), elle
   n'a **aucune ligne** dans la table de prix correspondante — pas une ligne
   avec des `null` partout. Important pour toute requête qui joint
   `competitors` et `etat_marche` plus tard (RAG, ML, dashboard).

4. **`embedding: null`** est reset à chaque changement de prix détecté, dans
   les 2 pipelines — signal pour un script séparé (`embed_new_entries.py`)
   qui doit recalculer les embeddings avant la prochaine requête RAG.
