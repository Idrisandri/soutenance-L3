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

// Adapte selon le service migré (mobile ou web)
const INPUT_FILE = path.join(__dirname, 'competitors-lafabriquedunet-web.json');

// Champs à comparer pour détecter un changement
const CHAMPS_A_COMPARER = [
  'budget_minimum_projet',
  'fourchette_projets_min',
  'fourchette_projets_max',
  'budget_median',
  'tranche_plus_courante',
  'evaluation_tarifs',
  'note',
  'nombre_avis',
];

function chargerJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(` Fichier introuvable : ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function migrerUneEntreprise(entreprise) {
  const dateReleve = new Date().toISOString();

  // 1. Upsert dans competitors — table partagée entre toutes les sources,
  //    ne contient que l'identité (nom, url, ville, service_type)
  const { data: competitor, error: errCompetitor } = await supabase
    .from('competitors')
    .upsert(
      {
        nom: entreprise.nom,
        url_profil: entreprise.url_profil,
        ville: entreprise.ville || null,
        service_type: entreprise.service_type,
        date_ajout: entreprise.date_ajout || dateReleve.slice(0, 10),
      },
      { onConflict: 'url_profil,service_type' }
    )
    .select('id')
    .single();

  if (errCompetitor) {
    console.error(` Erreur competitors pour ${entreprise.nom} : ${errCompetitor.message}`);
    return false;
  }

  const competitorId = competitor.id;

  const donneesTarifs = {
    competitor_id: competitorId,
    nom: entreprise.nom,
    service_type: entreprise.service_type,
    budget_minimum_projet: entreprise.budget_minimum_projet || null,
    fourchette_projets_min: entreprise.fourchette_projets_min || null,
    fourchette_projets_max:
      entreprise.fourchette_projets_max !== 'No content available'
        ? entreprise.fourchette_projets_max || null
        : null,
    budget_median:
      entreprise.budget_median !== 'No content available' ? entreprise.budget_median || null : null,
    tranche_plus_courante:
      entreprise.tranche_plus_courante !== 'No content available'
        ? entreprise.tranche_plus_courante || null
        : null,
    evaluation_tarifs: entreprise.evaluation_tarifs || null,
    note: entreprise.note ?? null,
    nombre_avis: entreprise.nombre_avis ?? null,
  };

  // --- Vérifie si les données ont changé par rapport à ce qui existe déjà ---
  const { data: existant, error: errLecture } = await supabase
    .from('etat_marche_lafabriquedunet')
    .select(CHAMPS_A_COMPARER.join(', '))
    .eq('competitor_id', competitorId)
    .maybeSingle();

  if (errLecture) {
    console.error(` Erreur lecture etat_marche pour ${entreprise.nom} : ${errLecture.message}`);
    return false;
  }

  const aChange =
    !existant ||
    CHAMPS_A_COMPARER.some((champ) => {
      const ancien = existant[champ];
      const nouveau = donneesTarifs[champ];
      // normalise pour comparer null/undefined proprement (et types numériques en string)
      const a = ancien === null || ancien === undefined ? null : String(ancien);
      const b = nouveau === null || nouveau === undefined ? null : String(nouveau);
      return a !== b;
    });

  if (!aChange) {
    console.log(`⏭️  ${entreprise.nom} [${entreprise.service_type}] → aucune donnée modifiée, on ignore`);
    return true;
  }
  // --- Fin de la vérification ---

  // 2. Upsert dans etat_marche_lafabriquedunet (table dédiée à cette source)
  //    → embedding remis à null car les données tarifaires ont changé,
  //      il devra être recalculé (sinon il resterait basé sur l'ancien texte)
  const { error: errEtat } = await supabase
    .from('etat_marche_lafabriquedunet')
    .upsert(
      { ...donneesTarifs, derniere_maj: dateReleve, embedding: null },
      { onConflict: 'competitor_id' }
    );

  if (errEtat) {
    console.error(` Erreur etat_marche_lafabriquedunet pour ${entreprise.nom} : ${errEtat.message}`);
    return false;
  }

  // 3. Insert dans historique_prix_lafabriquedunet (append-only)
  //    → uniquement si quelque chose a changé, donc pas de doublons inutiles
  const { error: errHisto } = await supabase.from('historique_prix_lafabriquedunet').insert({
    ...donneesTarifs,
    date_releve: dateReleve,
  });

  if (errHisto) {
    console.warn(` Erreur historique pour ${entreprise.nom} : ${errHisto.message}`);
  }

  console.log(` ${entreprise.nom} [${entreprise.service_type}] → competitor_id ${competitorId} (mis à jour)`);
  return true;
}

async function main() {
  const entreprises = chargerJSON(INPUT_FILE);
  console.log(`👉 ${entreprises.length} entreprise(s) à migrer depuis ${path.basename(INPUT_FILE)}...\n`);

  let nbOk = 0;
  let nbErreurs = 0;

  for (const entreprise of entreprises) {
    const ok = await migrerUneEntreprise(entreprise);
    if (ok) nbOk++;
    else nbErreurs++;
  }

  console.log(`\n Migration terminée : ${nbOk} réussie(s), ${nbErreurs} échouée(s).`);
}

main().catch((err) => {
  console.error(' Erreur fatale :', err);
  process.exit(1);
});