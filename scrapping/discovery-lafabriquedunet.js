require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SCRAPEGRAPH_API_KEY;
if (!API_KEY) {
  console.error(' SCRAPEGRAPH_API_KEY manquante dans le fichier .env');
  process.exit(1);
}

const API_URL = 'https://v2-api.scrapegraphai.com/api/extract';

// Pour l'instant : uniquement le web, à Lille.
const LISTING_URL = 'https://www.lafabriquedunet.fr/agences/pages/agences-developpement-web-hauts-de-france-lille';
const SERVICE_TYPE = 'web';
const SOURCE = 'lafabriquedunet';

const DELAY_MS = 4000;
const MAX_RETRIES = 2;

const OUTPUT_JSON = path.join(__dirname, 'competitors-lafabriquedunet-web.json');
const OUTPUT_CSV = path.join(__dirname, 'competitors-lafabriquedunet-web.csv');

// --- Schéma pour la page de listing : juste de quoi identifier chaque agence ---
const SCHEMA_LISTING = {
  type: 'object',
  properties: {
    agences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          url_profil: { type: 'string' },
          ville: { type: 'string' },
          note: { type: 'number' },
          nombre_avis: { type: 'integer' },
        },
        required: ['nom', 'url_profil'],
      },
    },
  },
};

// --- Schéma pour chaque page profil : les données tarifaires détaillées + tous les avis ---
const SCHEMA_PROFIL = {
  type: 'object',
  properties: {
    budget_minimum_projet: { type: 'string' },       // ex: "5 000 €+"
    fourchette_projets_min: { type: 'string' },       // ex: "12 000 EUR"
    fourchette_projets_max: { type: 'string' },       // ex: "200 000 EUR"
    budget_median: { type: 'string' },                // ex: "30 000 EUR"
    tranche_plus_courante: { type: 'string' },        // ex: "10 000€ - 50 000€"
    evaluation_tarifs: { type: 'string' },            // ex: "5 / 5"
    note_globale: { type: 'number' },
    nombre_avis: { type: 'integer' },
    avis: {
      type: 'array',
      description: "Liste complète des avis clients visibles sur la page (pas juste un résumé)",
      items: {
        type: 'object',
        properties: {
          titre: { type: 'string' },
          corps: { type: 'string' },
          note: { type: 'number' },
        },
        required: ['corps'],
      },
    },
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extract(url, prompt, schema, attempt = 1) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SGAI-APIKEY': API_KEY,
      },
      body: JSON.stringify({
        url,
        prompt,
        schema,
        fetchConfig: { mode: 'js', stealth: true, wait: 3000 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status} : ${errorText}`);
    }

    return await response.json();
  } catch (err) {
    if (attempt <= MAX_RETRIES) {
      console.warn(`⚠️ Tentative ${attempt} échouée (${err.message}), retry dans 5s...`);
      await sleep(5000);
      return extract(url, prompt, schema, attempt + 1);
    }
    throw err;
  }
}

// --- Étape 1 : récupère la liste des agences depuis la page de listing ---
async function extractListing() {
  console.log(`\n🔎 Listing : ${LISTING_URL}`);

  const prompt =
    "Extrait pour chaque agence listée sur cette page : son nom, l'URL complète vers sa page profil (le lien vers la fiche de l'agence), sa ville, sa note (si affichée) et son nombre d'avis (si affiché).";

  const data = await extract(LISTING_URL, prompt, SCHEMA_LISTING);
  const agences = data.json?.agences ?? [];
  console.log(` ${agences.length} agences trouvées dans le listing.`);
  return agences;
}

// --- Étape 2 : pour chaque agence, va chercher les données tarifaires sur son profil ---
async function extractProfil(agence) {
  console.log(`\n Profil : ${agence.nom} (${agence.url_profil})`);

  const prompt =
    "Extrait de cette page profil d'agence : le budget minimum de projet affiché (ex: '5 000 €+'), la fourchette de prix des projets réalisés (montant minimum et maximum mentionnés dans le résumé des avis clients), le budget médian des projets, la tranche de taille de projet la plus courante, l'évaluation des tarifs (note sur 5), la note globale de l'agence, le nombre d'avis, et la liste COMPLÈTE de tous les avis clients visibles sur la page (pour chaque avis : titre si présent, le texte complet du corps de l'avis, et la note donnée si affichée). N'extrais pas qu'un seul avis, prends-les tous.";

  try {
    const data = await extract(agence.url_profil, prompt, SCHEMA_PROFIL);
    return { ...agence, ...data.json };
  } catch (err) {
    console.error(` Échec sur ${agence.nom} : ${err.message}`);
    return { ...agence, erreur: err.message };
  }
}

function toCSV(entreprises) {
  const headers = [
    'nom', 'url_profil', 'ville', 'service_type', 'source',
    'note', 'nombre_avis', 'budget_minimum_projet',
    'fourchette_projets_min', 'fourchette_projets_max', 'budget_median',
    'tranche_plus_courante', 'evaluation_tarifs', 'date_ajout',
  ];
  const rows = entreprises.map((e) =>
    headers.map((h) => `"${(e[h] ?? '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

async function main() {
  console.log(` Discovery La Fabrique du Net — service: ${SERVICE_TYPE}`);

  const agencesBrutes = await extractListing();
  const today = new Date().toISOString().slice(0, 10);

  // On ne scrape QUE les agences qui ont des avis (nombre_avis > 0, déjà
  // connu depuis le listing) — évite de payer des crédits pour scraper le
  // profil d'agences sans aucun avis, puisque le but ici est justement de
  // collecter des avis clients.
  const agences = agencesBrutes.filter((a) => (a.nombre_avis || 0) > 0);
  console.log(` ${agences.length}/${agencesBrutes.length} agences ont des avis — seules celles-ci seront scrapées.`);

  const resultats = [];
  const tousLesAvis = [];

  for (let i = 0; i < agences.length; i++) {
    const agence = agences[i];
    const enrichi = await extractProfil(agence);

    resultats.push({
      id: i + 1,
      nom: enrichi.nom,
      url_profil: enrichi.url_profil,
      ville: enrichi.ville || '',
      service_type: SERVICE_TYPE,
      source: SOURCE,
      note: enrichi.note_globale ?? enrichi.note ?? null,
      nombre_avis: enrichi.nombre_avis ?? null,
      budget_minimum_projet: enrichi.budget_minimum_projet || '',
      fourchette_projets_min: enrichi.fourchette_projets_min || '',
      fourchette_projets_max: enrichi.fourchette_projets_max || '',
      budget_median: enrichi.budget_median || '',
      tranche_plus_courante: enrichi.tranche_plus_courante || '',
      evaluation_tarifs: enrichi.evaluation_tarifs || '',
      date_ajout: today,
    });

    // On ne garde que les agences qui ont vraiment des avis exploitables
    const avisDeCetteAgence = enrichi.avis ?? [];
    if (avisDeCetteAgence.length > 0) {
      for (const avis of avisDeCetteAgence) {
        tousLesAvis.push({
          concurrent: enrichi.nom,
          titre: avis.titre || '',
          corps: avis.corps || '',
          note: avis.note ?? '',
          service_type: SERVICE_TYPE,
        });
      }
    }

    if (i < agences.length - 1) await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(resultats, null, 2), 'utf-8');
  fs.writeFileSync(OUTPUT_CSV, toCSV(resultats), 'utf-8');

  const AVIS_OUTPUT = path.join(__dirname, 'avis', 'avis_lafabriquedunet_web.json');
  fs.mkdirSync(path.dirname(AVIS_OUTPUT), { recursive: true });
  fs.writeFileSync(AVIS_OUTPUT, JSON.stringify(tousLesAvis, null, 2), 'utf-8');

  console.log(`\n Total agences traitées : ${resultats.length}`);
  console.log(` Total avis collectés (agences avec avis > 0) : ${tousLesAvis.length}`);
  console.log(' competitors-lafabriquedunet-web.json et .csv générés (tarifs).');
  console.log(` ${AVIS_OUTPUT} généré (avis, prêt pour analyze_reviews.py).`);
  console.log(' Reste 100% local — rien n\'a été envoyé à Supabase.');
}

main();