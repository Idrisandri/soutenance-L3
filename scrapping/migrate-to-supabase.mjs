import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(' SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant dans le .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const COMPETITORS_FILE = path.join(__dirname, 'competitors.json');

function chargerJSON(filePath, defaut) {
  if (!fs.existsSync(filePath)) return defaut;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Migration Clutch = IDENTITÉS UNIQUEMENT (nom, url, ville, service_type).
//
// Les prix ne sont JAMAIS scrapés/migrés en local pour Clutch (trop de pages
// pour se le permettre en discovery). C'est monitoring-supabase.mjs qui fait
// le premier (et tous les suivants) scraping + enregistrement des prix,
// directement dans Supabase (etat_marche + historique_prix) — sans jamais
// passer par un fichier local intermédiaire.
//
// Relancer ce script sur un competitors.json mis à jour (ex: nouvelles
// entreprises ajoutées par discovery.js) est 100% SAFE pour les entreprises
// déjà migrées/monitorées : ce script ne touche QUE la table `competitors`,
// jamais `etat_marche` ni `historique_prix`. Aucune donnée de prix existante
// ne peut être écrasée ou mise à null par ce script.
async function migrerCompetitors(competitorsLocal) {
  console.log(`\n Migration de ${competitorsLocal.length} concurrents...`);

  const mappingId = {};
  let nbOk = 0;
  let nbErreurs = 0;

  for (const c of competitorsLocal) {
    const { data, error } = await supabase
      .from('competitors')
      .upsert(
        {
          nom: c.nom,
          url_profil: c.url_profil,
          ville: c.ville || null,
          service_type: c.service_type || 'mobile',
          date_ajout: c.date_ajout || new Date().toISOString().slice(0, 10),
        },
        { onConflict: 'url_profil,service_type' }
      )
      .select('id')
      .single();

    if (error) {
      console.error(` Erreur pour ${c.nom} (${c.service_type}) : ${error.message}`);
      nbErreurs++;
      continue;
    }

    mappingId[c.id] = data.id;
    console.log(` ${c.nom} [${c.service_type}] → id Supabase ${data.id}`);
    nbOk++;
  }

  return { mappingId, nbOk, nbErreurs };
}

async function main() {
  const competitorsLocal = chargerJSON(COMPETITORS_FILE, []);

  if (competitorsLocal.length === 0) {
    console.error('❌ competitors.json vide ou introuvable.');
    process.exit(1);
  }

  const { nbOk, nbErreurs } = await migrerCompetitors(competitorsLocal);

  console.log(`\n Migration terminée : ${nbOk} réussie(s), ${nbErreurs} échouée(s).`);
  console.log(' Étape suivante : lance monitoring-supabase.mjs pour scraper les prix');
  console.log('   (première mesure pour les nouvelles entreprises, détection de');
  console.log('   changement pour celles déjà connues).');
}

main().catch((err) => {
  console.error('❌ Erreur fatale :', err);
  process.exit(1);
});