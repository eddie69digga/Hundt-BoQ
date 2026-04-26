const fs = require('node:fs');
const path = require('node:path');

const X83_NAMESPACE = 'http://www.gaeb.de/GAEB_DA_XML/DA83/3.3';

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sanitizeFilenamePart(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replaceAll(/[\\/:*?"<>|]/g, '')
    .replaceAll(/\s+/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_|_$/g, '');

  return cleaned || fallback;
}

function formatDateIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForFilename(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatTimeForFilename(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}${minutes}${seconds}`;
}

function buildInlineTextElements(text, indent) {
  const normalizedText = String(text || '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const parts = normalizedText.split('\n');

  if (!parts.length) {
    return `${indent}<span></span>`;
  }

  const lines = [];
  parts.forEach((part, index) => {
    lines.push(`${indent}<span>${escapeXml(part)}</span>`);
    if (index < parts.length - 1) {
      lines.push(`${indent}<br/>`);
    }
  });

  return lines.join('\n');
}

function buildMlText(tagName, text, indent) {
  return [
    `${indent}<${tagName}>`,
    buildInlineTextElements(text, `${indent}  `),
    `${indent}</${tagName}>`,
  ].join('\n');
}

function buildOutlTxt(text, indent) {
  return [
    `${indent}<OutlTxt>`,
    `${indent}  <TextOutlTxt>`,
    buildInlineTextElements(text, `${indent}    `),
    `${indent}  </TextOutlTxt>`,
    `${indent}</OutlTxt>`,
  ].join('\n');
}

function buildDetailTxt(text, indent) {
  return [
    `${indent}<DetailTxt>`,
    `${indent}  <Text>`,
    buildInlineTextElements(text, `${indent}    `),
    `${indent}  </Text>`,
    `${indent}</DetailTxt>`,
  ].join('\n');
}

function buildBoQBreakdown() {
  return [
    '        <BoQBkdn>',
    '          <Type>BoQLevel</Type>',
    '          <LblBoQBkdn>Titel</LblBoQBkdn>',
    '          <Length>2</Length>',
    '          <Num>Yes</Num>',
    '        </BoQBkdn>',
    '        <BoQBkdn>',
    '          <Type>Item</Type>',
    '          <LblBoQBkdn>Position</LblBoQBkdn>',
    '          <Length>2</Length>',
    '          <Num>Yes</Num>',
    '        </BoQBkdn>',
    '        <BoQBkdn>',
    '          <Type>Index</Type>',
    '          <LblBoQBkdn>Index</LblBoQBkdn>',
    '          <Length>2</Length>',
    '          <Num>Yes</Num>',
    '        </BoQBkdn>',
  ].join('\n');
}

function buildTitleId(titleNo) {
  return `CTG_${String(titleNo || '').replaceAll(/[^A-Za-z0-9_-]/g, '_')}`;
}

function buildItemId(item) {
  return `ITEM_${String(item?.ozPart1 || '').replaceAll(/[^A-Za-z0-9_-]/g, '_')}_${String(item?.ozPart2 || '').replaceAll(/[^A-Za-z0-9_-]/g, '_')}`;
}

function normalizeRNoIndex(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  const numericValue = Number(rawValue);
  if (Number.isInteger(numericValue) && numericValue >= 0 && numericValue <= 9) {
    return String(numericValue);
  }

  return rawValue.at(-1) || '';
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    const notFoundError = new Error(`${label} fehlt: ${filePath}`);
    notFoundError.statusCode = 404;
    throw notFoundError;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const parseError = new Error(`${label} konnte nicht gelesen werden: ${error.message}`);
    parseError.statusCode = 500;
    throw parseError;
  }
}

function validateLvData(lv, label) {
  if (!lv || typeof lv !== 'object' || Array.isArray(lv)) {
    const error = new Error(`${label} hat keine gueltige Struktur.`);
    error.statusCode = 422;
    throw error;
  }

  if (!Array.isArray(lv.module)) {
    const error = new Error(`${label} enthaelt kein gueltiges Modul-Array.`);
    error.statusCode = 422;
    throw error;
  }
}

function buildLangtextFromLv(lv) {
  const parts = [];

  if (typeof lv.fliesstext === 'string' && lv.fliesstext.trim()) {
    parts.push(lv.fliesstext.trim());
  }

  for (const modul of lv.module) {
    if (!modul || typeof modul !== 'object') {
      continue;
    }

    const moduleText = typeof modul.text === 'string' ? modul.text.trim() : '';
    if (!moduleText) {
      continue;
    }

    const moduleTitle = typeof modul.titel === 'string' ? modul.titel.trim() : '';
    if (moduleTitle) {
      parts.push(`${moduleTitle}\n${moduleText}`);
    } else {
      parts.push(moduleText);
    }
  }

  return parts.join('\n\n').trim();
}

function validateProjectData(projectData) {
  if (!projectData || typeof projectData !== 'object' || Array.isArray(projectData)) {
    const error = new Error('Projektdaten fehlen oder sind ungueltig.');
    error.statusCode = 422;
    throw error;
  }

  const projekt = projectData.projekt;
  if (!projekt || typeof projekt !== 'object' || Array.isArray(projekt)) {
    const error = new Error('Projektdaten fehlen: projekt-Objekt ist erforderlich.');
    error.statusCode = 422;
    throw error;
  }
}

function firstNonEmptyString(values, fallback = '') {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return fallback;
}

function toTitleCaseLabel(value, fallback) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizePackageKey(value) {
  const key = String(value || '').trim().toLowerCase();

  if (!key) {
    return 'sonstiges';
  }

  if (key === 'messungen' || key === 'abnahme' || key === 'zues' || key === 'züs') {
    return 'abnahme';
  }

  return key;
}

function packageLabelFromKey(key, fallbackLabel = '') {
  const normalizedKey = normalizePackageKey(key || fallbackLabel);

  if (normalizedKey === 'steuerung') return 'Steuerung';
  if (normalizedKey === 'abnahme') return 'Abnahme';
  if (normalizedKey === 'antrieb') return 'Antrieb';

  return toTitleCaseLabel(fallbackLabel || normalizedKey, 'Sonstiges');
}

function normalizeQuantity(value) {
  const numberValue = Number(value);
  if (Number.isFinite(numberValue) && numberValue > 0) {
    return String(numberValue);
  }

  return '1';
}

function buildPositionLangtext(position) {
  const directText = firstNonEmptyString([
    position?.langtext,
    position?.langText,
    position?.text,
    position?.beschreibung,
    position?.bemerkung,
  ]);

  if (directText) {
    return directText;
  }

  const parts = [];
  const bezeichnung = firstNonEmptyString([position?.bezeichnung, position?.id], 'Position');
  parts.push(bezeichnung);

  const lvTextKey = firstNonEmptyString([position?.lvTextKey]);
  if (lvTextKey) {
    parts.push(`LV-Key: ${lvTextKey}`);
  }

  return parts.join('\n');
}

function normalizeLvPosition(position, packageFallback = 'Sonstiges') {
  return {
    paket: firstNonEmptyString([position?.paket, packageFallback], 'Sonstiges'),
    id: firstNonEmptyString([position?.id, position?.key, position?.lvTextKey, position?.roh?.name], ''),
    bezeichnung: firstNonEmptyString([
      position?.bezeichnung,
      position?.roh?.bezeichnung,
      position?.key,
      position?.id,
      position?.lvTextKey,
    ], 'Position'),
    menge: normalizeQuantity(position?.anzahl ?? position?.menge ?? position?.qty ?? position?.roh?.anzahl),
    einheit: firstNonEmptyString([position?.einheit, position?.qu, position?.roh?.einheit], 'Stk'),
    langtext: buildPositionLangtext(position),
    lvTextKey: firstNonEmptyString([position?.lvTextKey, position?.key], ''),
  };
}

function buildFallbackPositionsByPackage(projectData) {
  const fallbackGroups = new Map();
  const paketSummen = Array.isArray(projectData?.kalkulation?.paketSummen)
    ? projectData.kalkulation.paketSummen
    : [];

  for (const paketEintrag of paketSummen) {
    const packageKey = normalizePackageKey(paketEintrag?.paket);
    const positionen = Array.isArray(paketEintrag?.positionen) ? paketEintrag.positionen : [];
    if (!positionen.length) {
      continue;
    }

    fallbackGroups.set(
      packageKey,
      positionen.map((position) => normalizeLvPosition(position, paketEintrag?.paket))
    );
  }

  return fallbackGroups;
}

function buildPositionGroups(projectData) {
  const lvPositionen = Array.isArray(projectData?.kalkulation?.lvPositionen)
    ? projectData.kalkulation.lvPositionen
    : [];
  const groupedByPackage = new Map();

  for (const rawPosition of lvPositionen) {
    const normalizedPosition = normalizeLvPosition(rawPosition);
    const packageKey = normalizePackageKey(normalizedPosition.paket);
    if (!groupedByPackage.has(packageKey)) {
      groupedByPackage.set(packageKey, {
        key: packageKey,
        label: packageLabelFromKey(packageKey, normalizedPosition.paket),
        positions: [],
      });
    }

    groupedByPackage.get(packageKey).positions.push(normalizedPosition);
  }

  const activePackages = Array.isArray(projectData?.pakete?.aktiv) ? projectData.pakete.aktiv : [];
  const expectedOrder = [];
  for (const activePackage of activePackages) {
    const packageKey = normalizePackageKey(activePackage);
    if (packageKey && !expectedOrder.includes(packageKey)) {
      expectedOrder.push(packageKey);
    }
  }

  const fallbackGroups = buildFallbackPositionsByPackage(projectData);
  for (const packageKey of expectedOrder) {
    if (!groupedByPackage.has(packageKey) && fallbackGroups.has(packageKey)) {
      groupedByPackage.set(packageKey, {
        key: packageKey,
        label: packageLabelFromKey(packageKey),
        positions: fallbackGroups.get(packageKey),
      });
    }
  }

  const remainingKeys = Array.from(groupedByPackage.keys()).filter((key) => !expectedOrder.includes(key));
  const orderedKeys = [...expectedOrder.filter((key) => groupedByPackage.has(key)), ...remainingKeys];

  return orderedKeys.map((key) => groupedByPackage.get(key));
}

function buildTitlesFromBoQ(projectData) {
  const groups = buildPositionGroups(projectData);
  if (!groups.length) {
    return [];
  }

  return groups.map((group, titleIndex) => {
      const titleNo = String(titleIndex + 1).padStart(2, '0');

      const items = group.positions.map((position, itemIndex) => {
        const itemNo = String(itemIndex + 1).padStart(2, '0');
        const kurztext = firstNonEmptyString([position.bezeichnung, position.id, position.lvTextKey], `Position ${itemNo}`);

        return {
          oz: `${titleNo}.${itemNo}`,
          ozPart1: titleNo,
          ozPart2: itemNo,
          kurztext,
          langtext: firstNonEmptyString([position.langtext], kurztext),
          menge: position.menge,
          einheit: position.einheit,
        };
      });

      return {
        titleNo,
        titleName: group.label,
        items,
      };
    });
}

function buildLvMeta(projectData) {
  const projekt = projectData.projekt || {};
  const projektId = firstNonEmptyString([
    projekt.id,
    projekt.projektId,
    projekt.projektnummer,
  ]);
  const projektName = firstNonEmptyString([
    projekt.name,
    projekt.projektname,
    projekt.bauvorhaben,
  ]);

  if (!projektId || !projektName) {
    const error = new Error('Projektdaten unvollstaendig: projekt.id und projekt.name sind erforderlich.');
    error.statusCode = 422;
    throw error;
  }

  const bauvorhabenLabel = `${projektId} - ${projektName}`;

  return {
    projektId,
    projektName,
    bauvorhaben: firstNonEmptyString([bauvorhabenLabel, projekt.bauvorhaben, projektName], projektName),
    lvNummer: '01',
    lvBezeichnung: firstNonEmptyString([
      projectData?.anlage?.bezeichnung,
      projekt?.anlagenbezeichnung,
      'Aufzugsanlagen',
    ]),
    waehrung: 'EUR',
    datum: formatDateIso(),
    phase: 'X83',
  };
}

function buildX83Model(projectData, options = {}) {
  validateProjectData(projectData);

  const titlesFromBoQ = buildTitlesFromBoQ(projectData);
  if (titlesFromBoQ.length > 0) {
    return {
      lvMeta: buildLvMeta(projectData),
      additionalTexts: [],
      hierarchy: {
        titles: titlesFromBoQ,
      },
    };
  }

  // Wenn ein BoQ-Kalkulationskontext vorhanden ist, darf X83 nicht auf statische Test-/Legacy-Daten fallen.
  if (projectData?.kalkulation) {
    const error = new Error('Keine LV-Positionen im aktuellen BoQ-Datenstand vorhanden.');
    error.statusCode = 422;
    throw error;
  }

  const baseDir = options.baseDir || process.cwd();
  const steuerungPath = path.join(baseDir, 'lv', 'steuerung.json');
  const abnahmePath = path.join(baseDir, 'lv', 'abnahme.json');

  const steuerungLv = readJsonFile(steuerungPath, 'steuerung.json');
  const abnahmeLv = readJsonFile(abnahmePath, 'abnahme.json');

  validateLvData(steuerungLv, 'steuerung.json');
  validateLvData(abnahmeLv, 'abnahme.json');

  const steuerungLangtext = buildLangtextFromLv(steuerungLv);
  const abnahmeLangtext = buildLangtextFromLv(abnahmeLv);

  if (!steuerungLangtext) {
    const error = new Error('Langtext fuer Position 01.01 (Steuerung) ist leer.');
    error.statusCode = 422;
    throw error;
  }

  if (!abnahmeLangtext) {
    const error = new Error('Langtext fuer Position 01.02 (Abnahme / Dokumentation / Einweisung) ist leer.');
    error.statusCode = 422;
    throw error;
  }

  return {
    lvMeta: buildLvMeta(projectData),
    additionalTexts: [],
    hierarchy: {
      titles: [
        {
          titleNo: '01',
          titleName: 'Modernisierung Aufzug',
          items: [
            {
              oz: '01.01',
              ozPart1: '01',
              ozPart2: '01',
              kurztext: 'Steuerung',
              langtext: steuerungLangtext,
              menge: 1,
              einheit: 'Stk',
            },
            {
              oz: '01.02',
              ozPart1: '01',
              ozPart2: '02',
              kurztext: 'Abnahme / Dokumentation / Einweisung',
              langtext: abnahmeLangtext,
              menge: 1,
              einheit: 'Stk',
            },
          ],
        },
      ],
    },
  };
}

function buildX83Meta(lvMeta) {
  const lines = [
    '      <BoQInfo>',
    `        <Name>${escapeXml(lvMeta.lvBezeichnung)}</Name>`,
    `        <LblBoQ>${escapeXml(lvMeta.bauvorhaben || lvMeta.projektName)}</LblBoQ>`,
    `        <Date>${escapeXml(lvMeta.datum || formatDateIso())}</Date>`,
    '        <OutlCompl>AllTxt</OutlCompl>',
    buildBoQBreakdown(),
    '      </BoQInfo>',
  ];

  return lines.join('\n');
}

function buildX83AdditionalTexts(additionalTexts) {
  if (!Array.isArray(additionalTexts) || additionalTexts.length === 0) {
    return '';
  }

  const entries = additionalTexts
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => [
      '          <Remark>',
      `            <Text>${escapeXml(entry)}</Text>`,
      '          </Remark>',
    ].join('\n'));

  if (!entries.length) {
    return '';
  }

  return entries.join('\n');
}

function buildX83Item(item) {
  return [
    `            <Item ID="${buildItemId(item)}" RNoPart="${escapeXml(item.ozPart1)}" RNoIndex="${escapeXml(normalizeRNoIndex(item.ozPart2))}">`,
    `              <Qty>${escapeXml(item.menge)}</Qty>`,
    `              <QU>${escapeXml(item.einheit)}</QU>`,
    '              <Description>',
    '                <CompleteText>',
    buildDetailTxt(item.langtext, '                  '),
    '                  <OutlineText>',
    buildOutlTxt(item.kurztext, '                    '),
    '                  </OutlineText>',
    '                </CompleteText>',
    '              </Description>',
    '            </Item>',
  ].join('\n');
}

function buildX83Title(title) {
  const itemsXml = title.items.map((item) => buildX83Item(item)).join('\n');

  return [
    `        <BoQCtgy ID="${buildTitleId(title.titleNo)}" RNoPart="${escapeXml(title.titleNo)}">`,
    buildMlText('LblTx', title.titleName, '          '),
    '          <BoQBody>',
    '            <Itemlist>',
    itemsXml,
    '            </Itemlist>',
    '          </BoQBody>',
    '        </BoQCtgy>',
  ].join('\n');
}

function buildX83Document(model) {
  const titles = Array.isArray(model?.hierarchy?.titles) ? model.hierarchy.titles : [];
  if (!titles.length) {
    const error = new Error('X83-Modell enthaelt keine Titelstruktur.');
    error.statusCode = 422;
    throw error;
  }

  const titlesXml = titles.map((title) => buildX83Title(title)).join('\n');
  const additionalTextsXml = buildX83AdditionalTexts(model.additionalTexts);
  const additionalBlock = additionalTextsXml ? `${additionalTextsXml}\n` : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<GAEB xmlns="${X83_NAMESPACE}">`,
    '  <GAEBInfo>',
    '    <Version>3.3</Version>',
    '    <VersDate>2021-05</VersDate>',
    '    <Phase>X83</Phase>',
    `    <Date>${formatDateIso()}</Date>`,
    '  </GAEBInfo>',
    '  <Award>',
    '    <DP>83</DP>',
    '    <AwardInfo>',
    `      <Cur>${escapeXml(model?.lvMeta?.waehrung || 'EUR')}</Cur>`,
    '    </AwardInfo>',
    '    <BoQ ID="BOQ_LV_01">',
    buildX83Meta(model.lvMeta),
    '      <BoQBody>',
    additionalBlock + titlesXml,
    '      </BoQBody>',
    '    </BoQ>',
    '  </Award>',
    '</GAEB>',
  ].join('\n');
}

function buildX83Filename(lvMeta) {
  const dateToken = formatDateForFilename();
  const timeToken = formatTimeForFilename();
  const projectName = sanitizeFilenamePart(lvMeta?.projektName, 'Projekt');
  const projectId = sanitizeFilenamePart(lvMeta?.projektId, 'NR');
  return `${dateToken}_${timeToken}_${projectName}_${projectId}.X83`;
}

module.exports = {
  buildX83Model,
  buildX83Meta,
  buildX83AdditionalTexts,
  buildX83Title,
  buildX83Item,
  buildX83Document,
  buildX83Filename,
};
