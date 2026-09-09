import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.SCRAPEGRAPH_API_KEY;
if (!API_KEY) {
  console.error(' SCRAPEGRAPH_API_KEY manquante dans le fichier .env');
  process.exit(1);
}

const API_URL = 'https://v2-api.scrapegraphai.com/api/extract';

const COMPETITORS_FILE = path.join(__dirname, 'competitors.json');
const ETAT_MARCHE_FILE = path.join(__dirname, 'etat_marche.json'); // dernière valeur connue par concurrent
const HISTORIQUE_FILE = path.join(__dirname, 'historique_prix.json'); // append-only, alimente le ML

// Plan gratuit ScrapeGraphAI : 10 requêtes/minute max → on reste large en dessous
const MIN_INTERVAL_MS = 8000; // ~7-8 requêtes/minute, marge de sécurité
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

async function extractWithRetry(url, attempt = 1) {
  await throttle();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'SGAI-APIKEY': API_KEY,
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
        console.warn(`⏳ Rate limité, retry dans ${wait / 1000}s (essai ${attempt}/${MAX_RETRIES})...`);
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

function chargerJSON(filePath, defaut) {
  if (!fs.existsSync(filePath)) return defaut;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Compare les champs pertinents entre l'ancienne et la nouvelle donnée
function aChange(ancien, nouveau) {
  if (!ancien) return true; // pas de valeur précédente = première mesure, on l'enregistre
  const champs = ['taux_horaire', 'budget_minimum_projet', 'cout_moyen_projet'];
  return champs.some((champ) => ancien[champ] !== nouveau[champ]);
}

async function main() {
  if (!fs.existsSync(COMPETITORS_FILE)) {
    console.error(' competitors.json introuvable — lance d\'abord discovery.js');
    process.exit(1);
  }

  const competitors = JSON.parse(fs.readFileSync(COMPETITORS_FILE, 'utf-8'));
  const etatMarche = chargerJSON(ETAT_MARCHE_FILE, {}); // objet { competitor_id: {...derniere valeur} }
  const historique = chargerJSON(HISTORIQUE_FILE, []); // tableau append-only

  let nbChangements = 0;
  const dateReleve = new Date().toISOString();

  for (const c of competitors) {
    console.log(`\n Vérification : ${c.nom}`);

    try {
      const data = await extractWithRetry(c.url_profil);
      const nouvelleDonnee = data.json ?? {};

      const ancienneDonnee = etatMarche[c.id];

      if (aChange(ancienneDonnee, nouvelleDonnee)) {
        console.log(` Changement détecté pour ${c.nom} !`, nouvelleDonnee);

        // Ajoute à l'historique (jamais écrasé — alimente le futur modèle ML)
        historique.push({
          competitor_id: c.id,
          nom: c.nom,
          ...nouvelleDonnee,
          date_releve: dateReleve,
        });

        // Met à jour l'état actuel (une seule ligne par concurrent — alimente le RAG)
        etatMarche[c.id] = {
          ...nouvelleDonnee,
          nom: c.nom,
          derniere_maj: dateReleve,
        };

        nbChangements++;
      } else {
        console.log(' Aucun changement.');
      }
    } catch (err) {
      console.error(` Erreur pour ${c.nom} : ${err.message}`);
    }

    // sauvegarde incrémentale après chaque concurrent (sécurité)
    fs.writeFileSync(ETAT_MARCHE_FILE, JSON.stringify(etatMarche, null, 2), 'utf-8');
    fs.writeFileSync(HISTORIQUE_FILE, JSON.stringify(historique, null, 2), 'utf-8');
  }

  console.log(`\n ${nbChangements} changement(s) détecté(s) sur ${competitors.length} concurrents.`);
  console.log(' etat_marche.json et historique_prix.json mis à jour.');
}

main().catch((err) => {
  console.error(' Erreur fatale :', err);
  process.exit(1);
});
