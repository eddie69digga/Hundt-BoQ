'use strict';

/**
 * Validierungs-Contract-Test (Schritt I).
 *
 * Prueft `backend/lv/bibliothek.json` und `POSITION_MAPPING_RULES` (aus `backend/server.js`)
 * gegen den Validierungsprozess in `backend/lib/library-validation.js`. Ein produktiver Bulk-Import
 * (Schritt C/D) darf laut Architekturauftrag erst erfolgen, wenn dieser Test zuverlaessig gruen ist.
 *
 * Aufruf: node test/library-validation.test.js (oder: npm test)
 */

const fs = require('fs');
const path = require('path');

const { POSITION_MAPPING_RULES, loadBibliothekEntries } = require('../server.js');
const { validateLibrary } = require('../lib/library-validation.js');

let selfTestFailures = 0;

function assertContains(list, needle, label) {
  const found = list.some((item) => item.includes(needle));
  if (!found) {
    selfTestFailures += 1;
    console.error(`✗ SELBSTTEST GEBROCHEN (${label}): erwartete Meldung mit "${needle}" nicht gefunden.`);
  }
}

function assertEmpty(list, label) {
  if (list.length > 0) {
    selfTestFailures += 1;
    console.error(`✗ SELBSTTEST GEBROCHEN (${label}): erwartete keine Treffer, erhalten: ${JSON.stringify(list)}`);
  }
}

// Beweist, dass der Validierungsprozess tatsaechlich Zaehne hat (siehe Architekturauftrag: "Kein
// Bulk-Import durchfuehren, solange diese Validierung nicht zuverlaessig funktioniert").
function runSelfTests() {
  console.log('=== Selbsttest: Validierungsprozess erkennt bewusst eingebaute Fehler ===\n');

  // 1. Doppelte Bibliotheks-ID
  const dupeResult = validateLibrary({
    entries: [
      { id: 'LV_X', struktur: '01.01', kapitel: '01', titel: 'A', typ: 'Baustein', text: 'Text A', status: 'bestaetigt' },
      { id: 'LV_X', struktur: '01.02', kapitel: '01', titel: 'B', typ: 'Baustein', text: 'Text B', status: 'bestaetigt' },
    ],
    rules: [],
  });
  assertContains(dupeResult.errors, 'Doppelte Bibliotheks-ID', 'doppelte ID');

  // 2. Fehlendes Pflichtfeld + ungueltiger Status/Typ
  const invalidFieldResult = validateLibrary({
    entries: [{ id: 'LV_Y', struktur: '01.01', kapitel: '01', typ: 'Erfunden', status: 'irgendwas' }],
    rules: [],
  });
  assertContains(invalidFieldResult.errors, 'Pflichtfeld "titel" fehlt', 'fehlendes Pflichtfeld');
  assertContains(invalidFieldResult.errors, 'ungueltiger typ', 'ungueltiger typ');
  assertContains(invalidFieldResult.errors, 'ungueltiger status', 'ungueltiger status');

  // 3. Mapping auf nicht existente Bibliotheks-ID (Waisen-Mapping, contentSource: bibliothek)
  const orphanBibliothekResult = validateLibrary({
    entries: [],
    rules: [
      {
        groupKey: 'test-orphan',
        componentsIds: ['irrelevant'],
        bibliotheksId: 'LV_NICHT_VORHANDEN',
        contentSource: 'bibliothek',
        status: 'mapped',
        technicalCondition: () => true,
      },
    ],
  });
  assertContains(orphanBibliothekResult.errors, 'Waisen-Mapping', 'Waisen-Mapping (bibliothek)');

  // 4. Mapping auf nicht existentes Modul in einem statischen Paket (Waisen-Mapping, contentSource: static)
  const orphanStaticResult = validateLibrary({
    entries: [],
    rules: [
      {
        groupKey: 'test-orphan-static',
        componentsIds: ['irrelevant'],
        bibliotheksId: 'LV_TEST',
        contentSource: 'static',
        staticEntryId: 'steuerung',
        staticModuleId: 'modul_gibt_es_nicht',
        status: 'mapped',
        technicalCondition: () => true,
      },
    ],
    staticPackages: { steuerung: { module: [{ id: 'anderes_modul', titel: 'X', text: 'Y' }] } },
  });
  assertContains(orphanStaticResult.errors, 'Waisen-Mapping', 'Waisen-Mapping (static)');

  // 5. Ungueltige Variantenbedingung (technicalCondition fehlt/keine Funktion)
  const invalidConditionResult = validateLibrary({
    entries: [],
    rules: [{ groupKey: 'test-condition', componentsIds: [], status: 'open', technicalCondition: 'kein-funktion' }],
  });
  assertContains(invalidConditionResult.errors, 'ungueltige Variantenbedingung', 'ungueltige technicalCondition');

  // 6. Ungenutzter Bibliothekseintrag => Bericht (warning), kein Fehler
  const unusedResult = validateLibrary({
    entries: [{ id: 'LV_UNUSED', struktur: '01.01', kapitel: '01', titel: 'Unbenutzt', typ: 'Baustein', text: 'Text', status: 'bestaetigt' }],
    rules: [],
  });
  assertEmpty(unusedResult.errors, 'ungenutzter Eintrag darf kein Fehler sein');
  assertContains(unusedResult.warnings, 'wird von keiner Mapping-Regel verwendet', 'ungenutzter Eintrag als Bericht');

  // 7. Auffaellig identischer Text in zwei Eintraegen => Bericht, kein Fehler
  const duplicateTextResult = validateLibrary({
    entries: [
      { id: 'LV_TEXT_A', struktur: '01.01', kapitel: '01', titel: 'A', typ: 'Baustein', text: 'Ein   identischer Text.', status: 'bestaetigt' },
      { id: 'LV_TEXT_B', struktur: '01.02', kapitel: '01', titel: 'B', typ: 'Baustein', text: 'Ein identischer Text.', status: 'bestaetigt' },
    ],
    rules: [],
  });
  assertEmpty(duplicateTextResult.errors, 'identischer Text darf kein Fehler sein');
  assertContains(duplicateTextResult.warnings, 'Auffaellig identischer Text', 'identischer Text als Bericht');

  // 8. Valider Fall bleibt fehlerfrei (kein falsch-positiver Treffer)
  const validResult = validateLibrary({
    entries: [{ id: 'LV_OK', struktur: '01.01', kapitel: '01', kategorie: 'LV_KAP_01', titel: 'OK', typ: 'Baustein', text: 'Text', status: 'bestaetigt' }],
    rules: [
      {
        groupKey: 'ok-rule',
        componentsIds: ['ok_key'],
        bibliotheksId: 'LV_OK',
        contentSource: 'bibliothek',
        status: 'mapped',
        technicalCondition: () => true,
      },
    ],
  });
  assertEmpty(validResult.errors, 'valider Fall darf keinen Fehler erzeugen');

  if (selfTestFailures > 0) {
    console.error(`\n✗ ${selfTestFailures} Selbsttest(s) gebrochen - der Validierungsprozess ist nicht zuverlaessig.\n`);
  } else {
    console.log('✓ Alle Selbsttests bestanden - der Validierungsprozess erkennt die geforderten Fehlerklassen zuverlaessig.\n');
  }
}

