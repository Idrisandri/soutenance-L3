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

// Un fichier par entreprise/lot : resultats_analyse_glush.json, resultats_analyse_meant4.json, etc.
// Générés automatiquement par analyze_reviews.py dans le dossier resultats/.
const RESULTATS_DIR = path.join(__dirname, 'resultats');
const ARCHIVE_DIR = path.join(RESULTATS_DIR, 'migres');

// Tables "etat_marche" existantes dont l'embedding doit être invalidé quand
// l'analyse d'avis d'un concurrent change. Un même competitor_id ne vit
// généralement que dans UNE de ces tables, mais comme un .update() sur une
// ligne inexistante ne fait rien (pas d'erreur), on peut sans risque tenter
// le reset sur toutes les tables candidates.
const TABLES_ETAT_MARCHE = ['etat_marche', 'etat_marche_lafabriquedunet'];

function chargerJSON(filePath, defaut) {
  if (!fs.existsSync(filePath)) return defaut;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function trouverFichiersResultats() {
  if (!fs.existsSync(RESULTATS_DIR)) return [];
  return fs
    .readdirSync(RESULTATS_DIR)
    .filter((f) => f.startsWith('resultats_analyse') && f.endsWith('.json'));
}

// Reset l'embedding dans TOUTES les tables etat_marche* pour ce concurrent.
// Retourne true si au moins une table a été effectivement modifiée.
async function resetEmbeddings(competitorId, concurrent, serviceType) {
  let auMoinsUnReset = false;

  for (const table of TABLES_ETAT_MARCHE) {
    const { data, error } = await supabase
      .from(table)
      .update({ embedding: null })
      .eq('competitor_id', competitorId)
      .select('competitor_id'); // pour savoir si une ligne a réellement été touchée

    if (error) {
      console.warn(
        ` Reset embedding échoué (${table}) pour ${concurrent} [${serviceType}] : ${error.message}`
      );
      continue;
    }

    if (data && data.length > 0) {
      auMoinsUnReset = true;
      console.log(`   ↳ embedding réinitialisé dans ${table}`);
    }
  }

  return auMoinsUnReset;
}

async function migrerUnFichier(nomFichier) {
  const cheminComplet = path.join(RESULTATS_DIR, nomFichier);
  const resultats = chargerJSON(cheminComplet, []);

  if (resultats.length === 0) {
    console.warn(` ${nomFichier} est vide, ignoré.`);
    return { nbOk: 0, nbIgnores: 0 };
  }

  console.log(`\n ${nomFichier} : ${resultats.length} analyse(s) à migrer...`);

  let nbOk = 0;
  let nbIgnores = 0;

  for (const r of resultats) {
    const serviceType = r.service_type || 'mobile';

    if (r.erreur) {
      console.warn(` ${r.concurrent} [${serviceType}] : analyse en erreur, ignoré (${r.erreur})`);
      nbIgnores++;
      continue;
    }

    // Le matching se fait sur (nom, service_type), pas juste sur le nom :
    // une même entreprise peut avoir 2 lignes distinctes dans "competitors"
    // (ex: Atelier256 mobile = id 99, Atelier256 web = id 125).
    const { data: competitor, error: errFind } = await supabase
      .from('competitors')
      .select('id')
      .eq('nom', r.concurrent)
      .eq('service_type', serviceType)
      .maybeSingle();

    if (errFind) {
      console.error(` Erreur de recherche pour ${r.concurrent} [${serviceType}] : ${errFind.message}`);
      nbIgnores++;
      continue;
    }
    if (!competitor) {
      console.warn(` Aucun concurrent "${r.concurrent}" [${serviceType}] trouvé dans Supabase, ignoré.`);
      nbIgnores++;
      continue;
    }

    const { error: errUpsert } = await supabase.from('avis_analyse').upsert(
      {
        competitor_id: competitor.id,
        nom: r.concurrent,
        service_type: serviceType,
        sentiment_global: r.sentiment_global,
        score_sentiment: r.score_sentiment,
        themes: r.themes,
        points_forts: r.points_forts,
        points_faibles: r.points_faibles,
        autres_points: r.autres_points || [],
        nb_avis_analyses: r.nb_avis_analyses,
        date_analyse: new Date().toISOString(),
      },
      { onConflict: 'competitor_id' }
    );

    if (errUpsert) {
      console.error(` Erreur upsert pour ${r.concurrent} [${serviceType}] : ${errUpsert.message}`);
      nbIgnores++;
    } else {
      console.log(` ${r.concurrent} [${serviceType}] → analyse migrée (competitor_id ${competitor.id})`);

      // Le texte du document (prix + sentiment) a changé pour ce concurrent —
      // son embedding actuel (s'il existe) est donc périmé. On le remet à null
      // dans TOUTES les tables etat_marche* pour qu'il soit automatiquement
      // retraité au prochain lancement de embed_new_entries.py
      // (filtre "where embedding is null").
      const reset = await resetEmbeddings(competitor.id, r.concurrent, serviceType);
      if (!reset) {
        console.warn(
          `⚠️ Analyse migrée mais aucune ligne etat_marche* trouvée pour ${r.concurrent} [${serviceType}] (embedding non reset).`
        );
      }

      nbOk++;
    }
  }

  return { nbOk, nbIgnores };
}

function archiverFichier(nomFichier) {
  // Déplace le fichier .json migré (et son .csv jumeau s'il existe) vers resultats/migres/,
  // pour ne pas le re-traiter au prochain lancement. Rien n'est supprimé.
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  const cheminJson = path.join(RESULTATS_DIR, nomFichier);
  fs.renameSync(cheminJson, path.join(ARCHIVE_DIR, nomFichier));

  const nomCsv = nomFichier.replace(/\.json$/, '.csv');
  const cheminCsv = path.join(RESULTATS_DIR, nomCsv);
  if (fs.existsSync(cheminCsv)) {
    fs.renameSync(cheminCsv, path.join(ARCHIVE_DIR, nomCsv));
  }
}

async function main() {
  const fichiers = trouverFichiersResultats();

  if (fichiers.length === 0) {
    console.error(` Aucun fichier resultats_analyse*.json trouvé dans ${RESULTATS_DIR}/. Lance d'abord analyze_reviews.py.`);
    process.exit(1);
  }

  console.log(` ${fichiers.length} fichier(s) de résultats trouvé(s) : ${fichiers.join(', ')}`);

  let totalOk = 0;
  let totalIgnores = 0;

  for (const nomFichier of fichiers) {
    const { nbOk, nbIgnores } = await migrerUnFichier(nomFichier);
    totalOk += nbOk;
    totalIgnores += nbIgnores;

    // On archive seulement si au moins une ligne a été migrée avec succès,
    // pour ne pas perdre un fichier qui aurait totalement échoué.
    if (nbOk > 0) {
      archiverFichier(nomFichier);
      console.log(` ${nomFichier} archivé dans migres/`);
    }
  }

  console.log(`\n Migration terminée : ${totalOk} migrée(s), ${totalIgnores} ignorée(s) au total.`);
}

main().catch((err) => {
  console.error(' Erreur fatale :', err);
  process.exit(1);
});