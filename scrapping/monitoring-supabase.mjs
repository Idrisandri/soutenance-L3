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
// node monitoring-supabase.mjs                      → traite tous les concurrents
// node monitoring-supabase.mjs --limit=2             → traite seulement les 2 premiers
// node monitoring-supabase.mjs --service=mobile      → traite uniquement les concurrents mobile
// node monitoring-supabase.mjs --service=web         → traite uniquement les concurrents web
// node monitoring-supabase.mjs --ids=110,141,117,115,153,109,128,118,160  → traite UNIQUEMENT ces IDs précis
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const serviceArg = args.find((a) => a.startsWith('--service='));
const SERVICE_TYPE = serviceArg ? serviceArg.split('=')[1] : null; // null = tous services confondus

const idsArg = args.find((a) => a.startsWith('--ids='));
const IDS = idsArg ? idsArg.split('=')[1].split(',').map((id) => parseInt(id.trim(), 10)) : null;

if (SERVICE_TYPE && !['mobile', 'web'].includes(SERVICE_TYPE)) {
  console.error(` Service inconnu : "${SERVICE_TYPE}". Utilise --service=mobile ou --service=web.`);
  process.exit(1);
}

const MIN_INTERVAL_MS = 8000; // reste sous la limite de 10 req/min de ScrapeGraphAI
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 15000;

const SCHEMA = {
  type: 'object',
  properties: {
    taux_horaire: { type: 'string' },
    budget_minimum_projet: { type: 'string' },
    cout_moyen_projet: { type: 'string' },
    note: { type: 'number' },
    nombre_avis: { type: 'integer' },
  },
};

const EXTRACTION_PROMPT =
  "Extrait de cette page profil Clutch : le taux horaire, le budget minimum de projet, le coût moyen de projet, la note (rating) et le nombre d'avis. Garde les montants dans leur format original (en dollars).";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastCallAt = 0;
async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
  lastCallAt = Date.now();
}

// Extrait min/max numériques d'un texte du type "$50 - $99 / hr" ou "< $25 /hr"
function parseTauxHoraire(texte) {
  if (!texte || typeof texte !== 'string') return { min: null, max: null };
  const nombres = texte.match(/[\d,]+/g);
  if (!nombres) return { min: null, max: null };
  const valeurs = nombres.map((n) => parseInt(n.replace(/,/g, ''), 10));
  if (texte.includes('<')) return { min: 0, max: valeurs[0] };
  if (texte.includes('+') || valeurs.length === 1) return { min: valeurs[0], max: null };
  return { min: valeurs[0], max: valeurs[1] };
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

// Compare uniquement les champs pertinents pour décider s'il y a "changement"
function aChange(ancien, nouveau) {
  if (!ancien) return true; // pas d'état précédent = première mesure, on l'enregistre
  const champs = ['taux_horaire', 'budget_minimum_projet', 'cout_moyen_projet'];
  return champs.some((champ) => ancien[champ] !== nouveau[champ]);
}

async function main() {
  console.log(' Récupération de la liste des concurrents depuis Supabase...');

  let query = supabase
    .from('competitors')
    .select('id, nom, url_profil, service_type')
    .order('id', { ascending: true });
  if (SERVICE_TYPE) query = query.eq('service_type', SERVICE_TYPE);
  if (IDS) query = query.in('id', IDS);
  if (LIMIT) query = query.limit(LIMIT);

  const { data: competitors, error: errCompetitors } = await query;

  if (errCompetitors) {
    console.error(' Erreur de lecture Supabase :', errCompetitors.message);
    process.exit(1);
  }
  if (!competitors || competitors.length === 0) {
    console.error(' Aucun concurrent trouvé dans Supabase. Lance d\'abord la migration.');
    process.exit(1);
  }

  console.log(
    `👉 ${competitors.length} concurrent(s) à vérifier` +
      `${SERVICE_TYPE ? ` (service: ${SERVICE_TYPE})` : ''}` +
      `${IDS ? ` (ids ciblés: ${IDS.join(', ')})` : ' (tous services confondus)'}` +
      `${LIMIT ? ' (mode test --limit)' : ''}.`
  );

  let nbChangements = 0;
  const dateReleve = new Date().toISOString();

  for (const c of competitors) {
    const serviceType = c.service_type || 'mobile';
    console.log(`\n Vérification : ${c.nom} [${serviceType}] (id ${c.id})`);

    try {
      const data = await extractWithRetry(c.url_profil);
      const nouvelleDonnee = data.json ?? {};
      const { min, max } = parseTauxHoraire(nouvelleDonnee.taux_horaire);

      const { data: ancienneDonnee } = await supabase
        .from('etat_marche')
        .select('taux_horaire, budget_minimum_projet, cout_moyen_projet')
        .eq('competitor_id', c.id)
        .maybeSingle();

      if (aChange(ancienneDonnee, nouvelleDonnee)) {
        console.log(` Changement détecté pour ${c.nom} [${serviceType}] !`, nouvelleDonnee);

        const { error: errHisto } = await supabase.from('historique_prix').insert({
          competitor_id: c.id,
          nom: c.nom,
          service_type: serviceType,
          taux_horaire: nouvelleDonnee.taux_horaire || null,
          taux_horaire_min: min,
          taux_horaire_max: max,
          budget_minimum_projet: nouvelleDonnee.budget_minimum_projet || null,
          cout_moyen_projet: nouvelleDonnee.cout_moyen_projet || null,
          note: nouvelleDonnee.note ?? null,
          nombre_avis: nouvelleDonnee.nombre_avis ?? null,
          date_releve: dateReleve,
        });
        if (errHisto) console.error(` Erreur insertion historique : ${errHisto.message}`);

        const { error: errEtat } = await supabase.from('etat_marche').upsert({
          competitor_id: c.id,
          nom: c.nom,
          service_type: serviceType,
          taux_horaire: nouvelleDonnee.taux_horaire || null,
          taux_horaire_min: min,
          taux_horaire_max: max,
          budget_minimum_projet: nouvelleDonnee.budget_minimum_projet || null,
          cout_moyen_projet: nouvelleDonnee.cout_moyen_projet || null,
          note: nouvelleDonnee.note ?? null,
          nombre_avis: nouvelleDonnee.nombre_avis ?? null,
          derniere_maj: dateReleve,
          embedding: null,
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
  console.log(' Supabase (etat_marche + historique_prix) mis à jour.');
}

main().catch((err) => {
  console.error(' Erreur fatale :', err);
  process.exit(1);
});