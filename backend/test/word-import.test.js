'use strict';

/**
 * Word-Import-Contract-Test (Schritt C).
 *
 * Prueft den Extraktor (`backend/lib/word-library-extractor.js`) und die reine Merge-Logik
 * (`planImport()` aus `backend/scripts/import-word-library.js`) gegen die reale Word-Quelle,
 * OHNE etwas zu schreiben (reiner Dry-Run-Test). Sichert genau die im Architekturauftrag
 * geforderten Garantien ab:
 *   - der Import trifft keine Mappingentscheidungen
 *   - bestehende IDs werden nie still geaendert
 *   - Dubletten werden nicht stillschweigend ueberschrieben
 *   - der resultierende Merge-Bestand ist validierungsfehlerfrei (Voraussetzung fuer Schritt D)
 *
 * Aufruf: node test/word-import.test.js (oder: npm test)
 */

const fs = require('fs');
const path = require('path');

const { extractLibraryEntriesFromDocxBuffer } = require('../lib/word-library-extractor.js');
const { validateLibrary } = require('../lib/library-validation.js');
const { planImport } = require('../scripts/import-word-library.js');
const { POSITION_MAPPING_RULES, loadBibliothekEntries } = require('../server.js');

const DOCX_PATH = path.join(__dirname, '..', '..', 'docs', '260824_LV_Bibliothek_Components_modular.docx');

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

async function main() {
  console.log('=== BoQ Word-Import-Contract-Test (Schritt C) ===\n');

  if (!fs.existsSync(DOCX_PATH)) {
    reportFailure('Word-Quelle', `Datei nicht gefunden: ${DOCX_PATH}`);
    printSummaryAndExit();
    return;
  }

  const buffer = fs.readFileSync(DOCX_PATH);
  const extractedEntries = await extractLibraryEntriesFromDocxBuffer(buffer);
  const existingEntries = loadBibliothekEntries();

  // --- Extraktor: strukturelle Grundgarantien ---
  if (extractedEntries.length < 300) {
    reportFailure('Extraktion', `Erwartet mindestens 300 Eintraege aus der Word-Quelle, erhalten: ${extractedEntries.length}.`);
  } else {
    reportOk('Extraktion', `${extractedEntries.length} Eintraege aus der Word-Quelle extrahiert.`);
  }

  const idCounts = new Map();
  for (const entry of extractedEntries) {
    idCounts.set(entry.id, (idCounts.get(entry.id) || 0) + 1);
  }
  const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateIds.length > 0) {
    reportFailure('Extraktion', `Doppelte IDs im Extrakt gefunden: ${duplicateIds.map(([id]) => id).join(', ')}`);
  } else {
    reportOk('Extraktion', 'Keine doppelten IDs im Extrakt.');
  }

  const missingCoreFields = extractedEntries.filter((e) => !e.id || !e.struktur || !e.typ || !e.titel);
  if (missingCoreFields.length > 0) {
    reportFailure('Extraktion', `${missingCoreFields.length} Eintraege ohne id/struktur/typ/titel gefunden.`);
  } else {
    reportOk('Extraktion', 'Jeder Eintrag hat id, struktur, typ und titel.');
  }

  // --- Merge-Logik: bestehende Eintraege werden NIE still veraendert ---
  const { mergedEntries, newEntries, diffs } = planImport(existingEntries, extractedEntries);

  const existingIdsInMerge = new Set(existingEntries.map((e) => e.id));
  const mergedById = new Map(mergedEntries.map((e) => [e.id, e]));
  let anyExistingChanged = false;
  for (const existing of existingEntries) {
    const inMerge = mergedById.get(existing.id);
    if (!inMerge || JSON.stringify(inMerge) !== JSON.stringify(existing)) {
      anyExistingChanged = true;
      reportFailure('Merge-Logik', `Bestehender Eintrag "${existing.id}" wurde im Merge-Ergebnis veraendert - das ist verboten (bestehende IDs duerfen nie still geaendert werden).`);
    }
  }
  if (!anyExistingChanged) {
    reportOk('Merge-Logik', `Alle ${existingEntries.length} bestehenden Eintraege bleiben im Merge-Ergebnis unveraendert (byte-identisch).`);
  }

  const newEntriesHaveEntwurfStatus = newEntries.every((e) => e.status === 'entwurf');
  if (!newEntriesHaveEntwurfStatus) {
    reportFailure('Merge-Logik', 'Nicht alle neuen Eintraege haben status "entwurf" (neue Eintraege duerfen nie als "bestaetigt" importiert werden).');
  } else {
    reportOk('Merge-Logik', `Alle ${newEntries.length} neuen Eintraege erhalten status "entwurf" (fachlich ungeprueft).`);
  }

  const newEntriesOverlapExisting = newEntries.some((e) => existingIdsInMerge.has(e.id));
  if (newEntriesOverlapExisting) {
    reportFailure('Merge-Logik', 'Mindestens ein "neuer" Eintrag hat dieselbe ID wie ein bestehender Eintrag (Dublette wuerde stillschweigend ueberschrieben).');
  } else {
    reportOk('Merge-Logik', 'Keine neue ID kollidiert mit einer bestehenden ID (keine stillschweigende Dublettenueberschreibung).');
  }

  if (mergedEntries.length !== existingEntries.length + newEntries.length) {
    reportFailure('Merge-Logik', `Merge-Ergebnis hat ${mergedEntries.length} Eintraege, erwartet ${existingEntries.length + newEntries.length} (bestehend + neu).`);
  } else {
    reportOk('Merge-Logik', `Merge-Ergebnis hat korrekt ${mergedEntries.length} Eintraege (${existingEntries.length} bestehend + ${newEntries.length} neu).`);
  }

  console.log(`\nInfo: ${diffs.length} bestehende Eintraege weichen von der aktuellen Word-Quelle ab (nur Bericht, keine automatische Aenderung): ${diffs.map((d) => d.id).join(', ') || '-'}`);

  // --- Validierung des Merge-Bestands: Voraussetzung fuer Schritt D (Vollimport) ---
  const staticPackages = { steuerung: requireLv('steuerung.json'), abnahme: requireLv('abnahme.json') };
  const { errors, warnings } = validateLibrary({ entries: mergedEntries, rules: POSITION_MAPPING_RULES, staticPackages });

  if (errors.length > 0) {
    reportFailure('Validierung', `Merge-Bestand hat ${errors.length} Validierungsfehler - Schritt D (Vollimport) darf NICHT durchgefuehrt werden:\n   - ${errors.join('\n   - ')}`);
  } else {
    reportOk('Validierung', `Merge-Bestand (${mergedEntries.length} Eintraege) ist validierungsfehlerfrei (${warnings.length} Berichte, siehe library-validation.test.js fuer Details) - Voraussetzung fuer Schritt D erfuellt.`);
  }

  printSummaryAndExit();
}

function printSummaryAndExit() {
  console.log('\n=== Ergebnis ===');
  if (failures > 0) {
    console.error(`✗ FEHLGESCHLAGEN: ${failures} Pruefung(en) gebrochen.`);
    process.exitCode = 1;
  } else {
    console.log('✓ ERFOLGREICH: Word-Import ist korrekt, verlustfrei fuer bestehende Eintraege und validierungsbereit fuer Schritt D.');
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error('Unerwarteter Testfehler:', error);
  process.exitCode = 1;
});
