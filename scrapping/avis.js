require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const API_KEY = process.env.SCRAPEGRAPH_API_KEY;
if (!API_KEY) {
  console.error('❌ SCRAPEGRAPH_API_KEY manquante dans le fichier .env');
  process.exit(1);
}

const API_URL = 'https://v2-api.scrapegraphai.com/api/extract';
const DOSSIER_AVIS = path.join(__dirname, 'avis');

// --- Usage ---
// Mode URL(s) — tu donnes juste la ou les URLs de profil, le script retrouve
// automatiquement le nom et le service_type dans Supabase (via url_profil) :
//   node avis.js --url=https://clutch.co/profile/xxx
//   node avis.js --urls=https://clutch.co/profile/xxx,https://clutch.co/profile/yyy
//
// Si l'URL n'existe pas encore dans Supabase (nouveau concurrent pas encore migré),
// tu peux forcer nom/service manuellement :
//   node avis.js --url=https://clutch.co/profile/xxx --nom="Atelier256" --service=mobile
//
// La pagination (page 2, 3, ...) est automatique : le script continue tant que
// des avis nouveaux apparaissent, et s'arrête tout seul sur une page vide.
// Garde-fou : 10 pages max par défaut, ajustable avec --pages=20
//
// Mode batch (croise competitors + etat_marche, ne scrape que ceux avec des avis connus) :
//   node avis.js --all
//   node avis.js --all --service=web
//   node avis.js --all --limit=5              (pour tester)
//   node avis.js --all --force                (re-scrape même ceux déjà faits)
//   node avis.js --all --min-avis=5            (seuil différent, défaut = 1)
//   node avis.js --all --tous-meme-sans-avis    (ignore le filtre, scrape même nombre_avis=0)
//   node avis.js --all --noms="Atelier256,Glush,Meant4.com"   (liste précise, tu contrôles toi-même)

const args = process.argv.slice(2);
const getArg = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const MODE_ALL = hasFlag('all');
const LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
const SERVICE_FILTER = getArg('service'); // 'mobile' | 'web' | null (= tous)
const FORCE = hasFlag('force');
const MIN_AVIS = getArg('min-avis') ? parseInt(getArg('min-avis'), 10) : 1;
const TOUS_MEME_SANS_AVIS = hasFlag('tous-meme-sans-avis');
const NOMS_FILTER = getArg('noms') ? getArg('noms').split(',').map((n) => n.trim()) : null;

const MIN_INTERVAL_MS = 8000; // reste sous la limite de 10 req/min de ScrapeGraphAI
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 15000;
const MAX_PAGES = getArg('pages') ? parseInt(getArg('pages'), 10) : 10; // garde-fou, s'arrête avant si une page est vide

const SCHEMA = {
  type: 'object',
  properties: {
    avis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titre: { type: 'string' },
          corps: { type: 'string' },
          note: { type: 'number' },
        },
        required: ['titre', 'corps', 'note'],
      },
    },
  },
};

const EXTRACTION_PROMPT =
  "Extrait tous les avis (reviews) présents sur cette page profil Clutch. Pour chaque avis, donne : le titre de l'avis, le corps/texte complet de l'avis, et la note (rating) sur 5. N'extrais rien d'autre.";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastCallAt = 0;
async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
  lastCallAt = Date.now();
}

async function extractAvis(url, attempt = 1) {
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
        return extractAvis(url, attempt + 1);
      }

      throw new Error(`HTTP ${response.status} : ${errorText}`);
    }

    return await response.json();
  } catch (err) {
    if (attempt <= MAX_RETRIES) {
      console.warn(`⚠️ Erreur (${err.message}), retry dans 10s...`);
      await sleep(10000);
      return extractAvis(url, attempt + 1);
    }
    throw err;
  }
}

// nom de fichier sûr : "Atelier256" + "mobile" -> "atelier256-mobile"
function slugifier(nom, serviceType) {
  const base = nom
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base}-${serviceType}`;
}

function toCSV(avisList) {
  const headers = ['concurrent', 'service_type', 'titre', 'corps', 'note'];
  const rows = avisList.map((a) =>
    headers.map((h) => `"${(a[h] ?? '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

