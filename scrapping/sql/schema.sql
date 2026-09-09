-- ============================================================
-- Schéma Supabase pour le projet de veille tarifaire concurrentielle
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Active l'extension pgvector (recherche sémantique pour le RAG)
create extension if not exists vector;

-- ============================================================
-- Table : competitors
-- Liste de référence des concurrents identifiés en phase Discovery
-- ============================================================
create table if not exists competitors (
  id           bigserial primary key,
  nom          text not null,
  url_profil   text not null unique,
  ville        text,
  service_type text not null check (service_type in ('mobile', 'web')),
  date_ajout   date not null default current_date
);

comment on table competitors is 'Concurrents identifiés en phase Discovery (Clutch.co)';

-- ============================================================
-- Table : etat_marche
-- Une seule ligne par concurrent = la dernière valeur connue.
-- Alimente le RAG (recherche sémantique via pgvector).
-- ============================================================
create table if not exists etat_marche (
  competitor_id          bigint primary key references competitors(id) on delete cascade,
  nom                    text not null,
  taux_horaire           text,
  taux_horaire_min       numeric, -- ex: 50 (extrait de "$50 - $99 / hr") — à parser en phase ML
  taux_horaire_max       numeric, -- ex: 99
  budget_minimum_projet  text,
  cout_moyen_projet      text,
  note                   numeric,
  nombre_avis            integer,
  derniere_maj           timestamptz not null default now(),
  -- 1536 = dimension par défaut pour text-embedding-3-small (OpenAI) / voyage-3
  -- ajuste selon le modèle d'embedding réellement utilisé
  embedding              vector(1536)
);

comment on table etat_marche is 'État actuel du marché : 1 ligne par concurrent, mise à jour à chaque relevé. Source du RAG.';

-- Index pour la recherche par similarité (cosine distance)
-- À créer une fois que la table contient des données (ivfflat a besoin de données pour s'entraîner)
-- create index on etat_marche using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- Table : historique_prix
-- Append-only : une nouvelle ligne à chaque changement détecté.
-- Alimente le modèle de machine learning (séries temporelles).
-- ============================================================
create table if not exists historique_prix (
  id                     bigserial primary key,
  competitor_id          bigint not null references competitors(id) on delete cascade,
  nom                    text not null,
  taux_horaire           text,
  taux_horaire_min       numeric,
  taux_horaire_max       numeric,
  budget_minimum_projet  text,
  cout_moyen_projet      text,
  note                   numeric,
  nombre_avis            integer,
  date_releve            timestamptz not null default now()
);

comment on table historique_prix is 'Historique complet des relevés de prix (append-only). Source du modèle ML.';

-- Index utile pour les requêtes de séries temporelles par concurrent
create index if not exists idx_historique_competitor_date
  on historique_prix (competitor_id, date_releve desc);

-- ============================================================
-- Vue pratique : prix moyen du marché par date de relevé
-- Utile pour le modèle ML (tendance agrégée du marché)
-- ============================================================
create or replace view tendance_marche as
select
  date_trunc('day', date_releve) as jour,
  service_type,
  count(*) as nb_releves,
  count(distinct h.competitor_id) as nb_concurrents
from historique_prix h
join competitors c on c.id = h.competitor_id
group by date_trunc('day', date_releve), service_type
order by jour desc;