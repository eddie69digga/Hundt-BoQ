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
  { id: 'antrittsblech', anzahl: 2 },
  { id: 'led_flaechenlicht_fahrkorb', anzahl: 1 },
  { id: 'lichtgitter_vorhandene_fahrkorbschiebetuer', anzahl: 1 },
  { id: 'korrekturwert_1', anzahl: 250, einheit: '€' },
  { id: 'hst_duebel_schachttueren', anzahl: 1 },
  { id: 'chemieduebel_schachttueren', anzahl: 1 },
  { id: 'auszugsversuch_mauerwerksschaechten', anzahl: 1 },
  { id: 'montageruestung', anzahl: 1 },
  { id: 'schiebetuer_2tlg', anzahl: 2 },
  { id: 'muz_standard', anzahl: 2 },
  { id: 'zargenbeleuchtung', anzahl: 2 },
  { id: 'demontage_schiebetuer_2tlg', anzahl: 1 },
  { id: 'Tragseile', anzahl: 1 },
  { id: 'seilaufhaengung', anzahl: 1 },
  { id: 'seilkauschen', anzahl: 1 },
  { id: 'ablenkrolle', anzahl: 2 },
  { id: 'adapterrahmen', anzahl: 1 },
  { id: 'fachlich_unbekannt', anzahl: 2 },
  { bezeichnung: 'Positive Position ohne ID', anzahl: 1 },
]));

assert(report.positionStatuses.length === 20, 'Jede positive Position muss genau einen Status erhalten.');
assert(report.positionStatuses.every((entry) =>
  ['mapped', 'open', 'not_lv_position', 'invalid'].includes(entry.status)
), 'Unbekannter Status im Positionsvertrag.');
assert(report.positionStatuses.filter((entry) => entry.componentsId === 'schachtbeleuchtung')[0].status === 'mapped',
  'Bekanntes Mapping muss mapped sein.');
for (const [componentsId, bibliotheksId] of [
  ['antrittsblech', 'LV_11_24_ANTRITTSBLECHE'],
  ['led_flaechenlicht_fahrkorb', 'LV_10_11_02_LED_FLACHENLICHT'],
  ['lichtgitter_vorhandene_fahrkorbschiebetuer', 'LV_10_30_LICHTVORHANG'],
  ['demontage_schiebetuer_2tlg', 'LV_05_01_DEMONTAGE_SCHIEBETUER_2TLG'],
  ['muz_standard', 'LV_11_27_MAUERUMFASSUNGSZARGEN_INDIVIDUELLES_AUFMASS'],
  ['zargenbeleuchtung', 'LV_11_28_ZARGENBELEUCHTUNG'],
  ['tragseile', 'LV_10_05_TRAGMITTEL_AUFHANGUNG'],
  ['seilaufhaengung', 'LV_10_05_TRAGMITTEL_AUFHANGUNG'],
  ['seilkauschen', 'LV_10_05_TRAGMITTEL_AUFHANGUNG'],
  ['ablenkrolle', 'LV_13_08_UMLENKROLLEN_IM_ANTRIEBSBEREICH'],
  ['adapterrahmen', 'LV_13_09_ADAPTERRAHMEN_ANTRIEB'],
]) {
  const entry = report.positionStatuses.find((candidate) => candidate.componentsId === componentsId);
  assert(entry?.status === 'mapped' && entry.bibliotheksId === bibliotheksId,
    `${componentsId} muss auf ${bibliotheksId} gemappt sein.`);
}
// Die drei Seil-Tragmittelpositionen teilen sich eine Ziel-ID und duerfen
// daher nur eine einzige LV-Position erzeugen (n:1 mit Deduplizierung).
assert(report.mapped.filter((entry) => entry.bibliotheksId === 'LV_10_05_TRAGMITTEL_AUFHANGUNG').length === 1,
  'tragseile/seilaufhaengung/seilkauschen muessen zu genau einer LV-Position dedupliziert werden.');