// Scrape 1 profil (avec pagination automatique) et écrit avis/<slug>.json + .csv,
// avec concurrent + service_type injectés dans chaque avis (requis par analyze_reviews.py).
async function scraperUnProfil({ nom, url_profil, service_type }) {
  const slug = slugifier(nom, service_type);
  const cheminJson = path.join(DOSSIER_AVIS, `${slug}.json`);

  if (!FORCE && fs.existsSync(cheminJson)) {
    console.log(`⏭️  ${nom} [${service_type}] : déjà scrapé (${slug}.json), ignoré (--force pour re-scraper).`);
    return { statut: 'ignore' };
  }

  console.log(`🔍 Scraping avis : ${nom} [${service_type}] → ${url_profil}`);

  const avisBrutsToutesPages = [];
  const vus = new Set(); // dédoublonnage sur (titre+corps), au cas où une page se répète

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const urlPage = page === 1 ? url_profil : `${url_profil}?page=${page}`;

      const data = await extractAvis(urlPage);
      const avisPage = data.json?.avis ?? [];

      if (avisPage.length === 0) {
        if (page === 1) {
          console.warn(`  ⚠️ Aucun avis trouvé sur la page 1, profil peut-être sans avis ou format inattendu.`);
        } else {
          console.log(`  ↳ page ${page} vide, fin de la pagination.`);
        }
        break;
      }

      let nbNouveaux = 0;
      for (const a of avisPage) {
        const cle = `${a.titre || ''}|${a.corps || ''}`;
        if (vus.has(cle)) continue; // déjà vu sur une page précédente, on ignore
        vus.add(cle);
        avisBrutsToutesPages.push(a);
        nbNouveaux++;
      }

      console.log(`  ↳ page ${page} : ${avisPage.length} avis (${nbNouveaux} nouveau(x))`);

      // Si une page ne ramène que des doublons de la précédente, on arrête aussi
      // (certains sites renvoient la même page 1 en boucle après la dernière page réelle).
      if (nbNouveaux === 0) {
        console.log(`  ↳ page ${page} ne contient que des doublons, fin de la pagination.`);
        break;
      }
    }

    // On injecte concurrent + service_type sur CHAQUE avis : c'est ce que
    // analyze_reviews.py attend pour grouper correctement (cf. lire_avis()).
    const avisList = avisBrutsToutesPages.map((a) => ({
      concurrent: nom,
      service_type,
      titre: a.titre || '',
      corps: a.corps || '',
      note: a.note ?? '',
    }));

    fs.mkdirSync(DOSSIER_AVIS, { recursive: true });
    fs.writeFileSync(cheminJson, JSON.stringify(avisList, null, 2), 'utf-8');
    fs.writeFileSync(path.join(DOSSIER_AVIS, `${slug}.csv`), toCSV(avisList), 'utf-8');

    console.log(`✅ ${avisList.length} avis au total → avis/${slug}.json`);
    return { statut: 'ok', nbAvis: avisList.length };
  } catch (err) {
    console.error(`❌ Échec pour ${nom} [${service_type}] : ${err.message}`);
    return { statut: 'erreur', erreur: err.message };
  }
}

