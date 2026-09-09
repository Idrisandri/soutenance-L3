import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SCRAPEGRAPH_KEY = process.env.SCRAPEGRAPH_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SCRAPEGRAPH_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error(' Vérifie SCRAPEGRAPH_API_KEY, SUPABASE_URL et SUPABASE_SERVICE_KEY dans le .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const API_URL = 'https://v2-api.scrapegraphai.com/api/extract';

// --- Options de lancement ---
// node monitoring-lafabriquedunet.mjs                      → traite tous les concurrents lafabriquedunet
// node monitoring-lafabriquedunet.mjs --limit=2             → traite seulement les 2 premiers (test)
// node monitoring-lafabriquedunet.mjs --service=web         → traite uniquement les concurrents web
//   (à ce stade, seul "web" existe côté lafabriquedunet, mais l'option reste
//    disponible si un jour tu scrapes aussi du mobile sur ce site)
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const serviceArg = args.find((a) => a.startsWith('--service='));
const SERVICE_TYPE = serviceArg ? serviceArg.split('=')[1] : null; // null = tous services confondus

if (SERVICE_TYPE && !['mobile', 'web'].includes(SERVICE_TYPE)) {
  console.error(` Service inconnu : "${SERVICE_TYPE}". Utilise --service=mobile ou --service=web.`);
  process.exit(1);
}

const MIN_INTERVAL_MS = 8000; // reste sous la limite de 10 req/min de ScrapeGraphAI
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 15000;

// Même schéma que celui utilisé par le discovery lafabriquedunet-agences.js,
// sans le tableau "avis" ici — le monitoring ne suit que les prix, pas les avis
// (les avis sont traités séparément par analyze_reviews.py + migration.js).
const SCHEMA = {
  type: 'object',
  properties: {
    budget_minimum_projet: { type: 'string' },   // ex: "5 000 €+"
    fourchette_projets_min: { type: 'string' },  // ex: "12 000 EUR"
    fourchette_projets_max: { type: 'string' },  // ex: "200 000 EUR"
    budget_median: { type: 'string' },           // ex: "30 000 EUR"
    tranche_plus_courante: { type: 'string' },   // ex: "10 000€ - 50 000€"
    evaluation_tarifs: { type: 'string' },       // ex: "5 / 5"
    note: { type: 'number' },
    nombre_avis: { type: 'integer' },
  },
};

const EXTRACTION_PROMPT =
  "Extrait de cette page profil d'agence sur La Fabrique du Net : le budget minimum de projet affiché (ex: '5 000 €+'), la fourchette de prix des projets réalisés (montant minimum et maximum mentionnés), le budget médian des projets, la tranche de taille de projet la plus courante, l'évaluation des tarifs (note sur 5), la note globale de l'agence et le nombre d'avis. Garde les montants dans leur format original.";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastCallAt = 0;
async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
  lastCallAt = Date.now();
}

