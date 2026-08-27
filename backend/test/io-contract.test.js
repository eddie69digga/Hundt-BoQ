'use strict';

const { buildPositionMappingReport } = require('../server.js');

function query(positionen, technicalParameter = {}) {
  return {
    data: {
      technischeParameter: technicalParameter,
      kalkulation: { paketSummen: [{ paket: 'test', positionen }] },
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const report = buildPositionMappingReport(query([
  { id: 'schachtbeleuchtung', anzahl: 1 },
  { id: 'korrekturwert_1', anzahl: 250, einheit: '€' },
  { id: 'fachlich_unbekannt', anzahl: 2 },
  { bezeichnung: 'Positive Position ohne ID', anzahl: 1 },
]));

assert(report.positionStatuses.length === 4, 'Jede positive Position muss genau einen Status erhalten.');
assert(report.positionStatuses.every((entry) =>
  ['mapped', 'open', 'not_lv_position', 'invalid'].includes(entry.status)
), 'Unbekannter Status im Positionsvertrag.');
assert(report.positionStatuses.filter((entry) => entry.componentsId === 'schachtbeleuchtung')[0].status === 'mapped',
  'Bekanntes Mapping muss mapped sein.');
assert(report.not_lv_position.some((entry) => entry.componentsId === 'korrekturwert_1'),
  'Korrekturwerte müssen not_lv_position sein.');
assert(report.invalid.some((entry) => entry.status === 'invalid'),
  'Positive Position ohne ID muss invalid sein.');
assert(report.open.some((entry) => entry.componentsIds.includes('fachlich_unbekannt')),
  'Unbekanntes, strukturell gültiges Mapping muss offen nachvollziehbar bleiben.');

console.log('✓ IO-Positionsvertrag: alle positiven Positionen erhalten genau einen nachvollziehbaren Status.');
