require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SCRAPEGRAPH_API_KEY;
if (!API_KEY) {
  console.error(' SCRAPEGRAPH_API_KEY manquante dans le fichier .env');
  process.exit(1);
}

const API_URL = 'https://v2-api.scrapegraphai.com/api/extract';

// --- Choix du type de service via argument de commande ---
// node discovery.js --service=mobile   (par défaut)
// node discovery.js --service=web
const args = process.argv.slice(2);
const serviceArg = args.find((a) => a.startsWith('--service='));
const SERVICE_TYPE = serviceArg ? serviceArg.split('=')[1] : 'mobile';

const URLS_PAR_SERVICE = {
  mobile: 'https://clutch.co/fr/app-developers/lille',
  web: 'https://clutch.co/fr/web-developers/lille',
};

if (!URLS_PAR_SERVICE[SERVICE_TYPE]) {
  console.error(` Service inconnu : "${SERVICE_TYPE}". Utilise --service=mobile ou --service=web.`);
  process.exit(1);
}

const BASE_URL = URLS_PAR_SERVICE[SERVICE_TYPE];

const NB_PAGES = 1;              // à ajuster selon le nombre de résultats obtenus
const DELAY_MS = 4000;           // pause entre chaque requête (évite le blocage)
const MAX_RETRIES = 2;           // tentatives en cas d'échec réseau

const OUTPUT_JSON = path.join(__dirname, 'competitors.json');
const OUTPUT_CSV = path.join(__dirname, 'competitors.csv');

// Schéma minimal pour la phase Discovery : on ne veut QUE
// de quoi identifier et retrouver chaque concurrent plus tard.
const SCHEMA = {
  type: 'object',
  properties: {
    entreprises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          url_profil: { type: 'string' },
          ville: { type: 'string' },
        },
        required: ['nom', 'url_profil'],
      },
    },
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractPage(url, attempt = 1) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SGAI-APIKEY': API_KEY,
      },
      body: JSON.stringify({
        url,
        prompt:
          "Extrait pour chaque entreprise listée sur cette page uniquement : son nom, l'URL complète vers sa page profil Clutch (le lien 'View Profile' ou équivalent), et sa ville si affichée. N'extrais aucune autre information.",
        schema: SCHEMA,
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
      console.warn(` Tentative ${attempt} échouée (${err.message}), retry dans 5s...`);
      await sleep(5000);
      return extractPage(url, attempt + 1);
    }
    throw err;
  }
}

function dedupe(entreprises) {
  const seen = new Set();
  return entreprises.filter((e) => {
    const key = e.url_profil || e.nom;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Fusionne avec la liste existante (si un discovery précédent existe déjà)
// pour garder les mêmes id/date_ajout sur les concurrents déjà connus.
// Ajoute désormais le service_type pour distinguer mobile / web.
function mergeWithExisting(nouveaux) {
  let existants = [];
  if (fs.existsSync(OUTPUT_JSON)) {
    existants = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf-8'));
  }

  const parUrl = new Map(
    existants.map((e) => [`${e.url_profil}|${e.service_type || 'mobile'}`, e])
  );
  let nextId = existants.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const today = new Date().toISOString().slice(0, 10);

  // IMPORTANT : la clé d'unicité est désormais (url_profil + service_type),
  // pas juste url_profil. Une même entreprise peut avoir un profil Clutch
  // mobile ET un profil Clutch web séparés, avec des tarifs différents —
  // on veut donc bien 2 lignes distinctes, pas une ligne fusionnée.
  let nbAjouts = 0;
  for (const nv of nouveaux) {
    const cleUnique = `${nv.url_profil}|${SERVICE_TYPE}`;
    if (!parUrl.has(cleUnique)) {
      parUrl.set(cleUnique, {
        id: nextId++,
        nom: nv.nom,
        url_profil: nv.url_profil,
        ville: nv.ville || '',
        service_type: SERVICE_TYPE, // 'mobile' OU 'web', jamais les deux mélangés
        date_ajout: today,
      });
      nbAjouts++;
    }
    // Si la clé existe déjà, c'est un doublon exact (même URL, même service) → on ignore.
  }

  console.log(` ${nbAjouts} nouveau(x) concurrent(s) ajouté(s) à la liste (service: ${SERVICE_TYPE}).`);
  return Array.from(parUrl.values());
}

function toCSV(entreprises) {
  const headers = ['id', 'nom', 'url_profil', 'ville', 'service_type', 'date_ajout'];
  const rows = entreprises.map((e) =>
    headers
      .map((h) => `"${(e[h] ?? '').toString().replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

async function main() {
  console.log(` Discovery lancé pour le service : ${SERVICE_TYPE}`);
  console.log(` URL cible : ${BASE_URL}`);

  let allEntreprises = [];

  for (let page = 1; page <= NB_PAGES; page++) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
    console.log(`\n🔎 Page ${page}/${NB_PAGES} : ${url}`);

    try {
      const data = await extractPage(url);
      const entreprises = data.json?.entreprises ?? [];
      console.log(`✅ ${entreprises.length} entreprises trouvées (id: ${data.id})`);
      allEntreprises.push(...entreprises);
    } catch (err) {
      console.error(`❌ Page ${page} abandonnée : ${err.message}`);
    }

    if (page < NB_PAGES) await sleep(DELAY_MS);
  }

  const dedupliques = dedupe(allEntreprises);
  const finalData = mergeWithExisting(dedupliques);

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalData, null, 2), 'utf-8');
  fs.writeFileSync(OUTPUT_CSV, toCSV(finalData), 'utf-8');

  console.log(`\n Total concurrents suivis (tous services confondus) : ${finalData.length}`);
  console.log(' competitors.json et competitors.csv générés.');
  console.log(' Ce fichier competitors.json sera la base de ta phase Monitoring.');
}

main();