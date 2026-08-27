'use strict';

/**
 * Variantenfaehiges Mapping (Schritt G/H): `maschine_standardrahmen` zeigt abhaengig von
 * `hydraulikRegelungsart` auf unterschiedliche Bibliotheks-IDs (oder bleibt bewusst offen).
 *
 * Fachliche Grundlage (siehe docs/components-boq-begriffsmatrix.md, docs/lv-architecture.md
 * Abschnitt 17/18):
 *   - hydraulik + frequenzgeregelt -> LV_14_01_TWR_HYDRAULIK_FREQUENZGEREGELT
 *   - hydraulik + softstart        -> LV_14_02_TWR_HYDRAULIK_MIT_SOFTSTART
 *   - hydraulik + konventionell    -> bleibt offen (kein bestaetigter Bibliotheksbaustein)
 *   - seil (jede Regelungsart)     -> bleibt offen (keine eindeutige Zuordnung, siehe Begriffsmatrix)
 *
 * `antriebTyp` (mechanische Aufhaengungsart) und `hydraulikRegelungsart` (Regelungselektronik)
 * duerfen nicht gekoppelt werden - dieser Test verwendet bewusst einen von `antriebTyp`
 * unabhaengigen technischen Kontext.
 *
 * Aufruf: node test/variant-mapping.test.js (oder: npm test)
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const { buildPositionMappingReport, resolveMappedStaticLvEntries, createBoQDocxBuffer } = require('../server.js');

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

function baseLvEntries() {
  return [
    { id: 'steuerung', titel: 'Steuerung', lv: requireLv('steuerung.json') },
    { id: 'antrieb', titel: 'Antriebseinheit', lv: requireLv('antrieb.json') },
    { id: 'abnahme', titel: 'Abnahme', lv: requireLv('abnahme.json') },
  ];
}

function buildQuery({ aufzugstyp, hydraulikRegelungsart, antriebTyp }) {
  return {
    data: {
      projekt: { projektart: '' },
      technischeParameter: { aufzugstyp, hydraulikRegelungsart, antriebTyp: antriebTyp || '' },
      kalkulation: {
        paketSummen: [{ paket: 'antrieb', positionen: [{ id: 'maschine_standardrahmen', anzahl: 1 }] }],
      },
    },
  };
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

async function testVariant(label, technical, expectedBibliotheksId, expectedTitel) {
  const query = buildQuery(technical);
  const report = buildPositionMappingReport(query);

  const mappedIds = (report.mapped || []).map((e) => e.bibliotheksId);
  const openIds = new Set((report.open || []).flatMap((e) => e.componentsIds || []));

  if (expectedBibliotheksId) {
    if (!mappedIds.includes(expectedBibliotheksId)) {
      reportFailure(label, `Erwartete Ziel-ID "${expectedBibliotheksId}" fehlt im Mapping-Report (mapped: ${JSON.stringify(mappedIds)}).`);
      return;
    }
    if (openIds.has('maschine_standardrahmen')) {
      reportFailure(label, `maschine_standardrahmen erscheint zugleich als "open" - Widerspruch zur gemappten Position.`);
      return;
    }

    const resolved = resolveMappedStaticLvEntries(query, baseLvEntries());
    const titels = resolved.flatMap((e) => (e.lv?.module || []).map((m) => m.titel));
    if (!titels.includes(expectedTitel)) {
      reportFailure(label, `Erwarteter Titel "${expectedTitel}" nicht in aufgeloester Auswahl gefunden (${JSON.stringify(titels)}).`);
      return;
    }

    const buffer = await createBoQDocxBuffer(query);
    const docxText = await extractDocxText(buffer);
    if (!docxText.includes(expectedTitel)) {
      reportFailure(label, `Erwarteter Titel "${expectedTitel}" fehlt im erzeugten DOCX-Text.`);
      return;
    }

    reportOk(label, `maschine_standardrahmen loest korrekt auf "${expectedBibliotheksId}" (${expectedTitel}) auf - Mapping-Report, Zwischenstruktur und DOCX stimmen ueberein.`);
    return;
  }

  // Erwartung: bleibt offen, keine Ziel-ID, kein erfundener Text.
  if (mappedIds.length > 0) {
    reportFailure(label, `maschine_standardrahmen wurde faelschlich gemappt (${JSON.stringify(mappedIds)}), sollte offen bleiben.`);
    return;
  }
  if (!openIds.has('maschine_standardrahmen')) {
    reportFailure(label, `maschine_standardrahmen fehlt im open-Report, obwohl kein bestaetigtes Mapping existiert.`);
    return;
  }

  const resolved = resolveMappedStaticLvEntries(query, baseLvEntries());
  if (resolved.length > 0) {
    reportFailure(label, `Es wurde trotz offener Position eine LV-Position aufgeloest (${JSON.stringify(resolved.map((e) => e.titel))}).`);
    return;
  }

  reportOk(label, 'maschine_standardrahmen bleibt korrekt offen (kein Bibliotheks-ID-Mapping, kein erfundener Text).');
}

async function testCrossContamination() {
  const label = 'Cross-Check (frequenzgeregelt und softstart schliessen sich gegenseitig aus)';
  const freqQuery = buildQuery({ aufzugstyp: 'hydraulik', hydraulikRegelungsart: 'frequenzgeregelt' });
  const softQuery = buildQuery({ aufzugstyp: 'hydraulik', hydraulikRegelungsart: 'softstart' });

  const freqResolved = resolveMappedStaticLvEntries(freqQuery, baseLvEntries());
  const softResolved = resolveMappedStaticLvEntries(softQuery, baseLvEntries());

  const freqTitels = freqResolved.flatMap((e) => (e.lv?.module || []).map((m) => m.titel));
  const softTitels = softResolved.flatMap((e) => (e.lv?.module || []).map((m) => m.titel));

  if (freqTitels.includes('TWR – Hydraulik mit Softstart')) {
    reportFailure(label, 'Frequenzgeregelt-Kontext enthaelt faelschlich den Softstart-Baustein.');
    return;
  }
  if (softTitels.includes('TWR – Hydraulik Frequenzgeregelt')) {
    reportFailure(label, 'Softstart-Kontext enthaelt faelschlich den Frequenzgeregelt-Baustein.');
    return;
  }
  if (freqResolved.length !== 1 || softResolved.length !== 1) {
    reportFailure(label, `Erwartet je genau 1 aufgeloeste Position, erhalten: frequenzgeregelt=${freqResolved.length}, softstart=${softResolved.length}.`);
    return;
  }

  reportOk(label, 'Frequenzgeregelt und Softstart schliessen sich in der aufgeloesten Auswahl gegenseitig eindeutig aus.');
}

async function main() {
  console.log('=== BoQ Variantenfaehiges Mapping (Schritt G/H): maschine_standardrahmen ===\n');

  await testVariant(
    'Hydraulik + frequenzgeregelt',
    { aufzugstyp: 'hydraulik', hydraulikRegelungsart: 'frequenzgeregelt' },
    'LV_14_01_TWR_HYDRAULIK_FREQUENZGEREGELT',
    'TWR – Hydraulik Frequenzgeregelt'
  );

  await testVariant(
    'Hydraulik + softstart',
    { aufzugstyp: 'hydraulik', hydraulikRegelungsart: 'softstart' },
    'LV_14_02_TWR_HYDRAULIK_MIT_SOFTSTART',
    'TWR – Hydraulik mit Softstart'
  );

  await testVariant('Hydraulik + konventionell (bewusst offen)', { aufzugstyp: 'hydraulik', hydraulikRegelungsart: 'konventionell' }, null, null);

  await testVariant('Hydraulik + leer/unbekannt (bewusst offen)', { aufzugstyp: 'hydraulik', hydraulikRegelungsart: '' }, null, null);

  await testVariant(
    'Seil, unabhaengig von antriebTyp (bewusst offen, keine eindeutige Zuordnung)',
    { aufzugstyp: 'seil', hydraulikRegelungsart: '', antriebTyp: 'seil-oben' },
    null,
    null
  );

  await testCrossContamination();

  console.log('\n=== Ergebnis ===');
  if (failures > 0) {
    console.error(`✗ FEHLGESCHLAGEN: ${failures} Pruefung(en) gebrochen.`);
    process.exitCode = 1;
  } else {
    console.log('✓ ERFOLGREICH: Variantenfaehiges Mapping fuer maschine_standardrahmen ist deterministisch und fachlich korrekt.');
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error('Unerwarteter Testfehler:', error);
  process.exitCode = 1;
});
