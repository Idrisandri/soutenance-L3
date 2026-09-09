// fix-service-type.js
// Corrige les entrées de competitors.json créées AVANT l'ajout du champ service_type.
// Ne fait AUCUN appel à ScrapeGraphAI — juste une modification du fichier local.
//
// Usage : node fix-service-type.js

const fs = require('fs');
const path = require('path');

const COMPETITORS_FILE = path.join(__dirname, 'competitors.json');
const COMPETITORS_CSV = path.join(__dirname, 'competitors.csv');

if (!fs.existsSync(COMPETITORS_FILE)) {
  console.error('❌ competitors.json introuvable.');
  process.exit(1);
}

const competitors = JSON.parse(fs.readFileSync(COMPETITORS_FILE, 'utf-8'));

let nbCorriges = 0;
for (const c of competitors) {
  if (!c.service_type) {
    // Toutes les entrées sans service_type viennent du tout premier run,
    // qui ciblait exclusivement les concurrents mobile.
    c.service_type = 'mobile';
    nbCorriges++;
  }
}

fs.writeFileSync(COMPETITORS_FILE, JSON.stringify(competitors, null, 2), 'utf-8');

// Régénère le CSV à partir du JSON corrigé, pour que les 2 fichiers restent cohérents.
function toCSV(entreprises) {
  const headers = ['id', 'nom', 'url_profil', 'ville', 'service_type', 'date_ajout'];
  const rows = entreprises.map((e) =>
    headers
      .map((h) => `"${(e[h] ?? '').toString().replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

fs.writeFileSync(COMPETITORS_CSV, toCSV(competitors), 'utf-8');

console.log(`✅ ${nbCorriges} entrée(s) corrigée(s) avec service_type = "mobile".`);
console.log(`📊 Total dans le fichier : ${competitors.length}`);
console.log('💾 competitors.json et competitors.csv régénérés et cohérents.');