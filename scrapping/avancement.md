# Avancement du projet — Couche 1 : Collecte de données

## 1. Choix méthodologique du périmètre de veille

Le sujet du projet prévoyait initialement un scraping large des entreprises concurrentes du secteur (développement web et mobile) via Clutch.co. Une première exploration a révélé un volume de données trop important pour être exploitable dans le cadre d'un stage de 3 mois : environ 42 000 résultats pour la seule catégorie "Mobile App Development" à l'échelle mondiale, et encore 350 résultats en filtrant uniquement sur la France.

Ce constat a conduit à une décision méthodologique validée avec l'encadreur : plutôt qu'un scraping exhaustif, le projet cible un panel restreint de concurrents directs, pertinents pour ICHTUS IT (même zone géographique, même type de prestations). Après application des filtres Clutch (localisation = Lille), le panel obtenu comprend 24 entreprises, principalement situées dans la métropole lilloise (Lille, Roubaix, Tourcoing, Villeneuve-d'Ascq, Marcq-en-Barœul).

Ce périmètre restreint sert de base au développement et à la validation du pipeline complet (collecte → stockage → intelligence artificielle). Une montée en charge est prévue dans un second temps, une fois le pipeline validé de bout en bout, en élargissant la zone géographique (plusieurs villes françaises) afin de disposer d'un volume de données suffisant pour l'entraînement du modèle prédictif — la prédiction porte alors sur une tendance moyenne du marché plutôt que sur le prix individuel de chaque concurrent, ce qui est cohérent avec la formulation du sujet ("prédire les tendances du marché à court terme").

## 2. Architecture de la couche de collecte

La collecte de données a été structurée en deux phases distinctes et complémentaires :

**Phase Discovery (fréquence faible, ex. mensuelle)** : identification des concurrents pertinents à partir des pages de résultats filtrées de Clutch.co. Cette phase extrait uniquement le nom de chaque entreprise et l'URL de sa page profil, et alimente une liste de référence (`competitors.json`) qui sert de base à la phase suivante.

**Phase Monitoring (fréquence élevée, ex. quotidienne)** : pour chaque concurrent identifié en phase Discovery, extraction régulière des données tarifaires de sa page profil (taux horaire, budget minimum de projet, coût moyen de projet, note, nombre d'avis). Une comparaison est effectuée avec la dernière valeur connue pour détecter automatiquement tout changement de prix.

Cette séparation en deux phases permet de limiter le volume de requêtes nécessaires au quotidien (24 pages profils, contre plusieurs milliers si l'ensemble du site devait être re-scrapé à chaque cycle), et de respecter les contraintes de fréquence imposées par l'outil de scraping utilisé.

## 3. Outil de scraping et adaptation technique

L'outil ScrapeGraphAI a été utilisé pour l'extraction de données structurées via prompt en langage naturel et schéma JSON. Une fonctionnalité native de surveillance planifiée ("Monitor") a d'abord été testée pour automatiser la phase de Monitoring. Cette fonctionnalité s'est révélée inadaptée au contexte du projet : le plan gratuit de l'outil limite à un seul monitor actif simultanément, rendant impossible la surveillance planifiée des 24 concurrents identifiés.

Face à cette contrainte, une solution de surveillance a été développée en interne, reproduisant la logique de détection de changement (comparaison de la donnée extraite avec la dernière valeur enregistrée) sans dépendre de cette fonctionnalité limitée. Cette solution utilise l'endpoint d'extraction standard de l'API, avec une gestion de la fréquence de requêtes (throttling) et des tentatives automatiques en cas de limitation de débit, afin de rester conforme aux quotas du plan utilisé (10 requêtes par minute, 500 crédits initiaux).

## 4. Structuration des données collectées

Les données collectées sont réparties selon deux structures distinctes, correspondant aux deux usages prévus dans l'architecture globale du projet :

- **État actuel du marché** (`etat_marche.json`, à terme une table Supabase indexée avec pgvector) : une ligne par concurrent, mise à jour à chaque nouveau relevé. Cette table alimentera le système de RAG pour répondre aux questions en langage naturel sur l'état actuel du marché.

- **Historique des prix** (`historique_prix.json`, à terme une table Supabase) : une nouvelle ligne ajoutée à chaque changement de prix détecté, jamais écrasée. Cet historique alimentera l'entraînement du modèle de machine learning pour la prédiction des tendances de marché.

## 5. État d'avancement le 1 septembre

- Phase Discovery : fonctionnelle, 24 concurrents identifiés et validés
- Phase Monitoring : fonctionnelle, premier relevé complet réalisé avec succès sur les 24 concurrents (taux de réussite 24/24)
- Détection de changement : implémentée et testée (comparaison locale, sans dépendance à un service tiers limité)
- Stockage : actuellement en fichiers JSON locaux, migration vers Supabase/PostgreSQL avec extension pgvector prévue en prochaine étape

## 6. Prochaines étapes

- Mise en place de la base de données Supabase (tables `etat_marche` et `historique_prix`, extension pgvector)
- Génération des embeddings pour la recherche sémantique
- Développement du système RAG connecté à Claude via MCP
- Entraînement du modèle de prédiction sur les séries temporelles collectées
- Montée en charge du panel de concurrents pour disposer d'un volume suffisant pour le modèle prédictif