function requireLv(filename) {
  const lvPath = path.join(__dirname, '..', 'lv', filename);
  return JSON.parse(fs.readFileSync(lvPath, 'utf8'));
}

function main() {
  runSelfTests();

  console.log('=== BoQ Bibliotheks-/Mapping-Validierung (Schritt I) - realer Datenbestand ===\n');

  const entries = loadBibliothekEntries();
  const staticPackages = {
    steuerung: requireLv('steuerung.json'),
    abnahme: requireLv('abnahme.json'),
  };

  const { errors, warnings } = validateLibrary({
    entries,
    rules: POSITION_MAPPING_RULES,
    staticPackages,
  });

  console.log(`Geprueft: ${entries.length} Bibliothekseintraege, ${POSITION_MAPPING_RULES.length} Mapping-Regeln.\n`);

  if (warnings.length > 0) {
    console.log(`--- ${warnings.length} Bericht(e) (kein Fehler) ---`);
    for (const warning of warnings) {
      console.log(`  ⚠ ${warning}`);
    }
    console.log('');
  } else {
    console.log('Keine Berichte.\n');
  }

  if (errors.length > 0) {
    console.error(`✗ FEHLGESCHLAGEN: ${errors.length} Validierungsfehler gefunden:`);
    for (const error of errors) {
      console.error(`  ✗ ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  if (selfTestFailures > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('✓ ERFOLGREICH: Keine Validierungsfehler. Bibliothek und Mappingregeln sind strukturell konsistent.');
  process.exitCode = 0;
}

main();