const adapterrahmen = require('../server.js').loadBibliothek()['LV_13_09_ADAPTERRAHMEN_ANTRIEB'];
assert(adapterrahmen?.titel === 'Adapterrahmen Antrieb',
  'Der Adapterrahmen-Baustein muss unter dem neutralen Titel vorhanden sein.');
assert(adapterrahmen?.text === 'Lieferung und Montage einer passenden Rahmenkonstruktion aus Stahlprofilen zur fachgerechten Anpassung des neuen Antriebs an die bestehende Situation, einschließlich Aufmaß, Auslegung, Fertigung, Lieferung und Montage.',
  'Der Adapterrahmen-Baustein muss den bestätigten Wortlaut exakt enthalten.');
assert(!/hersteller/i.test(`${adapterrahmen?.titel || ''} ${adapterrahmen?.text || ''}`),
  'Der Adapterrahmen-Baustein darf keine Herstellerangabe enthalten.');
const muzLibraryEntry = require('../server.js').loadBibliothek()['LV_11_27_MAUERUMFASSUNGSZARGEN_INDIVIDUELLES_AUFMASS'];
assert(muzLibraryEntry?.titel === 'Mauerumfassungszargen (individuelles Aufmaß)',
  'Der MUZ-Baustein muss unter dem konventionsgerechten Titel vorhanden sein.');
assert(muzLibraryEntry?.text.includes('individuelles Aufmaß an jedem Schachtzugang'),
  'Der MUZ-Baustein muss individuelles Aufmaß an jedem Schachtzugang enthalten.');
assert(!/hinterfüllen/i.test(muzLibraryEntry?.text || ''),
  'Der MUZ-Baustein darf keinen Leistungsbestandteil Hinterfüllen enthalten.');
const zargenbeleuchtung = require('../server.js').loadBibliothek()['LV_11_28_ZARGENBELEUCHTUNG'];
assert(zargenbeleuchtung?.titel === 'Zargenbeleuchtung',
  'Der Zargenbeleuchtungs-Baustein muss unter dem neutralen Titel vorhanden sein.');
assert(zargenbeleuchtung?.text === 'Integrierte LED-Beleuchtung beidseitig, ca. 25 cm über OKFF, einschließlich erforderlicher Anschlüsse und betriebsfertiger Montage.',
  'Der Zargenbeleuchtungs-Baustein muss den bestätigten Wortlaut exakt enthalten.');
assert(!/hersteller/i.test(`${zargenbeleuchtung?.titel || ''} ${zargenbeleuchtung?.text || ''}`),
  'Der Zargenbeleuchtungs-Baustein darf keine Herstellerangabe enthalten.');
assert(report.not_lv_position.some((entry) => entry.componentsId === 'korrekturwert_1'),
  'Korrekturwerte müssen not_lv_position sein.');
for (const componentsId of [
  'hst_duebel_schachttueren',
  'chemieduebel_schachttueren',
  'auszugsversuch_mauerwerksschaechten',
  'montageruestung',
  'schiebetuer_2tlg',
]) {
  assert(report.not_lv_position.some((entry) => entry.componentsId === componentsId),
    `${componentsId} muss not_lv_position sein.`);
}
assert(report.invalid.some((entry) => entry.status === 'invalid'),
  'Positive Position ohne ID muss invalid sein.');
assert(!report.open.some((entry) => (entry.componentsIds || []).includes('schiebetuer_2tlg')),
  'schiebetuer_2tlg ist ein kalkulatorischer Oberbegriff und darf nicht als offene LV-Position erscheinen.');
assert(report.open.some((entry) => entry.componentsIds.includes('fachlich_unbekannt')),
  'Unbekanntes, strukturell gültiges Mapping muss offen nachvollziehbar bleiben.');

console.log('✓ IO-Positionsvertrag: alle positiven Positionen erhalten genau einen nachvollziehbaren Status.');
