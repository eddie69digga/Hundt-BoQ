'use strict';

// Erzeugt die Fixture fuer backend/test/position-coverage.test.js.
//
// Die Fixture haelt fest, welche Kalkulationspositionen Components in seinen
// Demo-Projekten real erzeugt. Der Deckungstest prueft daraufhin, dass jede
// dieser Positionen von BoQ einen nachvollziehbaren Status erhaelt.
//
// Aufruf (Components-Repo muss als Schwesterverzeichnis vorliegen):
//   node backend/test/fixtures/generate-components-positions-inventory.js
//
// Bewusst kein Laufzeit-Import von Components im Test selbst: BoQ soll nicht
// zur Testzeit von einem fremden Repository abhaengen. Die Fixture ist der
// eingefrorene, versionierte Stand.

const fs = require('fs');
const path = require('path');

const COMPONENTS_ROOT = path.resolve(__dirname, '../../../../01_Components_reload');
const ZIEL = path.join(__dirname, 'components-positions-inventory.json');

if (!fs.existsSync(COMPONENTS_ROOT)) {
  console.error(`Components-Repo nicht gefunden: ${COMPONENTS_ROOT}`);
  process.exit(1);
}

const engine = require(path.join(COMPONENTS_ROOT, 'backend/calculation-engine.js'));
const { normalizeProjectInput, buildCalcPayload } =
  require(path.join(COMPONENTS_ROOT, 'shared/calc-payload-normalization.js'));

// Gleiche Ableitung wie normalisiereAufzugstypWert/ermittleAufzugstypAusImport
// in Components (frontend/index.html). Der reale XL-Export liefert aufzugstyp
// und antriebTyp ausformuliert; die Demo-JSONs kodieren sie nur ueber
// anlage.antriebsart, deshalb wird hier dieselbe Ableitung nachgebildet.
function normalisiereAufzugstyp(wert) {
  const norm = String(wert || '').trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ');
  if (norm.includes('hydraul')) return 'hydraulik';
  if (norm.includes('seil') || norm.includes('traction')) return 'seil';
  return '';
}

const demoDir = path.join(COMPONENTS_ROOT, 'frontend/demo-json');
const dateien = fs.readdirSync(demoDir)
  .filter((name) => name.endsWith('.json') && !name.includes('manifest'))
  .sort();

const projekte = [];
const allePositionen = new Set();

const originalLog = console.log;
try {
  console.log = () => {};
  for (const datei of dateien) {
    const rohdaten = JSON.parse(fs.readFileSync(path.join(demoDir, datei), 'utf8'));
    const normalisiert = normalizeProjectInput(rohdaten);
    const payload = buildCalcPayload(normalisiert.elevators[0], rohdaten, normalisiert.bundleMap);
    const ergebnis = engine.calculateSingleElevatorProject({
      ...payload,
      aktivePakete: ['antrieb', 'steuerung', 'messungen', 'fahrschacht', 'fahrkorb'],
      aktiveBundles: ['drive'],
    });

    const anlage = rohdaten.anlage || rohdaten.elevators?.[0]?.anlage || {};
    const aufzugstyp = normalisiereAufzugstyp(anlage.antriebsart)
      || normalisiereAufzugstyp(anlage.anlagenart);
    const antriebsart = String(anlage.antriebsart || '').toLowerCase();

    let antriebTyp = '';
    if (aufzugstyp === 'hydraulik') {
      if (antriebsart.includes('indirekt')) antriebTyp = 'hydraulik-indirekt';
      else if (antriebsart.includes('direkt')) antriebTyp = 'hydraulik-direkt';
      else antriebTyp = 'hydraulik';
    } else if (aufzugstyp === 'seil') {
      antriebTyp = 'seil-oben';
    }

    const technik = { aufzugstyp, antriebTyp, projektart: rohdaten.projekt?.projektart || '' };
    for (const [schluessel, wert] of Object.entries(rohdaten.technischeDaten || {})) {
      if (wert !== null && wert !== undefined) technik[schluessel] = wert;
    }

    const positionen = [];
    for (const paket of (ergebnis.ergebnisse || [])) {
      for (const position of (paket.positionen || [])) {
        if (!position?.name || Number(position.anzahl || 0) <= 0) continue;
        positionen.push({
          paket: paket.paket,
          id: position.name,
          bezeichnung: position.bezeichnung || '',
          einheit: position.einheit || 'Stk',
          anzahl: Number(position.anzahl),
        });
        allePositionen.add(position.name);
      }
    }

    projekte.push({ datei, technik, positionen });
  }
} finally {
  console.log = originalLog;
}

const inhalt = {
  quelle: '01_Components_reload/frontend/demo-json',
  erzeugtDurch: 'backend/test/fixtures/generate-components-positions-inventory.js',
  erzeugt: new Date().toISOString().slice(0, 10),
  hinweis: 'aufzugstyp/antriebTyp werden aus anlage.antriebsart abgeleitet. '
    + 'Projekte ohne Antriebsangabe behalten leere Werte - das ist der reale Zustand.',
  demoDateien: dateien.length,
  verschiedenePositionen: allePositionen.size,
  projekte,
};

fs.writeFileSync(ZIEL, `${JSON.stringify(inhalt, null, 2)}\n`);
console.log(`Fixture geschrieben: ${projekte.length} Projekte, `
  + `${allePositionen.size} verschiedene Positionen.`);
