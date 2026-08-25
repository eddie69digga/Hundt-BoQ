'use strict';

/**
 * Kontrollierter Importprozess: Word-Bibliothek -> strukturierte LV-Bibliothek (Schritt C).
 *
 * Liest `docs/260824_LV_Bibliothek_Components_modular.docx` (ueber
 * `backend/lib/word-library-extractor.js`) und gleicht das Ergebnis gegen den bestehenden
 * `backend/lv/bibliothek.json`-Bestand ab.
 *
 * Verbindliche Regeln (siehe docs/lv-architecture.md Abschnitt 21):
 *   - Bestehende IDs werden NIEMALS still ueberschrieben. Weicht der frische Word-Extrakt von einem
 *     bereits vorhandenen Eintrag ab, wird das als Bericht (diff) gemeldet, nicht automatisch
 *     uebernommen - der bestehende, fachlich bereits geprueft Eintrag bleibt Wahrheit.
 *   - Neue IDs (noch nicht in der Bibliothek) werden mit status "entwurf" hinzugefuegt (fachlich
 *     noch ungeprueft), niemals mit "bestaetigt".
 *   - Es werden KEINE Mappingentscheidungen getroffen und KEINE Texte umformuliert.
 *   - Vor jedem Schreibvorgang laeuft die Validierung (`backend/lib/library-validation.js`); bei
 *     Fehlern wird NICHT geschrieben.
 *
 * Nutzung:
 *   node scripts/import-word-library.js            (Dry-Run: nur Bericht, keine Aenderung)
 *   node scripts/import-word-library.js --apply     (schreibt bibliothek.json, nur wenn 0 Fehler)
 */

const fs = require('fs');
const path = require('path');

const { extractLibraryEntriesFromDocxBuffer } = require('../lib/word-library-extractor.js');
const { validateLibrary } = require('../lib/library-validation.js');

const DOCX_PATH = path.join(__dirname, '..', '..', 'docs', '260824_LV_Bibliothek_Components_modular.docx');
const BIBLIOTHEK_PATH = path.join(__dirname, '..', 'lv', 'bibliothek.json');
const COMPARE_FIELDS = ['struktur', 'kapitel', 'kategorie', 'titel', 'typ', 'text'];

function loadExistingEntries() {
  try {
    const parsed = JSON.parse(fs.readFileSync(BIBLIOTHEK_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadStaticPackages() {
  const lvDir = path.join(__dirname, '..', 'lv');
  const readLv = (filename) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(lvDir, filename), 'utf8'));
    } catch {
      return null;
    }
  };
  return { steuerung: readLv('steuerung.json'), abnahme: readLv('abnahme.json') };
}

// Reine Funktion: berechnet aus dem bestehenden Bestand und dem frischen Word-Extrakt den
// vorgeschlagenen Import-Plan, ohne etwas zu schreiben. Damit ist der Merge-Vorgang selbst
// unabhaengig testbar (siehe backend/test/word-import.test.js).
function planImport(existingEntries, extractedEntries) {
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));
  const extractedById = new Map(extractedEntries.map((entry) => [entry.id, entry]));

  const newEntries = [];
  const diffs = [];

  for (const extracted of extractedEntries) {
    const existing = existingById.get(extracted.id);
    if (!existing) {
      newEntries.push({ ...extracted, status: 'entwurf' });
      continue;
    }

    const changedFields = COMPARE_FIELDS.filter((field) => existing[field] !== extracted[field]);
    if (changedFields.length > 0) {
      diffs.push({ id: extracted.id, changedFields });
    }
  }

  const notFoundInWord = existingEntries.filter((entry) => !extractedById.has(entry.id)).map((entry) => entry.id);

  // Bestehende Eintraege bleiben unveraendert (Reihenfolge + Inhalt); neue Eintraege werden nach
  // struktur sortiert angehaengt, damit die Datei lesbar bleibt.
  const mergedEntries = [
    ...existingEntries,
    ...[...newEntries].sort((a, b) => String(a.struktur).localeCompare(String(b.struktur), 'de', { numeric: true })),
  ];

  return { mergedEntries, newEntries, diffs, notFoundInWord };
}

async function main() {
  const apply = process.argv.includes('--apply');

  console.log('=== Word-Bibliothek-Import (Schritt C) ===\n');

  if (!fs.existsSync(DOCX_PATH)) {
    console.error(`✗ Word-Quelle nicht gefunden: ${DOCX_PATH}`);
    process.exitCode = 1;
    return;
  }

  const buffer = fs.readFileSync(DOCX_PATH);
  const extractedEntries = await extractLibraryEntriesFromDocxBuffer(buffer);
  const existingEntries = loadExistingEntries();

  const { mergedEntries, newEntries, diffs, notFoundInWord } = planImport(existingEntries, extractedEntries);

  console.log(`Word-Quelle: ${extractedEntries.length} Eintraege extrahiert.`);
  console.log(`Bestehende Bibliothek: ${existingEntries.length} Eintraege.`);
  console.log(`Neue Eintraege (status "entwurf"): ${newEntries.length}.`);
  console.log(`Bestehende Eintraege mit Abweichung zur Word-Quelle (NICHT automatisch uebernommen): ${diffs.length}.`);
  console.log(`Bestehende IDs ohne Fund in der aktuellen Word-Quelle: ${notFoundInWord.length}.`);
  console.log(`Ergebnis nach Merge: ${mergedEntries.length} Eintraege.\n`);

  if (diffs.length > 0) {
    console.log('--- Abweichungen (Bericht, keine automatische Aenderung) ---');
    for (const diff of diffs) {
      console.log(`  ⚠ ${diff.id}: Felder abweichend von Word-Quelle: ${diff.changedFields.join(', ')}`);
    }
    console.log('');
  }

  if (notFoundInWord.length > 0) {
    console.log('--- Bestehende IDs ohne Fund in der Word-Quelle (Bericht) ---');
    for (const id of notFoundInWord) {
      console.log(`  ⚠ ${id}`);
    }
    console.log('');
  }

  const staticPackages = loadStaticPackages();
  const { POSITION_MAPPING_RULES } = require('../server.js');
  const { errors, warnings } = validateLibrary({ entries: mergedEntries, rules: POSITION_MAPPING_RULES, staticPackages });

  if (warnings.length > 0) {
    console.log(`--- ${warnings.length} Validierungs-Bericht(e) fuer den Merge-Bestand ---`);
    for (const warning of warnings) {
      console.log(`  ⚠ ${warning}`);
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.error(`✗ ABGEBROCHEN: ${errors.length} Validierungsfehler im Merge-Bestand - kein Schreibvorgang.`);
    for (const error of errors) {
      console.error(`  ✗ ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('✓ Merge-Bestand ist validierungsfehlerfrei.');

  if (!apply) {
    console.log('\n(Dry-Run: keine Datei geschrieben. Mit --apply erneut aufrufen, um zu schreiben.)');
    return;
  }

  fs.writeFileSync(BIBLIOTHEK_PATH, JSON.stringify(mergedEntries, null, 2) + '\n', 'utf8');
  console.log(`\n✓ ${BIBLIOTHEK_PATH} geschrieben (${mergedEntries.length} Eintraege, davon ${newEntries.length} neu mit status "entwurf").`);
}

module.exports = { planImport, COMPARE_FIELDS };

if (require.main === module) {
  main().catch((error) => {
    console.error('Unerwarteter Fehler beim Import:', error);
    process.exitCode = 1;
  });
}
