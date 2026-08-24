'use strict';

/**
 * Contract-Test fuer die positionsgenaue LV-Mapping-Logik (Referenzfall Berghof Luetjensee).
 *
 * Teststandard (siehe project-memory.md / docs/lv-architecture.md):
 *   "gruen" bedeutet NICHT: HTTP 200, DOCX vorhanden, Stichprobe okay.
 *   "gruen" bedeutet: vollstaendiger Soll-Ist-Abgleich aller bestaetigten Mapping-IDs,
 *   offene Positionen nachvollziehbar, Negativliste bestanden, keine erwartete
 *   gemappte Position verloren.
 *
 * Der Test prueft 5 Stufen (A-E). Schlaegt eine Stufe fehl, wird klar benannt, auf
 * welcher Stufe der Datenpfad gebrochen ist - der Test bricht danach sofort ab.
 *
 * Aufruf: node test/mapping-contract.test.js   (oder: npm test)
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const {
  buildPositionMappingReport,
  resolveMappedStaticLvEntries,
  createBoQDocxBuffer,
  loadBibliothek,
} = require('../server.js');

const BERGHOF_JSON_PATH = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  '260824_Berghof_Luetjensee_Aufzug_155180_datenexport_XL (3).json'
);

// --- Soll-Liste: bestaetigter Mappingstand (siehe Arbeitsauftrag / project-memory.md) ---
// Diese IDs werden NICHT als Ersatz fuer die produktive Mappinglogik verwendet, sondern
// als Minimal-Erwartung, gegen die das TATSAECHLICHE Ergebnis von buildPositionMappingReport()
// und resolveMappedStaticLvEntries() (beides produktive Funktionen aus server.js) geprueft wird.
const EXPECTED_MAPPED_BIBLIOTHEKS_IDS = [
  'LV_14_05_HYDRAULIKSCHLAUCHE_UND_HYDRAULIKOL',
  'LV_12_02_STEUERUNG',
  'LV_10_20_FAHRKORBTABLEAU_VERTIKAL',
  'LV_11_16_BEFEHLSGEBER_AUSSENRUF',
  'LV_11_20_STAND_UND_WEITERFAHRTANZEIGE_AUSSEN',
  'LV_09_02_SCHACHTBELEUCHTUNG',
  'LV_09_01_SCHACHTINSTALLATION_ELEKTRO',
  'LV_07_05_MALERARBEITEN_SCHACHTGRUBE',
  'LV_02_07_INVERKEHRBRINGUNG_INBETRIEBNAHME_PVI',
  'LV_02_09_TRANSPORT_UND_BAUSTELLENEINRICHTUNG',
];

// Components-Positionen, die im aktuellen Mappingstand bewusst offen bleiben (kein
// erfundener Ersatzbaustein).
const EXPECTED_OPEN_COMPONENTS_IDS = [
  'maschine_standardrahmen',
  'tuerfuehrungen',
  'tuerlaufrollen',
  'tuerkontakte',
  'tuerseile',
  'teil_umbaukit_schiebetueren',
];

// Verbotene Seil-/MRL-Texte: duerfen bei einem Hydraulikaufzug unter keinen Umstaenden
// im erzeugten Word-Dokument erscheinen.
const NEGATIVE_LIST = [
  'Antrieb Seil',
  'MRL - Seil Synchron',
  'Treibscheibenantrieb',
  'Tragmittel / Aufhängung',
  'Tragseile',
  'Seilkauschen',
  'Seilaufhängung',
];

let failures = 0;

function reportStageFailure(stage, message) {
  failures += 1;
  console.error(`\n✗ STUFE ${stage} GEBROCHEN: ${message}`);
}

function reportStageOk(stage, message) {
  console.log(`✓ Stufe ${stage} bestanden: ${message}`);
}

// Identisch zu normalizeToken() in server.js (dort nicht exportiert).
function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

// Baut den Request-Body exakt so, wie ihn triggerSteuerungWordExport() im Frontend
// (frontend/index.html) tatsaechlich sendet - damit der Test die reale Uebertragungsform
// prueft und nicht nur einen internen Abkuerzungsaufruf.
function buildFrontendLikeRequestBody(berghofData) {
  const projekt = berghofData.projekt || {};
  const anlage = berghofData.anlage || {};
  const auftraggeber = berghofData.auftraggeber || {};
  const technik = berghofData.technik || {};

  return {
    projektname: projekt.bauvorhaben || projekt.name || '',
    projektnummer: projekt.projektnummer || projekt.id || '',
    projektart: projekt.projektart || '',
    strasse: projekt.strasse || '',
    plz: projekt.postleitzahl || projekt.plz || '',
    stadt: projekt.stadt || '',
    leistung: anlage.bezeichnung || '',
    agkunde: auftraggeber.kunde || '',
    agadresse: auftraggeber.adresse || '',
    agplz: auftraggeber.plz || '',
    aort: auftraggeber.ort || '',
    technik_json: JSON.stringify(technik),
    data: berghofData,
  };
}

async function extractDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const text = xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return text.replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('=== BoQ Mapping-Contract-Test: Referenzfall Berghof Luetjensee / Aufzug 155180 ===\n');

  if (!fs.existsSync(BERGHOF_JSON_PATH)) {
    reportStageFailure('A', `Referenzdatei nicht gefunden: ${BERGHOF_JSON_PATH}`);
    printSummaryAndExit();
    return;
  }

  const berghofData = JSON.parse(fs.readFileSync(BERGHOF_JSON_PATH, 'utf8'));
  const requestBody = buildFrontendLikeRequestBody(berghofData);
  const query = { ...requestBody }; // entspricht dem gemergten req.query+req.body im Backend

  // --- Stufe A: Input - positive Components-Positionen ---
  const mappingReport = buildPositionMappingReport(query);
  const positives = mappingReport.positives || [];

  if (positives.length === 0) {
    reportStageFailure('A', 'Keine positiven Positionen aus kalkulation.paketSummen[*].positionen erkannt.');
  } else {
    reportStageOk('A', `${positives.length} positive Positionen erkannt (Menge > 0).`);
  }

  const positiveIds = new Set(positives.map((p) => p.id));
  const technical = mappingReport.technical || {};
  if (normalizeToken(technical.aufzugstyp) !== 'hydraulik') {
    reportStageFailure('A', `Technischer Kontext nicht als Hydraulik erkannt (aufzugstyp="${technical.aufzugstyp}").`);
  } else {
    reportStageOk('A', 'Technischer Kontext korrekt als Hydraulik erkannt.');
  }

  // --- Stufe B: Mapping - erwartete Ziel-LV-IDs + offene Positionen ---
  const mappedIds = new Set((mappingReport.mapped || []).map((entry) => entry.bibliotheksId));
  const missingMapped = EXPECTED_MAPPED_BIBLIOTHEKS_IDS.filter((id) => !mappedIds.has(id));

  if (missingMapped.length > 0) {
    reportStageFailure(
      'B',
      `buildPositionMappingReport() liefert nicht alle erwarteten Ziel-LV-IDs. Fehlend: ${missingMapped.join(', ')}`
    );
  } else {
    reportStageOk('B', `Alle ${EXPECTED_MAPPED_BIBLIOTHEKS_IDS.length} erwarteten Ziel-LV-IDs im Mapping-Report vorhanden.`);
  }

  const openComponentsIds = new Set();
  for (const entry of mappingReport.open || []) {
    for (const id of entry.componentsIds || []) {
      openComponentsIds.add(id);
    }
  }
  const missingOpen = EXPECTED_OPEN_COMPONENTS_IDS.filter((id) => positiveIds.has(id) && !openComponentsIds.has(id));
  const wronglyMapped = EXPECTED_OPEN_COMPONENTS_IDS.filter((id) => mappedIds.has(id));

  if (missingOpen.length > 0) {
    reportStageFailure('B', `Positive, aber bewusst offene Positionen fehlen im open-Report: ${missingOpen.join(', ')}`);
  } else if (wronglyMapped.length > 0) {
    reportStageFailure('B', `Offene Positionen wurden faelschlich mit einer Ziel-LV-ID gemappt: ${wronglyMapped.join(', ')}`);
  } else {
    reportStageOk('B', 'Bewusst offene Positionen bleiben korrekt als "open" nachvollziehbar.');
  }

  // --- Stufe C: Resolution - jede Ziel-LV-ID loest sich tatsaechlich in einen Baustein auf ---
  const bibliothek = loadBibliothek();
  const baseLvEntries = [
    { id: 'steuerung', titel: 'Steuerung', lv: requireLv('steuerung.json') },
    { id: 'antrieb', titel: 'Antriebseinheit', lv: requireLv('antrieb.json') },
    { id: 'abnahme', titel: 'Abnahme', lv: requireLv('abnahme.json') },
  ];
  const resolvedEntries = resolveMappedStaticLvEntries(query, baseLvEntries);

  const unresolvedIds = [];
  for (const bibId of EXPECTED_MAPPED_BIBLIOTHEKS_IDS) {
    const canonicalTitel = bibliothek?.[bibId]?.titel;
    if (!canonicalTitel) {
      unresolvedIds.push(`${bibId} (kein Bibliothekseintrag in backend/lv/bibliothek.json)`);
      continue;
    }

    const hasContent = resolvedEntries.some((entry) =>
      (entry.lv?.module || []).some((modul) => String(modul.titel || '').trim() === canonicalTitel.trim())
    );

    if (!hasContent) {
      unresolvedIds.push(`${bibId} ("${canonicalTitel}" nicht in aufgeloester Export-Auswahl gefunden)`);
    }
  }

  if (unresolvedIds.length > 0) {
    reportStageFailure('C', `Folgende Ziel-LV-IDs loesen sich nicht in einen realen Bibliotheksbaustein auf:\n   - ${unresolvedIds.join('\n   - ')}`);
  } else {
    reportStageOk('C', 'Jede erwartete Ziel-LV-ID loest sich in einen realen, nicht-leeren Bibliotheksbaustein auf.');
  }

  const hasAntriebEntry = resolvedEntries.some((entry) => entry.id === 'antrieb');
  if (hasAntriebEntry) {
    reportStageFailure('C', 'Der statische Seil-/MRL-Antriebsblock (antrieb.json) ist trotz Hydraulik-Kontext in der Export-Auswahl enthalten.');
  } else {
    reportStageOk('C', 'Kein statischer Seil-/MRL-Antriebsblock in der Export-Auswahl.');
  }

  // --- Stufe D: Export - jede erwartete Ziel-LV-ID gelangt tatsaechlich in die Word-Auswahl ---
  // (identisch zu Stufe C ueberprueft, aber ueber die tatsaechliche resolveMappedStaticLvEntries-
  // Ausgabe, die auch von createBoQDocxBuffer()/getWordExportLvEntries() verwendet wird.)
  const exportedIds = new Set(resolvedEntries.map((entry) => entry.id));
  if (!exportedIds.has('steuerung')) {
    reportStageFailure('D', 'Die Steuerungs-Position fehlt in der finalen Word-Export-Auswahl.');
  } else if (!exportedIds.has('abnahme')) {
    reportStageFailure('D', 'Die Abnahme-Position fehlt in der finalen Word-Export-Auswahl.');
  } else {
    reportStageOk('D', 'Steuerung und Abnahme sind in der finalen Word-Export-Auswahl enthalten.');
  }

  // --- Stufe E: DOCX-Inhalt - erwartete Inhalte vorhanden, verbotene Inhalte nicht vorhanden ---
  let docxText = '';
  try {
    const buffer = await createBoQDocxBuffer(query);
    docxText = await extractDocxText(buffer);
    reportStageOk('E', `DOCX erfolgreich erzeugt (${buffer.length} Bytes).`);
  } catch (error) {
    reportStageFailure('E', `DOCX-Erzeugung fehlgeschlagen: ${error.message}`);
  }

  if (docxText) {
    const missingTitles = EXPECTED_MAPPED_BIBLIOTHEKS_IDS.filter((bibId) => {
      const titel = bibliothek?.[bibId]?.titel;
      return !titel || !docxText.toLowerCase().includes(titel.toLowerCase());
    });

    if (missingTitles.length > 0) {
      reportStageFailure('E', `Folgende bestaetigten Bausteine fehlen inhaltlich im erzeugten DOCX: ${missingTitles.join(', ')}`);
    } else {
      reportStageOk('E', 'Alle bestaetigten Bausteine sind inhaltlich im erzeugten DOCX vorhanden.');
    }

    const foundNegative = NEGATIVE_LIST.filter((term) => docxText.toLowerCase().includes(term.toLowerCase()));
    if (foundNegative.length > 0) {
      reportStageFailure('E', `Verbotene Seil-/MRL-Begriffe im DOCX gefunden: ${foundNegative.join(', ')}`);
    } else {
      reportStageOk('E', 'Negativpruefung Seil/MRL bestanden - keine verbotenen Begriffe im DOCX.');
    }
  }

  printSummaryAndExit();
}

function requireLv(filename) {
  const lvPath = path.join(__dirname, '..', 'lv', filename);
  return JSON.parse(fs.readFileSync(lvPath, 'utf8'));
}

function printSummaryAndExit() {
  console.log('\n=== Ergebnis ===');
  if (failures > 0) {
    console.error(`✗ FEHLGESCHLAGEN: ${failures} Stufe(n) gebrochen. Kein Test darf als erfolgreich gelten, wenn eine bestaetigte Ziel-LV-ID fehlt.`);
    process.exitCode = 1;
  } else {
    console.log('✓ ERFOLGREICH: Vollstaendiger Soll-Ist-Abgleich aller bestaetigten Mapping-IDs bestanden, offene Positionen nachvollziehbar, Negativliste bestanden.');
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error('Unerwarteter Testfehler:', error);
  process.exitCode = 1;
});