async function extractWithRetry(url, attempt = 1) {
  await throttle();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SGAI-APIKEY': SCRAPEGRAPH_KEY,
      },
      body: JSON.stringify({
        url,
        prompt: EXTRACTION_PROMPT,
        schema: SCHEMA,
        fetchConfig: { mode: 'js', stealth: true, wait: 3000 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const isRateLimited = response.status === 429;

      if (isRateLimited && attempt <= MAX_RETRIES) {
        const wait = RETRY_BASE_DELAY_MS * attempt;
        console.warn(` Rate limité, retry dans ${wait / 1000}s (essai ${attempt}/${MAX_RETRIES})...`);
        await sleep(wait);
        return extractWithRetry(url, attempt + 1);
      }

      throw new Error(`HTTP ${response.status} : ${errorText}`);
    }

    return await response.json();
  } catch (err) {
    if (attempt <= MAX_RETRIES) {
      console.warn(` Erreur (${err.message}), retry dans 10s...`);
      await sleep(10000);
      return extractWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

// Compare uniquement les champs pertinents (tarifs) pour décider s'il y a "changement".
// On ne compare pas note/nombre_avis ici : ces deux-là bougent en permanence
// et ne sont pas ce qu'on veut suivre dans l'historique de prix.
function aChange(ancien, nouveau) {
  if (!ancien) return true; // pas d'état précédent = première mesure, on l'enregistre
  const champs = [
    'budget_minimum_projet',
    'fourchette_projets_min',
    'fourchette_projets_max',
    'budget_median',
    'tranche_plus_courante',
    'evaluation_tarifs',
  ];
  return champs.some((champ) => ancien[champ] !== nouveau[champ]);
}

async function main() {
  console.log(' Récupération de la liste des concurrents (lafabriquedunet) depuis Supabase...');

  // "competitors" ne porte pas de colonne "source" : la seule façon fiable
  // de savoir quels concurrents viennent de La Fabrique du Net, c'est de
  // regarder ceux qui ont déjà une ligne dans etat_marche_lafabriquedunet
  // (créée par la migration initiale des résultats de discovery).
  const { data: lignesLaFabrique, error: errLaFabrique } = await supabase
    .from('etat_marche_lafabriquedunet')
    .select('competitor_id');

  if (errLaFabrique) {
    console.error(' Erreur de lecture etat_marche_lafabriquedunet :', errLaFabrique.message);
    process.exit(1);
  }
  if (!lignesLaFabrique || lignesLaFabrique.length === 0) {
    console.error(' etat_marche_lafabriquedunet est vide. Lance d\'abord la migration des résultats de discovery.');
    process.exit(1);
  }

  const idsLaFabrique = lignesLaFabrique.map((r) => r.competitor_id);

  let query = supabase
    .from('competitors')
    .select('id, nom, url_profil, service_type')
    .in('id', idsLaFabrique)
    .order('id', { ascending: true });
  if (SERVICE_TYPE) query = query.eq('service_type', SERVICE_TYPE);
  if (LIMIT) query = query.limit(LIMIT);

  const { data: competitors, error: errCompetitors } = await query;

  if (errCompetitors) {
    console.error(' Erreur de lecture Supabase :', errCompetitors.message);
    process.exit(1);
  }
  if (!competitors || competitors.length === 0) {
    console.error(' Aucun concurrent "lafabriquedunet" trouvé dans Supabase. Lance d\'abord la migration.');
    process.exit(1);
  }

  console.log(
    `👉 ${competitors.length} concurrent(s) à vérifier` +
      `${SERVICE_TYPE ? ` (service: ${SERVICE_TYPE})` : ' (tous services confondus)'}` +
      `${LIMIT ? ' (mode test --limit)' : ''}.`
  );

  let nbChangements = 0;
  const dateReleve = new Date().toISOString();

  for (const c of competitors) {
    const serviceType = c.service_type || 'web';
    console.log(`\n🔍 Vérification : ${c.nom} [${serviceType}]`);

    try {
      const data = await extractWithRetry(c.url_profil);
      const nouvelleDonnee = data.json ?? {};

      // Récupère l'état actuel connu pour ce concurrent
      const { data: ancienneDonnee } = await supabase
        .from('etat_marche_lafabriquedunet')
        .select(
          'budget_minimum_projet, fourchette_projets_min, fourchette_projets_max, budget_median, tranche_plus_courante, evaluation_tarifs'
        )
        .eq('competitor_id', c.id)
        .maybeSingle();

      if (aChange(ancienneDonnee, nouvelleDonnee)) {
        console.log(` Changement détecté pour ${c.nom} [${serviceType}] !`, nouvelleDonnee);

        // 1. Ajoute une ligne à l'historique (jamais écrasé — alimente le ML)
        const { error: errHisto } = await supabase.from('historique_prix_lafabriquedunet').insert({
          competitor_id: c.id,
          nom: c.nom,
          service_type: serviceType,
          budget_minimum_projet: nouvelleDonnee.budget_minimum_projet || null,
          fourchette_projets_min: nouvelleDonnee.fourchette_projets_min || null,
          fourchette_projets_max: nouvelleDonnee.fourchette_projets_max || null,
          budget_median: nouvelleDonnee.budget_median || null,
          tranche_plus_courante: nouvelleDonnee.tranche_plus_courante || null,
          evaluation_tarifs: nouvelleDonnee.evaluation_tarifs || null,
          note: nouvelleDonnee.note ?? null,
          nombre_avis: nouvelleDonnee.nombre_avis ?? null,
          date_releve: dateReleve,
        });
        if (errHisto) console.error(` Erreur insertion historique : ${errHisto.message}`);

        // 2. Met à jour l'état actuel (1 ligne par concurrent — alimente le RAG)
        const { error: errEtat } = await supabase.from('etat_marche_lafabriquedunet').upsert({
          competitor_id: c.id,
          nom: c.nom,
          service_type: serviceType,
          budget_minimum_projet: nouvelleDonnee.budget_minimum_projet || null,
          fourchette_projets_min: nouvelleDonnee.fourchette_projets_min || null,
          fourchette_projets_max: nouvelleDonnee.fourchette_projets_max || null,
          budget_median: nouvelleDonnee.budget_median || null,
          tranche_plus_courante: nouvelleDonnee.tranche_plus_courante || null,
          evaluation_tarifs: nouvelleDonnee.evaluation_tarifs || null,
          note: nouvelleDonnee.note ?? null,
          nombre_avis: nouvelleDonnee.nombre_avis ?? null,
          derniere_maj: dateReleve,
          embedding: null, // ← force le ré-embedding au prochain passage de embed_new_entries.py
        });
        if (errEtat) console.error(` Erreur mise à jour état marché : ${errEtat.message}`);

        nbChangements++;
      } else {
        console.log(' Aucun changement.');
      }
    } catch (err) {
      console.error(` Erreur pour ${c.nom} [${serviceType}] : ${err.message}`);
    }
  }

  console.log(`\n ${nbChangements} changement(s) détecté(s) sur ${competitors.length} concurrents.`);
  console.log(' Supabase (etat_marche_lafabriquedunet + historique_prix_lafabriquedunet) mis à jour.');
}

main().catch((err) => {
  console.error(' Erreur fatale :', err);
  process.exit(1);
});
