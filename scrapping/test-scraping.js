require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SCRAPEGRAPH_API_KEY;
if (!API_KEY) {
  console.error('❌ SCRAPEGRAPH_API_KEY manquante dans le fichier .env');
  process.exit(1);
}

const API_URL = 'https://v2-api.scrapegraphai.com/api/extract';
const BASE_URL = 'https://clutch.co/directory/mobile-application-developers';

const NB_PAGES = 3;              // nombre de pages à scraper
const DELAY_MS = 4000;           // pause entre chaque requête (évite le blocage)
const MAX_RETRIES = 2;           // tentatives en cas d'échec réseau

const SCHEMA = {
  type: 'object',
  properties: {
    entreprises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          taux_horaire: { type: 'string' },
          budget_minimum_projet: { type: 'string' },
          cout_moyen_projet: { type: 'string' },
          note: { type: 'number' },
          nombre_avis: { type: 'integer' },
          localisation: {
            type: 'object',
            properties: {
              ville: { type: 'string' },
              pays: { type: 'string' },
            },
          },
        },
        required: ['nom'],
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
          "Extrait pour chaque entreprise listée sur cette page : nom, taux horaire, budget minimum de projet, coût moyen de projet, note (rating), nombre d'avis, et localisation (ville, pays). Garde les montants dans leur format original (en dollars), ne traduis rien.",
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
      console.warn(`⚠️ Tentative ${attempt} échouée (${err.message}), retry dans 5s...`);
      await sleep(5000);
      return extractPage(url, attempt + 1);
    }
    throw err;
  }
}

function dedupe(entreprises) {
  const seen = new Set();
  return entreprises.filter((e) => {
    if (!e.nom || seen.has(e.nom)) return false;
    seen.add(e.nom);
    return true;
  });
}

function toCSV(entreprises) {
  const headers = ['nom', 'taux_horaire', 'budget_minimum_projet', 'cout_moyen_projet', 'note', 'nombre_avis', 'ville', 'pays'];
  const rows = entreprises.map((e) =>
    [
      e.nom, e.taux_horaire, e.budget_minimum_projet, e.cout_moyen_projet,
      e.note, e.nombre_avis, e.localisation?.ville, e.localisation?.pays,
    ]
      .map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

async function main() {
  let allEntreprises = [];

  for (let page = 1; page <= NB_PAGES; page++) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
    console.log(`\n🔎 Page ${page}/${NB_PAGES} : ${url}`);

    try {
      const data = await extractPage(url);
      const entreprises = data.json?.entreprises ?? [];
      console.log(`✅ ${entreprises.length} entreprises trouvées (id: ${data.id})`);
      allEntreprises.push(...entreprises);

      // sauvegarde incrémentale après CHAQUE page (sécurité)
      fs.writeFileSync(
        path.join(__dirname, 'result-data.json'),
        JSON.stringify(dedupe(allEntreprises), null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error(`❌ Page ${page} abandonnée : ${err.message}`);
    }

    if (page < NB_PAGES) await sleep(DELAY_MS);
  }

  const finalData = dedupe(allEntreprises);
  console.log(`\n📊 Total après déduplication : ${finalData.length} entreprises`);

  fs.writeFileSync(path.join(__dirname, 'result-data.json'), JSON.stringify(finalData, null, 2), 'utf-8');
  fs.writeFileSync(path.join(__dirname, 'result-data.csv'), toCSV(finalData), 'utf-8');

  console.log('💾 result-data.json et result-data.csv générés.');
}

main();