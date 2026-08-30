'use strict';

// Deckungs-Regressionstest: Jede Position, die Components in den Demo-Projekten
// real erzeugt, muss von BoQ einen nachvollziehbaren Status erhalten.
//
// Zweck: Fruehwarnung. Kommt in Components eine neue Kalkulationsposition hinzu
// oder aendert eine Position ihre ID, faellt das hier auf, statt unbemerkt als
// "offen" durchzulaufen und im Word-Export zu fehlen.
//
// Der Test trifft KEINE fachliche Entscheidung. Er verlangt kein Mapping, sondern
// nur, dass jede Position bewusst klassifiziert ist. Positionen ohne Mapping-Regel
// sind zulaessig, muessen aber in BEKANNT_OHNE_MAPPING stehen - also einmal
// gesehen und bewusst offen gelassen worden sein.
//
// Fixture: fixtures/components-positions-inventory.json, erzeugt aus den
// Demo-Projekten von Components (Feld "quelle" in der Fixture). Neu erzeugen,
// wenn sich die Kalkulation oder der Demo-Bestand aendert.

const { buildPositionMappingReport } = require('../server.js');
const inventory = require('./fixtures/components-positions-inventory.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Positionen, fuer die es bewusst (noch) keine Mapping-Regel gibt.
// Quelle: docs/components-boq-begriffsmatrix.md - die Zeile zu `tragseile`/
// `ablenkrolle` steht dort auf Status `offen` ("kein Bibliothekseintrag
// identifiziert"). Alle fuenf gehoeren zum Paket `antrieb` eines Seilaufzugs.
// Diese Liste ist eine Bestandsaufnahme, keine fachliche Freigabe. Sie soll
// schrumpfen, sobald ein bestaetigter Bibliothekstext vorliegt.
// Hinweis: BoQ normalisiert Positions-IDs auf Kleinschreibung
// (Components liefert z. B. "Tragseile", der Vertrag fuehrt "tragseile").
const BEKANNT_OHNE_MAPPING = Object.freeze([
  'ablenkrolle',
  'adapterrahmen',
  'seilaufhaengung',
  'seilkauschen',
  'tragseile',
]);

// Regeln wie `pvi-teilmodernisierung` und `transport-teilmodernisierung` sind
// bewusst an `projektart = Teilmodernisierung` gebunden. Bei anderen Projektarten
// (z. B. Budgetierung) bleiben die betroffenen Positionen regulaer offen - das ist
// gewolltes Verhalten und kein Deckungsfehler. Sie werden hier nur fuer
// Projektarten geprueft, fuer die eine Regel ueberhaupt greifen kann.
const PROJEKTARTGEBUNDEN = Object.freeze([
  'zues_kosten_vorpruefung',
  'zues_kosten_abnahme',
  'zues_begleitung_durch_an_aufzug',
  'pruefgewichte',
  'transport_allgemein_baustelle_lager',
]);

const ERLAUBTE_STATUS = ['mapped', 'open', 'not_lv_position', 'invalid'];

const projekte = inventory.projekte;
assert(Array.isArray(projekte) && projekte.length > 0,
  'Die Inventar-Fixture muss Demo-Projekte enthalten.');

const ohneRegelGesamt = new Set();
const projektartbedingtOffen = new Set();
const ungueltigGesamt = new Set();
const gemapptGesamt = new Set();
let statusAnzahlGesamt = 0;
let positionenGesamt = 0;

// Jedes Demo-Projekt einzeln pruefen: Der technische Kontext (Projektart,
// Antriebsdaten) steuert die Mapping-Regeln. Ein gemeinsamer Topf wuerde
// Positionen faelschlich in fremdem Kontext bewerten.
for (const projekt of projekte) {
  const positionen = projekt.positionen || [];
  if (positionen.length === 0) continue;

  positionenGesamt += positionen.length;

  const report = buildPositionMappingReport({
    data: {
      projekt: { projektart: projekt.technik?.projektart || '' },
      technischeParameter: projekt.technik || {},
      kalkulation: {
        paketSummen: [{ paket: 'inventar', positionen }],
      },
    },
  });

  assert(report.positionStatuses.length === positionen.length,
    `${projekt.datei}: Jede der ${positionen.length} Positionen muss genau einen Status `
    + `erhalten (erhalten: ${report.positionStatuses.length}).`);

  statusAnzahlGesamt += report.positionStatuses.length;

  for (const eintrag of report.positionStatuses) {
    assert(ERLAUBTE_STATUS.includes(eintrag.status),
      `${projekt.datei}: Unbekannter Status "${eintrag.status}" fuer ${eintrag.componentsId}.`);

    if (eintrag.status === 'invalid') ungueltigGesamt.add(eintrag.componentsId);
    if (eintrag.status === 'mapped') gemapptGesamt.add(eintrag.componentsId);
    if (eintrag.status === 'open' && eintrag.reason === 'Keine Mapping-Regel vorhanden') {
      // Projektartgebundene Positionen bleiben ausserhalb ihrer Projektart
      // regulaer offen. Nur innerhalb der Teilmodernisierung ist ihr Fehlen
      // ein echter Deckungsbefund.
      const projektart = String(projekt.technik?.projektart || '').toLowerCase();
      if (PROJEKTARTGEBUNDEN.includes(eintrag.componentsId) && projektart !== 'teilmodernisierung') {
        projektartbedingtOffen.add(eintrag.componentsId);
      } else {
        ohneRegelGesamt.add(eintrag.componentsId);
      }
    }
  }
}

// Real erzeugte Positionen duerfen nicht strukturell ungueltig sein. Waeren sie es,
// wuerde BoQ sie verwerfen, obwohl Components sie mit positiver Menge liefert.
assert(ungueltigGesamt.size === 0,
  'Real erzeugte Components-Positionen duerfen nicht als invalid gelten: '
  + [...ungueltigGesamt].join(', '));

// Kernaussage: keine Position ohne Regel und ohne dokumentierte Entscheidung.
const unerwartet = [...ohneRegelGesamt].filter((id) => !BEKANNT_OHNE_MAPPING.includes(id)).sort();
assert(unerwartet.length === 0,
  'Components-Position ohne Mapping-Regel und ohne dokumentierte Entscheidung: '
  + `${unerwartet.join(', ')}. Entweder eine Regel in POSITION_MAPPING_RULES ergaenzen `
  + 'oder die Position bewusst in BEKANNT_OHNE_MAPPING aufnehmen und in '
  + 'docs/components-boq-begriffsmatrix.md als offen dokumentieren.');

// Gegenrichtung: Die Bestandsliste darf nicht veralten. Bekommt eine der bekannten
// Luecken eine Regel, muss sie hier verschwinden - sonst schuetzt die Liste
// dauerhaft eine Position, die es nicht mehr betrifft.
const veraltet = BEKANNT_OHNE_MAPPING.filter((id) => !ohneRegelGesamt.has(id));
assert(veraltet.length === 0,
  'BEKANNT_OHNE_MAPPING ist veraltet - diese Positionen haben inzwischen eine Regel, '
  + `werden nicht mehr erzeugt oder heissen anders: ${veraltet.join(', ')}.`);

assert(statusAnzahlGesamt === positionenGesamt,
  `Positionsvertrag verletzt: ${positionenGesamt} Positionen, aber ${statusAnzahlGesamt} Status.`);

// Gegenprobe zur Ausnahmeliste: Jede projektartgebundene Position muss in
// mindestens einem Teilmodernisierungs-Projekt tatsaechlich gemappt werden.
// Sonst wuerde PROJEKTARTGEBUNDEN eine echte Luecke dauerhaft verdecken.
const nieGemappt = PROJEKTARTGEBUNDEN.filter((id) => !gemapptGesamt.has(id));
assert(nieGemappt.length === 0,
  'Projektartgebundene Positionen werden in keinem Projekt gemappt - die Ausnahme '
  + `verdeckt damit eine echte Luecke: ${nieGemappt.join(', ')}.`);

console.log(`✓ Positionsdeckung: ${inventory.verschiedenePositionen} verschiedene Positionen aus `
  + `${projekte.length} Demo-Projekten (${positionenGesamt} Vorkommen), `
  + `${gemapptGesamt.size} gemappt, ${ohneRegelGesamt.size} dokumentiert offen, `
  + `${projektartbedingtOffen.size} projektartbedingt offen, keine unbemerkte Luecke.`);