async function main() {
  if (MODE_ALL) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant dans le .env (requis pour --all)');
      process.exit(1);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    let query = supabase
      .from('competitors')
      .select('id, nom, url_profil, service_type, etat_marche!inner(nombre_avis)')
      .order('id', { ascending: true });
    if (SERVICE_FILTER) query = query.eq('service_type', SERVICE_FILTER);
    if (NOMS_FILTER) query = query.in('nom', NOMS_FILTER);
    if (!TOUS_MEME_SANS_AVIS) query = query.gte('etat_marche.nombre_avis', MIN_AVIS);
    if (LIMIT) query = query.limit(LIMIT);

    const { data: competitors, error } = await query;
    if (error) {
      console.error('❌ Erreur de lecture Supabase :', error.message);
      process.exit(1);
    }
    if (!competitors || competitors.length === 0) {
      console.error('❌ Aucun concurrent trouvé (avec le filtre nombre_avis actuel). Essaie --tous-meme-sans-avis ou --min-avis=0.');
      process.exit(1);
    }

    console.log(
      `👉 ${competitors.length} concurrent(s) à scraper` +
        `${SERVICE_FILTER ? ` (service: ${SERVICE_FILTER})` : ' (tous services confondus)'}` +
        `${TOUS_MEME_SANS_AVIS ? '' : ` (avec au moins ${MIN_AVIS} avis connu(s) dans etat_marche)`}` +
        `${LIMIT ? ' (mode test --limit)' : ''}.\n`
    );

    let nbOk = 0, nbIgnores = 0, nbErreurs = 0;
    for (const c of competitors) {
      const resultat = await scraperUnProfil({ nom: c.nom, url_profil: c.url_profil, service_type: c.service_type || 'mobile' });
      if (resultat.statut === 'ok') nbOk++;
      else if (resultat.statut === 'ignore') nbIgnores++;
      else nbErreurs++;
    }

    console.log(`\n📊 Terminé : ${nbOk} scrapé(s), ${nbIgnores} déjà présent(s), ${nbErreurs} en erreur.`);
    return;
  }

  // --- Mode URL(s) : lookup automatique nom + service_type via Supabase ---
  const urlUnique = getArg('url');
  const urlsMultiples = getArg('urls');
  const nomManuel = getArg('nom');
  const serviceManuel = getArg('service');

  const urls = urlsMultiples
    ? urlsMultiples.split(',').map((u) => u.trim()).filter(Boolean)
    : urlUnique
    ? [urlUnique]
    : [];

  if (urls.length === 0) {
    console.error('❌ Usage : node avis.js --url=https://clutch.co/profile/xxx');
    console.error('        ou : node avis.js --urls=url1,url2,url3');
    console.error('        ou : node avis.js --all   (scrape tous les concurrents connus dans Supabase, filtrés par nombre_avis)');
    process.exit(1);
  }

  // Si nom/service sont donnés manuellement ET qu'il n'y a qu'une seule URL,
  // on les utilise directement sans passer par Supabase (utile pour un profil
  // pas encore migré dans competitors).
  if (urls.length === 1 && nomManuel && serviceManuel) {
    await scraperUnProfil({ nom: nomManuel, url_profil: urls[0], service_type: serviceManuel });
    return;
  }

  // Sinon, lookup automatique du nom + service_type via url_profil dans Supabase.
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant dans le .env (requis pour le lookup automatique).');
    console.error('   Sinon, précise --nom= et --service= manuellement (uniquement possible avec 1 seule URL).');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let nbOk = 0, nbIgnores = 0, nbErreurs = 0;
  for (const url of urls) {
    const { data: competitor, error } = await supabase
      .from('competitors')
      .select('nom, service_type')
      .eq('url_profil', url)
      .maybeSingle();

    if (error) {
      console.error(`❌ Erreur de recherche pour ${url} : ${error.message}`);
      nbErreurs++;
      continue;
    }
    if (!competitor) {
      console.warn(`⚠️ URL introuvable dans competitors : ${url}`);
      console.warn('   → ce profil n\'a pas encore été migré, ou l\'URL ne correspond pas exactement à url_profil.');
      console.warn('   → relance avec --nom= et --service= pour forcer (uniquement en mode 1 URL).');
      nbErreurs++;
      continue;
    }

    const resultat = await scraperUnProfil({
      nom: competitor.nom,
      url_profil: url,
      service_type: competitor.service_type || 'mobile',
    });
    if (resultat.statut === 'ok') nbOk++;
    else if (resultat.statut === 'ignore') nbIgnores++;
    else nbErreurs++;
  }

  if (urls.length > 1) {
    console.log(`\n📊 Terminé : ${nbOk} scrapé(s), ${nbIgnores} déjà présent(s), ${nbErreurs} en erreur.`);
  }
}

main();