'use strict';

/**
 * Contract-Test fuer die Granularitaet der positionsgenauen LV-Mapping-Logik (Schritt E).
 *
 * Architekturregel (siehe docs/lv-architecture.md):
 *   `contentSource: 'static'` darf NIEMALS dazu fuehren, dass ein komplettes statisches Paket
 *   (steuerung.json / abnahme.json) ausgegeben wird, nur weil EINE seiner bestaetigten
 *   Bibliotheks-IDs positiv ist. Jede bestaetigte Bibliotheks-ID wird als eigenstaendige,
 *   genau EIN Modul umfassende LV-Position aufgeloest.
 *
 * Dieser Test prueft mit synthetischen Positionsdaten (nicht dem Referenzfall Berghof):
 *   1. Positive Granularitaetspruefung: genau die bestaetigte, positive Position erscheint.
 *   2. Negativpruefung: nicht positive/nicht bestaetigte Module desselben statischen Pakets
 *      (Frequenzumrichter, Notruf-/Lastmesssystem, Schaltschrank, Brandfallsteuerung, ...)
 *      duerfen NICHT miterscheinen.
 *   3. Dedup-Pruefung: mehrere Components-Positionen, die auf dieselbe Bibliotheks-ID zeigen,
 *      erzeugen genau EINE LV-Position.
 *   4. Vollstaendigkeitspruefung: sind alle 6 "Steuerung"-Familien-Positionen positiv, entstehen
 *      6 eigenstaendige LV-Positionen (nicht 1 Sammelposition mit allen Paketmodulen).
 *
 * Aufruf: node test/granularity-contract.test.js (oder: npm test)
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const {
  buildPositionMappingReport,
  resolveMappedStaticLvEntries,
  createBoQDocxBuffer,
} = require('../server.js');

let failures = 0;

function reportFailure(label, message) {
  failures += 1;
  console.error(`\n✗ ${label} GEBROCHEN: ${message}`);
}

function reportOk(label, message) {
  console.log(`✓ ${label} bestanden: ${message}`);
}

function requireLv(filename) {
  const lvPath = path.join(__dirname, '..', 'lv', filename);
  return JSON.parse(fs.readFileSync(lvPath, 'utf8'));
}

// Baut eine synthetische Query im selben Format wie readPositiveComponentsFromQuery() /
// readTechnischeKontext() sie aus dem echten Frontend-Request erwarten.
function buildSyntheticQuery({ positionen, technical = {} }) {
  return {
    data: {
      projekt: { projektart: technical.projektart || '' },
      technischeParameter: { aufzugstyp: technical.aufzugstyp || '' },
      kalkulation: {
        paketSummen: [
          {
            paket: 'synthetisch',
            positionen: positionen.map((p) => ({ id: p.id, anzahl: p.anzahl })),
          },
        ],
      },
    },
  };
}

function baseLvEntries() {
  return [
    { id: 'steuerung', titel: 'Steuerung', lv: requireLv('steuerung.json') },
    { id: 'antrieb', titel: 'Antriebseinheit', lv: requireLv('antrieb.json') },
    { id: 'abnahme', titel: 'Abnahme', lv: requireLv('abnahme.json') },
  ];
}

function allModuleTitels(entries) {
  return entries.flatMap((entry) => (entry.lv?.module || []).map((m) => m.titel));
}

async function extractDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Titel der Module in steuerung.json, die (noch) KEINER bestaetigten Bibliotheks-ID zugeordnet
// sind. Diese duerfen unter keinen Umstaenden automatisch mit ausgegeben werden, nur weil eine
// andere, bestaetigte Steuerung-Position positiv ist. Fuer den Vergleich auf Zwischenstruktur-
// Ebene (module.titel) genuegt der Titel.
const NICHT_BESTAETIGTE_STEUERUNG_MODUL_TITEL = [
  'Schaltschrank',
  'Brandfallsteuerung',
  'Schachtkopierung',
  'Standby Betrieb',
  'Fahrkorblichtabschaltung',
  'Parkhaltestelle',
  'Lastmesssystem',
  'Frequenzumrichter / Regelung',
  'Verzögerungskontrollschaltung / Temporäre Schutzräume',
  'Elektroinstallation (Fahrkorb)',
  'Infofeld neben den Etagentastern Fahrkorbtableau',
];

// Fuer die DOCX-Volltextpruefung reichen kurze Titel wie "Schaltschrank" nicht aus: Die
// Vorbemerkung (backend/lv/vorbemerkung.txt) erwaehnt einzelne Begriffe (z. B. "Schaltschrank",
// "Frequenzumrichter" als Abkuerzungslegende "FU") unabhaengig von der LV-Mappinglogik als
// allgemeinen Boilerplate-Text. Deshalb werden hier eindeutige, mehrere Worte lange Textfragmente
// aus dem jeweiligen Modultext verwendet, die NUR erscheinen duerfen, wenn das Modul tatsaechlich
// als eigene LV-Position gerendert wurde.
const NICHT_BESTAETIGTE_STEUERUNG_MODUL_FRAGMENTE = [
  'Hinsichtlich der Verdrahtung des Schaltschrankes',
  'Hauptevakuierungshaltestelle',
  'Millimetergenaue Positionsbestimmung',
  'Standby Betrieb für Aufzugssteuerung',
  'Beendigung der letzten Fahrt',
  'Parkhaltestelle programmiert werden kann',
  'Lastwiegeeinrichtung muss in der Lage sein',
  'Rückspeiseoption ins Netz',
  'Generierung temporärer Schutzräume',
  'Reservesteckdosen',
  'Plexiglasabdeckung zur Aufnahme einer Folie',
];

async function testPositiveGranularityAndNegativeLeakage() {
  const label = 'Test 1+2 (Positive Granularitaet / Negativ-Leckage)';
  const query = buildSyntheticQuery({
    positionen: [{ id: 'schachtbeleuchtung', anzahl: 1 }],
  });

  const resolved = resolveMappedStaticLvEntries(query, baseLvEntries());
  const titels = allModuleTitels(resolved);

  if (resolved.length !== 1) {
    reportFailure(label, `Erwartet genau 1 aufgeloeste LV-Position, erhalten: ${resolved.length} (${resolved.map((e) => e.titel).join(', ')})`);
    return;
  }

  if (!titels.includes('Schachtbeleuchtung')) {
    reportFailure(label, `Bestaetigte Position "Schachtbeleuchtung" fehlt in der Export-Auswahl.`);
    return;
  }

  const leaked = NICHT_BESTAETIGTE_STEUERUNG_MODUL_TITEL.filter((titel) => titels.includes(titel));
  if (leaked.length > 0) {
    reportFailure(label, `Nicht positive/nicht bestaetigte Steuerungsmodule sind trotzdem in der Auswahl enthalten: ${leaked.join(', ')}`);
    return;
  }

  // Zusaetzlich auf DOCX-Ebene pruefen, nicht nur auf der Zwischenstruktur.
  const buffer = await createBoQDocxBuffer(query);
  const docxText = await extractDocxText(buffer);
  const leakedInDocx = NICHT_BESTAETIGTE_STEUERUNG_MODUL_FRAGMENTE.filter((fragment) => docxText.includes(fragment));
  if (leakedInDocx.length > 0) {
    reportFailure(label, `Nicht bestaetigte Steuerungsmodule erscheinen im erzeugten DOCX-Text: ${leakedInDocx.join(', ')}`);
    return;
  }

  reportOk(label, 'Nur die eine positive, bestaetigte Position (Schachtbeleuchtung) erscheint - keine weiteren Steuerungsmodule, weder in der Zwischenstruktur noch im DOCX.');
}

async function testDedupSameBibliotheksId() {
  const label = 'Test 3 (Dedup: mehrere Components-Positionen -> gleiche Bibliotheks-ID)';

  // hydraulikschlauch + hydraulikoel -> dieselbe Ziel-ID LV_14_05_...
  const queryHydraulik = buildSyntheticQuery({
    positionen: [
      { id: 'hydraulikschlauch', anzahl: 1 },
      { id: 'hydraulikoel', anzahl: 292.54 },
    ],
    technical: { aufzugstyp: 'hydraulik' },
  });
  const resolvedHydraulik = resolveMappedStaticLvEntries(queryHydraulik, baseLvEntries());
  if (resolvedHydraulik.length !== 1) {
    reportFailure(label, `hydraulikschlauch + hydraulikoel erzeugen ${resolvedHydraulik.length} LV-Positionen statt genau 1 (dedupliziert).`);
    return;
  }

  // 4 ZUeS-/Pruefgewicht-Positionen -> dieselbe Ziel-ID LV_02_07_...
  const queryPvi = buildSyntheticQuery({
    positionen: [
      { id: 'zues_kosten_vorpruefung', anzahl: 1 },
      { id: 'zues_kosten_abnahme', anzahl: 1 },
      { id: 'zues_begleitung_durch_an_aufzug', anzahl: 1 },
      { id: 'pruefgewichte', anzahl: 1 },
    ],
    technical: { projektart: 'teilmodernisierung' },
  });
  const resolvedPvi = resolveMappedStaticLvEntries(queryPvi, baseLvEntries());
  if (resolvedPvi.length !== 1) {
    reportFailure(label, `4 PVI-Components-Positionen erzeugen ${resolvedPvi.length} LV-Positionen statt genau 1 (dedupliziert).`);
    return;
  }

  reportOk(label, 'Mehrere Components-Positionen auf dieselbe Bibliotheks-ID erzeugen jeweils genau eine LV-Position.');
}

async function testAllSteuerungFamilyPositionsRemainDistinct() {
  const label = 'Test 4 (6 bestaetigte Steuerung-Positionen bleiben 6 eigenstaendige LV-Positionen)';

  const query = buildSyntheticQuery({
    positionen: [
      { id: 'steuerung', anzahl: 1 },
      { id: 'fahrkorbtableau', anzahl: 1 },
      { id: 'aussenruftableau', anzahl: 2 },
      { id: 'standanzeige', anzahl: 2 },
      { id: 'schachtbeleuchtung', anzahl: 1 },
      { id: 'kabelkanaele', anzahl: 1 },
    ],
  });

  const resolved = resolveMappedStaticLvEntries(query, baseLvEntries());
  const expectedTitels = [
    'Steuerung',
    'Fahrkorbtableau vertikal',
    'Befehlsgeber (Außenruf)',
    'Stand- und Weiterfahrtanzeige Außen',
    'Schachtbeleuchtung',
    'Schachtinstallation (Elektro)',
  ];

  if (resolved.length !== 6) {
    reportFailure(label, `Erwartet 6 eigenstaendige LV-Positionen, erhalten: ${resolved.length} (${resolved.map((e) => e.titel).join(', ')}).`);
    return;
  }

  // Jede Position darf genau ein Modul enthalten (kein Sammelpaket).
  const notSingleModule = resolved.filter((entry) => (entry.lv?.module || []).length !== 1);
  if (notSingleModule.length > 0) {
    reportFailure(label, `Folgende Positionen enthalten nicht genau ein Modul: ${notSingleModule.map((e) => `${e.titel} (${(e.lv?.module || []).length})`).join(', ')}`);
    return;
  }

  const resolvedTitels = allModuleTitels(resolved);
  const missing = expectedTitels.filter((t) => !resolvedTitels.includes(t));
  if (missing.length > 0) {
    reportFailure(label, `Folgende erwarteten Titel fehlen: ${missing.join(', ')}`);
    return;
  }

  const leaked = NICHT_BESTAETIGTE_STEUERUNG_MODUL_TITEL.filter((titel) => resolvedTitels.includes(titel));
  if (leaked.length > 0) {
    reportFailure(label, `Nicht bestaetigte Steuerungsmodule sind trotzdem enthalten: ${leaked.join(', ')}`);
    return;
  }

  reportOk(label, 'Alle 6 bestaetigten Steuerung-Familien-Positionen erscheinen als 6 eigenstaendige, je genau ein Modul umfassende LV-Positionen - keine unbestaetigten Zusatzmodule.');
}

async function testOpenPositionsRemainOpenWhenIsolated() {
  const label = 'Test 5 (Isolierte offene Position bleibt offen, kein Fallback-Text)';
  const query = buildSyntheticQuery({
    positionen: [{ id: 'maschine_standardrahmen', anzahl: 1 }],
  });

  const report = buildPositionMappingReport(query);
  const openIds = new Set((report.open || []).flatMap((entry) => entry.componentsIds || []));
  const mappedIds = new Set((report.mapped || []).map((entry) => entry.bibliotheksId));

  if (!openIds.has('maschine_standardrahmen')) {
    reportFailure(label, 'maschine_standardrahmen erscheint nicht im open-Report.');
    return;
  }

  const resolved = resolveMappedStaticLvEntries(query, baseLvEntries());
  if (resolved.length !== 0) {
    reportFailure(label, `Erwartet 0 aufgeloeste LV-Positionen fuer eine ausschliesslich offene Position, erhalten: ${resolved.length}.`);
    return;
  }

  reportOk(label, `maschine_standardrahmen bleibt korrekt "open" (${mappedIds.size} gemappte IDs, 0 aufgeloeste Positionen), kein erfundener Ersatztext.`);
}

async function main() {
  console.log('=== BoQ Granularitaets-Contract-Test (Schritt E) ===\n');

  await testPositiveGranularityAndNegativeLeakage();
  await testDedupSameBibliotheksId();
  await testAllSteuerungFamilyPositionsRemainDistinct();
  await testOpenPositionsRemainOpenWhenIsolated();

  console.log('\n=== Ergebnis ===');
  if (failures > 0) {
    console.error(`✗ FEHLGESCHLAGEN: ${failures} Pruefung(en) gebrochen.`);
    process.exitCode = 1;
  } else {
    console.log('✓ ERFOLGREICH: Granularitaet, Dedup- und Offen-Verhalten entsprechen der bestaetigten Architektur.');
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error('Unerwarteter Testfehler:', error);
  process.exitCode = 1;
});
