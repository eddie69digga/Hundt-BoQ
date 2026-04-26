const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { Document, Packer, Paragraph, TextRun, TabStopType, HeadingLevel, UnderlineType, AlignmentType, Table, TableRow, TableCell, BorderStyle, WidthType, VerticalAlign, ShadingType, ImageRun } = require('docx');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 3001;

function loadEnvFileIfPresent() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFileIfPresent();

// --- Supabase Initialization ---
let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('\u2713 Supabase Client initialisiert');
  } catch (error) {
    console.error('\u2717 Supabase Initialisierung fehlgeschlagen:', error.message);
  }
} else {
  console.warn('\u26a0 Supabase nicht konfiguriert (SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt)');
}

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PAGE_MARGIN_TOP_BOTTOM = 1134;
const PAGE_MARGIN_LEFT_RIGHT = 1200;
const RIGHT_TEXT_INDENT = 4340;
const PARAMETER_TAB_POSITION = 3000;
const LINE_SPACING_SINGLE = 240;
const BULLET_INDENT = 360;
const DOCX_FONT_FAMILY = 'Arial';

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Expose-Headers', 'Content-Disposition');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'BoQ',
  });
});

app.post('/api/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const envVarByUser = {
    admin: 'ADMIN_PASSWORD',
    testuser: 'TESTUSER_PASSWORD',
  };

  const passwordEnvName = envVarByUser[username];
  if (!passwordEnvName) {
    return res.status(401).json({
      success: false,
      message: 'Login fehlgeschlagen',
    });
  }

  const configuredPassword = process.env[passwordEnvName];
  if (!configuredPassword) {
    return res.status(500).json({
      success: false,
      message: 'Login-Konfiguration fehlt',
    });
  }

  if (password !== configuredPassword) {
    return res.status(401).json({
      success: false,
      message: 'Login fehlgeschlagen',
    });
  }

  return res.status(200).json({
    success: true,
    username,
  });
});

function validateSteuerungLv(lv) {
  if (!lv || typeof lv !== 'object' || Array.isArray(lv)) {
    return 'Ungueltige Datenstruktur: Root muss ein Objekt sein.';
  }

  if (typeof lv.titel !== 'string' || !lv.titel.trim()) {
    return 'Ungueltige Datenstruktur: titel fehlt oder ist leer.';
  }

  if (typeof lv.mengeneinheit !== 'string' || !lv.mengeneinheit.trim()) {
    return 'Ungueltige Datenstruktur: mengeneinheit fehlt oder ist leer.';
  }

  if (!Array.isArray(lv.module)) {
    return 'Ungueltige Datenstruktur: module muss ein Array sein.';
  }

  for (const [index, modul] of lv.module.entries()) {
    if (!modul || typeof modul !== 'object' || Array.isArray(modul)) {
      return `Ungueltige Datenstruktur: module[${index}] muss ein Objekt sein.`;
    }

    if (typeof modul.titel !== 'string') {
      return `Ungueltige Datenstruktur: module[${index}].titel muss ein String sein.`;
    }

    if (typeof modul.text !== 'string') {
      return `Ungueltige Datenstruktur: module[${index}].text muss ein String sein.`;
    }
  }

  return null;
}

function createDocxRun(text, size, bold = false) {
  return new TextRun({
    text,
    size,
    bold,
    font: DOCX_FONT_FAMILY,
  });
}

function splitParameterLine(line) {
  const colonIndex = line.indexOf(':');
  if (colonIndex <= 0) {
    return null;
  }

  const label = line.slice(0, colonIndex + 1).trim();
  const value = line.slice(colonIndex + 1).replace(/^\s+/, '');

  if (!label || label.length > 90) {
    return null;
  }

  // Zeilen wie "žAlternativ:" ohne Wert nach dem Doppelpunkt sind kein Parameter
  if (!value) {
    return null;
  }

  return { label, value };
}

function hasRealModuleText(text) {
  if (typeof text !== 'string') {
    return false;
  }

  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized !== 'originaltext fehlt';
}

function loadAndValidateLv(filename) {
  const lvPath = path.join(__dirname, 'lv', filename);
  let lv;

  try {
    lv = JSON.parse(fs.readFileSync(lvPath, 'utf8'));
  } catch (e) {
    if (e?.code === 'ENOENT') {
      const notFoundError = new Error(`${filename} wurde nicht gefunden.`);
      notFoundError.statusCode = 404;
      throw notFoundError;
    }

    const readError = new Error(`${filename} konnte nicht gelesen werden: ` + e.message);
    readError.statusCode = 500;
    throw readError;
  }

  const validationError = validateSteuerungLv(lv);
  if (validationError) {
    const invalidDataError = new Error(validationError);
    invalidDataError.statusCode = 422;
    throw invalidDataError;
  }

  return lv;
}

function buildModuleParagraphs(modules, filterFn) {
  const filtered = filterFn ? modules.filter((modul) => filterFn(modul.text)) : modules;
  return filtered.flatMap((modul) => {
    const titelAbsatz = new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        createDocxRun(modul.titel, 20, true),
      ],
      spacing: { before: 80, after: 40, line: LINE_SPACING_SINGLE },
      indent: { right: RIGHT_TEXT_INDENT },
      alignment: AlignmentType.LEFT,
      keepNext: true,
      keepLines: true,
    });

    // Modul-Text: Zeilenumbrueche (\n) als eigene Absaetze, Parameter-Zeilen mit Tabstopp ausrichten.
    const zeilen = modul.text.split('\n');
    const lastNonEmptyIndex = zeilen.reduce((lastIndex, line, index) => (line === '' ? lastIndex : index), -1);
    const nonEmptyLineCount = zeilen.filter((line) => line.length > 0).length;
    const keepSmallModuleBlock = nonEmptyLineCount > 0 && nonEmptyLineCount <= 10;
    const textAbsaetze = [];
    let vorherigeZeileWarParameter = false;

    for (let index = 0; index < zeilen.length; index += 1) {
      const zeile = zeilen[index];
      const keepWithNext = keepSmallModuleBlock && zeile !== '' && index < lastNonEmptyIndex;

      if (zeile === '') {
        textAbsaetze.push(new Paragraph({
          children: [createDocxRun('', 20)],
          spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
          indent: { right: RIGHT_TEXT_INDENT },
          keepLines: true,
        }));
        vorherigeZeileWarParameter = false;
        continue;
      }

      // Bullet-Zeilen: Hanging Indent - Bullet links, Text eingerueckt, Folgezeilen buendig
      if (zeile.startsWith('•')) {
        textAbsaetze.push(new Paragraph({
          children: [createDocxRun(zeile, 20)],
          tabStops: [{ type: TabStopType.LEFT, position: BULLET_INDENT }],
          spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
          indent: { left: BULLET_INDENT, hanging: BULLET_INDENT, right: RIGHT_TEXT_INDENT },
          alignment: AlignmentType.LEFT,
          keepNext: keepWithNext,
          keepLines: true,
        }));
        vorherigeZeileWarParameter = false;
        continue;
      }

      const parameter = splitParameterLine(zeile);
      if (parameter) {
        // Hanging Indent: erste Zeile bei 0 (left - hanging), Tab schiebt Wert auf PARAMETER_TAB_POSITION,
        // Zeilenumbrueche innerhalb des Werts beginnen ebenfalls bei PARAMETER_TAB_POSITION (= left).
        textAbsaetze.push(new Paragraph({
          children: [createDocxRun(`${parameter.label}\t${parameter.value}`, 20)],
          tabStops: [{ type: TabStopType.LEFT, position: PARAMETER_TAB_POSITION }],
          spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
          indent: { left: PARAMETER_TAB_POSITION, hanging: PARAMETER_TAB_POSITION, right: RIGHT_TEXT_INDENT },
          alignment: AlignmentType.LEFT,
          keepNext: keepWithNext,
          keepLines: true,
        }));
        vorherigeZeileWarParameter = true;
        continue;
      }

      if (vorherigeZeileWarParameter) {
        textAbsaetze.push(new Paragraph({
          children: [createDocxRun(zeile, 20)],
          spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
          indent: { left: PARAMETER_TAB_POSITION, right: RIGHT_TEXT_INDENT },
          alignment: AlignmentType.LEFT,
          keepNext: keepWithNext,
          keepLines: true,
        }));
        continue;
      }

      textAbsaetze.push(new Paragraph({
        children: [createDocxRun(zeile, 20)],
        spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
        indent: { right: RIGHT_TEXT_INDENT },
        alignment: AlignmentType.JUSTIFIED,
        keepNext: keepWithNext,
        keepLines: true,
      }));
      vorherigeZeileWarParameter = false;
    }

    const leerzeile = new Paragraph({
      children: [createDocxRun('', 20)],
      spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
      indent: { right: RIGHT_TEXT_INDENT },
      keepLines: true,
    });
    return [titelAbsatz, ...textAbsaetze, leerzeile];
  });
}

function buildPositionBlock(posNummer, lv, filterFn, isFirst = false) {
  const moduleParagraphs = buildModuleParagraphs(lv.module, filterFn);
  return [
    // Positionskopf: Ordnungszahl + Titel
    // pageBreakBefore: true erzwingt neuen Seitenumbruch direkt vor dieser Ueberschrift (ausser bei der ersten Position)
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        createDocxRun(posNummer + '  ' + lv.titel, 20, true),
      ],
      spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
      indent: { right: RIGHT_TEXT_INDENT },
      alignment: AlignmentType.LEFT,
      pageBreakBefore: !isFirst,
    }),
    // Mengen-/Einheitszeile
    new Paragraph({
      children: [
        createDocxRun('1 ' + lv.mengeneinheit, 20),
      ],
      spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
      indent: { right: RIGHT_TEXT_INDENT },
      alignment: AlignmentType.LEFT,
    }),
    // Leerzeile nach dem Kopf
    new Paragraph({
      children: [createDocxRun('', 20)],
      spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
      indent: { right: RIGHT_TEXT_INDENT },
    }),
    ...moduleParagraphs,
  ];
}

const DECKBLATT_BORDER_COLOR = '000000';
const DECKBLATT_BORDER_SIZE = 8;
const DECKBLATT_MAIN_LEFT_W = 3800;
const DECKBLATT_MAIN_RIGHT_W = 5106;

const DECKBLATT_SOLID_BORDER = { style: BorderStyle.SINGLE, size: DECKBLATT_BORDER_SIZE, color: DECKBLATT_BORDER_COLOR };
const DECKBLATT_NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const DECKBLATT_CELL_BORDERS = { top: DECKBLATT_SOLID_BORDER, bottom: DECKBLATT_SOLID_BORDER, left: DECKBLATT_SOLID_BORDER, right: DECKBLATT_SOLID_BORDER };
const DECKBLATT_NO_BORDERS = { top: DECKBLATT_NO_BORDER, bottom: DECKBLATT_NO_BORDER, left: DECKBLATT_NO_BORDER, right: DECKBLATT_NO_BORDER };
const DECKBLATT_NO_TABLE_BORDERS = { top: DECKBLATT_NO_BORDER, bottom: DECKBLATT_NO_BORDER, left: DECKBLATT_NO_BORDER, right: DECKBLATT_NO_BORDER, insideHorizontal: DECKBLATT_NO_BORDER, insideVertical: DECKBLATT_NO_BORDER };
const FORM_TABLE_BORDER = { style: BorderStyle.SINGLE, size: 2, color: '000000' };
const FORM_TABLE_BORDERS = {
  top: FORM_TABLE_BORDER,
  bottom: FORM_TABLE_BORDER,
  left: FORM_TABLE_BORDER,
  right: FORM_TABLE_BORDER,
  insideHorizontal: FORM_TABLE_BORDER,
  insideVertical: FORM_TABLE_BORDER,
};
const FORM_NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const FORM_NO_TABLE_BORDERS = {
  top: FORM_NO_BORDER,
  bottom: FORM_NO_BORDER,
  left: FORM_NO_BORDER,
  right: FORM_NO_BORDER,
  insideHorizontal: FORM_NO_BORDER,
  insideVertical: FORM_NO_BORDER,
};
const FORM_PAGE_WIDTH = 8906;
const FORM_PAGE_MARGIN_TOP_BOTTOM = 900;
const FORM_LABEL_WIDTH = 2200;
const FORM_FIELD_LINE = '________________________________';
const FORM_DOT_LINE = '................................................';
const FORM_FONT_TITLE = 30;
const FORM_FONT_LABEL = 16;
const FORM_FONT_TEXT = 16;
const FORM_FONT_TEXT_BOLD = 16;
const FORM_FONT_NOTE = 14;
const FORM_LINE_SPACING = 230;
const STANDARD_PLANVERFASSER = {
  firma: 'Hundt Consult GmbH',
  adresse: 'Im Brauereiviertel 5',
  plzOrt: '24118 Kiel',
  kontakt: 'Herr Enrico Dressler',
  mobil: 'Mobil: 01517 445 7108',
  email: 'e.dressler@hundt-consult.de',
};

function buildQueryPairLine(readValue, firstKey, secondKey) {
  const first = readValue(firstKey);
  const second = readValue(secondKey);

  if (first && second) {
    return `${first} ${second}`;
  }

  return first || second || '-';
}

function buildDeckblattLeftPara(text, size = 20, bold = false, afterPt = 40) {
  return new Paragraph({
    children: [new TextRun({ text, size, bold, font: DOCX_FONT_FAMILY })],
    spacing: { before: 0, after: afterPt, line: LINE_SPACING_SINGLE },
    alignment: AlignmentType.LEFT,
  });
}

function buildDeckblattBoxSpacer() {
  return new Paragraph({
    children: [new TextRun({ text: '', size: 16, font: DOCX_FONT_FAMILY })],
    spacing: { before: 0, after: 100, line: LINE_SPACING_SINGLE },
  });
}

// Einzelne Kachel: Label oben (kleiner, schwarz), Inhalt darunter (groesser, fett).
// Keine Farben, keine Fuellflaechen - schwarzer Rahmen.
function buildDeckblattBox(labelText, contentText, width, contentSize = 19, contentBold = true) {
  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: DECKBLATT_NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            borders: DECKBLATT_CELL_BORDERS,
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: labelText, size: 16, font: DOCX_FONT_FAMILY })],
                spacing: { before: 0, after: 40, line: LINE_SPACING_SINGLE },
              }),
              new Paragraph({
                children: [new TextRun({ text: contentText, size: contentSize, font: DOCX_FONT_FAMILY, ...(contentBold ? { bold: true } : {}) })],
                spacing: { before: 0, after: 0, line: LINE_SPACING_SINGLE },
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// Kachel mit mehreren Inhaltszeilen (Label + n Zeilen Inhalt, alle fett).
function buildDeckblattBoxLines(labelText, lines, width) {
  const contentParas = lines.map((line, i) => new Paragraph({
    children: [new TextRun({ text: line, size: 19, bold: true, font: DOCX_FONT_FAMILY })],
    spacing: { before: 0, after: i < lines.length - 1 ? 30 : 0, line: LINE_SPACING_SINGLE },
  }));
  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: DECKBLATT_NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            borders: DECKBLATT_CELL_BORDERS,
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: labelText, size: 16, font: DOCX_FONT_FAMILY })],
                spacing: { before: 0, after: 40, line: LINE_SPACING_SINGLE },
              }),
              ...contentParas,
            ],
          }),
        ],
      }),
    ],
  });
}

// Zwei optisch getrennte Kacheln nebeneinander.
// Wrapper: 3 Spalten (linke Box | Luecke | rechte Box) - keine verbundenen Zellkanten.
function buildDeckblattBoxPair(h1, c1, h2, c2, totalWidth) {
  const PAIR_GAP = 140;
  const halfW = Math.floor((totalWidth - PAIR_GAP) / 2);
  const restW = totalWidth - PAIR_GAP - halfW;
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    borders: DECKBLATT_NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: halfW, type: WidthType.DXA },
            borders: DECKBLATT_NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [buildDeckblattBox(h1, c1, halfW)],
          }),
          new TableCell({
            width: { size: PAIR_GAP, type: WidthType.DXA },
            borders: DECKBLATT_NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: restW, type: WidthType.DXA },
            borders: DECKBLATT_NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [buildDeckblattBox(h2, c2, restW)],
          }),
        ],
      }),
    ],
  });
}

function buildDeckblatt(query) {
  const raw = (key) => String(query[key] || '').trim();
  const val = (key) => raw(key) || '-';
  const getProjektAnlagenzeile = () => {
    const anlagenbezeichnung = raw('leistung');
    const projektart = raw('projektart');
    const fuehrendeTrennzeichen = new Set([' ', '-', '_', ':', ',', ';', '/']);

    if (!anlagenbezeichnung) {
      return '-';
    }

    if (!projektart) {
      return anlagenbezeichnung;
    }

    if (!anlagenbezeichnung.toLocaleLowerCase().startsWith(projektart.toLocaleLowerCase())) {
      return anlagenbezeichnung;
    }

    let bereinigteBezeichnung = anlagenbezeichnung.slice(projektart.length);
    while (bereinigteBezeichnung && fuehrendeTrennzeichen.has(bereinigteBezeichnung.charAt(0))) {
      bereinigteBezeichnung = bereinigteBezeichnung.slice(1);
    }
    bereinigteBezeichnung = bereinigteBezeichnung.trim();

    return bereinigteBezeichnung || anlagenbezeichnung;
  };
  const pairLine = (firstKey, secondKey) => buildQueryPairLine(raw, firstKey, secondKey);

  const W = DECKBLATT_MAIN_RIGHT_W;
  const sp = buildDeckblattBoxSpacer;

  // Angebotsaufforderung: Standardtext vollstaendig in der Kachel
  const ANGEBOTS_TEXT =
    'Sollten Sie an der Ausfuehrung folgender Leistungen interessiert sein, ' +
    'bitten wir Sie, uns Ihr Angebot einzureichen.';

  // Projekt-Kachel: Projektnummer + Bauvorhaben + Anlagenbezeichnung
  const projektLines = [
    val('projektnummer'),
    val('projektname'),
    getProjektAnlagenzeile(),
  ];

  // Bauvorhaben-Kachel: Bauvorhaben + Strasse + PLZ/Stadt
  const bauvorhabenLines = [
    val('projektname'),
    val('strasse'),
    pairLine('plz', 'stadt'),
  ];

  // Rechte Seite: Titel ueber Kacheln, dann 10 Kacheln in Zielbild-Reihenfolge
  const rightChildren = [
    new Paragraph({
      children: [new TextRun({ text: 'Leistungsverzeichnis', size: 36, bold: true, font: DOCX_FONT_FAMILY })],
      spacing: { before: 0, after: 60, line: LINE_SPACING_SINGLE },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Leistungsbeschreibung', size: 20, font: DOCX_FONT_FAMILY })],
      spacing: { before: 0, after: 200, line: LINE_SPACING_SINGLE },
    }),
    buildDeckblattBoxLines('Projekt', projektLines, W),
    sp(),
    buildDeckblattBoxLines('Bauvorhaben', bauvorhabenLines, W),
    sp(),
    buildDeckblattBoxLines('Leistung (LV)', ['69', 'Aufzugsanlagen'], W),
    sp(),
    buildDeckblattBoxPair('Ausfuehrungsbeginn', '-', 'Ausfuehrungsende', '-', W),
    sp(),
    buildDeckblattBox('Angebotsaufforderung', ANGEBOTS_TEXT, W, 18, false),
    sp(),
    buildDeckblattBoxPair('Abgabetermin', '-', 'Abgabezeit / Uhrzeit', '-', W),
    sp(),
    buildDeckblattBox('Abgabeort', '-', W),
    sp(),
    buildDeckblattBox('Zuschlagsfrist', '-', W),
    sp(),
    buildDeckblattBoxPair('MwSt', '19 %', 'Waehrung', 'EUR', W),
    sp(),
    buildDeckblattBox('Seiten ohne Anlage(n)', '-', W),
  ];

  // Logo einlesen (logo.png aus backend/assets)
  const logoPath = path.join(__dirname, 'assets', 'logo.png');
  let logoImageRun = null;
  try {
    const logoData = fs.readFileSync(logoPath);
    logoImageRun = new ImageRun({
      data: logoData,
      transformation: { width: 238, height: 173 },
      type: 'png',
    });
  } catch {
    // Logo nicht gefunden - linke Seite ohne Bild
  }

  // Linke Seite: Logo + Planverfasser-Block
  const leftChildren = [
    // Logo
    ...(logoImageRun
      ? [new Paragraph({
          children: [logoImageRun],
          spacing: { before: 0, after: 160, line: LINE_SPACING_SINGLE },
        })]
      : []),
    // Label
    buildDeckblattLeftPara('Planverfasser', 18, false, 80),
    // Firma
    buildDeckblattLeftPara('Hundt Consult GmbH', 18, true, 0),
    buildDeckblattLeftPara('Im Brauereiviertel 5', 18, false, 0),
    buildDeckblattLeftPara('24118 Kiel', 18, false, 280),
    // Ansprechpartner
    buildDeckblattLeftPara('Herr Enrico Dressler', 18, false, 280),
    // Kontakt
    buildDeckblattLeftPara('Mobil: 01517 445 7108', 18, false, 0),
    buildDeckblattLeftPara('e.dressler@hundt-consult.de', 18, false, 0),
  ];

  const mainTable = new Table({
    width: { size: 8906, type: WidthType.DXA },
    borders: DECKBLATT_NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: DECKBLATT_MAIN_LEFT_W, type: WidthType.DXA },
            borders: DECKBLATT_NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 300, right: 200 },
            children: leftChildren,
          }),
          new TableCell({
            width: { size: DECKBLATT_MAIN_RIGHT_W, type: WidthType.DXA },
            borders: DECKBLATT_NO_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: rightChildren,
          }),
        ],
      }),
    ],
  });

  return [mainTable];
}

function buildFormParagraph(text, size = FORM_FONT_TEXT, bold = false, after = 40, alignment = AlignmentType.LEFT) {
  return new Paragraph({
    children: [new TextRun({ text, size, bold, font: DOCX_FONT_FAMILY })],
    spacing: { before: 0, after, line: FORM_LINE_SPACING },
    alignment,
  });
}

function buildFormLines(lines, size = FORM_FONT_TEXT, bold = false) {
  return lines.map((line, index) => buildFormParagraph(line, size, bold, index < lines.length - 1 ? 30 : 0));
}

function buildClassicHeaderBlock(rows, width = FORM_PAGE_WIDTH) {
  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: FORM_TABLE_BORDERS,
    rows: rows.map(({ label, lines }) => new TableRow({
      children: [
        new TableCell({
          width: { size: width, type: WidthType.DXA },
          borders: FORM_TABLE_BORDERS,
          margins: { top: 70, bottom: 90, left: 120, right: 120 },
          children: [
            buildFormParagraph(label, FORM_FONT_LABEL, false, 30),
            ...buildFormLines(lines?.length ? lines : ['-'], FORM_FONT_TEXT_BOLD, true),
          ],
        }),
      ],
    })),
  });
}

function buildClassicLabeledBlock(label, lines, width = FORM_PAGE_WIDTH, boldContent = true) {
  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: FORM_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 70, bottom: 70, left: 120, right: 120 },
            children: [
              buildFormParagraph(label, FORM_FONT_LABEL, false, 30),
              ...buildFormLines(lines?.length ? lines : ['-'], FORM_FONT_TEXT_BOLD, boldContent),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildClassicKontaktBlock(label, leftLines, centerLines, rightLines, width = FORM_PAGE_WIDTH) {
  const leftWidth = 4100;
  const centerWidth = 2500;
  const rightWidth = width - leftWidth - centerWidth;

  const innerGrid = new Table({
    width: { size: width - 280, type: WidthType.DXA },
    borders: FORM_NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: leftWidth, type: WidthType.DXA },
            borders: FORM_NO_TABLE_BORDERS,
            margins: { top: 40, bottom: 40, left: 40, right: 160 },
            children: buildFormLines(leftLines?.length ? leftLines : ['-'], FORM_FONT_TEXT, false),
          }),
          new TableCell({
            width: { size: centerWidth, type: WidthType.DXA },
            borders: FORM_NO_TABLE_BORDERS,
            margins: { top: 40, bottom: 40, left: 40, right: 160 },
            children: buildFormLines(centerLines?.length ? centerLines : ['-'], FORM_FONT_TEXT, false),
          }),
          new TableCell({
            width: { size: rightWidth, type: WidthType.DXA },
            borders: FORM_NO_TABLE_BORDERS,
            margins: { top: 40, bottom: 40, left: 40, right: 40 },
            children: buildFormLines(rightLines?.length ? rightLines : [''], FORM_FONT_TEXT, false),
          }),
        ],
      }),
    ],
  });

  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: FORM_NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            borders: {
              top: FORM_TABLE_BORDER,
              left: FORM_TABLE_BORDER,
              right: FORM_TABLE_BORDER,
              bottom: FORM_NO_BORDER,
            },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph(label, FORM_FONT_LABEL, false, 0)],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            borders: {
              top: FORM_NO_BORDER,
              left: FORM_TABLE_BORDER,
              right: FORM_TABLE_BORDER,
              bottom: FORM_TABLE_BORDER,
            },
            margins: { top: 20, bottom: 20, left: 20, right: 20 },
            children: [innerGrid],
          }),
        ],
      }),
    ],
  });
}

function buildClassicHinweisBlock(paragraphs, width = FORM_PAGE_WIDTH) {
  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: FORM_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 130, right: 130 },
            children: paragraphs.map((text, index) => buildFormParagraph(text, FORM_FONT_NOTE, false, index < paragraphs.length - 1 ? 16 : 0)),
          }),
        ],
      }),
    ],
  });
}

function buildClassicSummenBlock(width = FORM_PAGE_WIDTH) {
  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: FORM_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 3200, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph('Angebotssumme, Netto:', FORM_FONT_TEXT, false, 0)],
          }),
          new TableCell({
            width: { size: 4200, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph(FORM_DOT_LINE, FORM_FONT_TEXT, false, 0)],
          }),
          new TableCell({
            width: { size: width - 7400, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph('EUR', FORM_FONT_TEXT, false, 0)],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 3200, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph('zzgl. MwSt.:', FORM_FONT_TEXT, false, 0)],
          }),
          new TableCell({
            width: { size: 4200, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph(FORM_DOT_LINE, FORM_FONT_TEXT, false, 0)],
          }),
          new TableCell({
            width: { size: width - 7400, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph('EUR', FORM_FONT_TEXT, false, 0)],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 3200, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph('Angebotssumme, Brutto:', FORM_FONT_TEXT, false, 0)],
          }),
          new TableCell({
            width: { size: 4200, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph(FORM_DOT_LINE, FORM_FONT_TEXT, false, 0)],
          }),
          new TableCell({
            width: { size: width - 7400, type: WidthType.DXA },
            borders: FORM_TABLE_BORDERS,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [buildFormParagraph('EUR', FORM_FONT_TEXT, false, 0)],
          }),
        ],
      }),
    ],
  });
}

function buildClassicSignaturBlock(width = FORM_PAGE_WIDTH) {
  const leftWidth = Math.floor(width / 2);
  const rightWidth = width - leftWidth;

  const signatureCell = (title, lines, cellWidth) => new TableCell({
    width: { size: cellWidth, type: WidthType.DXA },
    borders: FORM_TABLE_BORDERS,
    margins: { top: 50, bottom: 50, left: 120, right: 120 },
    children: [
      buildFormParagraph(title, FORM_FONT_TEXT, true, 18),
      ...buildFormLines(lines, FORM_FONT_TEXT, false),
    ],
  });

  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: FORM_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          signatureCell('Angebotsabgabe:', [FORM_DOT_LINE], leftWidth),
          signatureCell('Geprueft:', [FORM_DOT_LINE], rightWidth),
        ],
      }),
      new TableRow({
        children: [
          signatureCell('Anbieter - Datum, Ort:', [FORM_DOT_LINE], leftWidth),
          signatureCell('Ausschreibender - Ort, Datum:', [FORM_DOT_LINE], rightWidth),
        ],
      }),
      new TableRow({
        children: [
          signatureCell('Stempel:', [FORM_DOT_LINE], leftWidth),
          signatureCell('Anbieter - Unterschrift:', [FORM_DOT_LINE], rightWidth),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            columnSpan: 2,
            borders: FORM_TABLE_BORDERS,
            margins: { top: 50, bottom: 50, left: 120, right: 120 },
            children: [
              buildFormParagraph('Angebotssumme nachgeprueft:', FORM_FONT_TEXT, true, 18),
              buildFormParagraph(FORM_DOT_LINE, FORM_FONT_TEXT, false, 0),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildFormblatt(query) {
  const raw = (key) => String(query[key] || '').trim();
  const val = (key) => raw(key) || '-';
  const pairLine = (firstKey, secondKey) => buildQueryPairLine(raw, firstKey, secondKey);

  const getObjektbezeichnung = () => {
    const anlagenbezeichnung = raw('leistung');
    const projektart = raw('projektart');
    const fuehrendeTrennzeichen = new Set([' ', '-', '_', ':', ',', ';', '/']);

    if (!anlagenbezeichnung) {
      return '-';
    }

    if (!projektart) {
      return anlagenbezeichnung;
    }

    if (!anlagenbezeichnung.toLocaleLowerCase().startsWith(projektart.toLocaleLowerCase())) {
      return anlagenbezeichnung;
    }

    let bereinigteBezeichnung = anlagenbezeichnung.slice(projektart.length);
    while (bereinigteBezeichnung && fuehrendeTrennzeichen.has(bereinigteBezeichnung.charAt(0))) {
      bereinigteBezeichnung = bereinigteBezeichnung.slice(1);
    }

    return bereinigteBezeichnung.trim() || anlagenbezeichnung;
  };

  return [
    buildFormParagraph('Leistungsverzeichnis', FORM_FONT_TITLE, true, 70),
    buildClassicHeaderBlock([
      { label: 'Projekt', lines: [val('projektnummer'), val('projektname'), getObjektbezeichnung()] },
      { label: 'Leistung (LV)', lines: ['69    Aufzugsanlagen'] },
    ]),
    buildFormParagraph('', 16, false, 28),
    buildClassicLabeledBlock('Bauvorhaben', [val('projektname'), val('strasse'), pairLine('plz', 'stadt')]),
    buildFormParagraph('', 16, false, 28),
    buildClassicKontaktBlock('Bauherr', [
      val('agkunde'),
      val('agadresse'),
      pairLine('agplz', 'aort'),
    ], [
      'Telefon',
      'Fax',
    ], [
      '',
    ]),
    buildFormParagraph('', 16, false, 28),
    buildClassicKontaktBlock('Planverfasser / Ausschreibung', [
      STANDARD_PLANVERFASSER.firma,
      STANDARD_PLANVERFASSER.adresse,
      STANDARD_PLANVERFASSER.plzOrt,
    ], [
      'Telefon',
      'Fax',
      STANDARD_PLANVERFASSER.mobil,
      STANDARD_PLANVERFASSER.email,
    ], [
      'Ansprechpartner:',
      '...',
      STANDARD_PLANVERFASSER.kontakt,
    ]),
    buildFormParagraph('', 16, false, 28),
    buildClassicKontaktBlock('Bauleitung', [
      '-',
      '-',
      '-',
    ], [
      'Telefon',
      'Fax',
      'E-Mail',
    ], [
      'Ansprechpartner:',
      '...',
      '-',
    ]),
    buildFormParagraph('', 16, false, 28),
    buildClassicLabeledBlock('Ansprechpartner / Bemerkung', [FORM_DOT_LINE, FORM_DOT_LINE], FORM_PAGE_WIDTH, false),
    buildFormParagraph('', 16, false, 28),
    buildClassicHinweisBlock([
      'Diese Unterlagen sind vollstaendig auszufuellen und mit Stempel/Unterschrift einzureichen. Termingerechter Eingang am Abgabeort (siehe Deckblatt). Rueckfragen an die Kontaktadresse des Planverfassers.',
    ]),
    buildFormParagraph('', 16, false, 28),
    buildClassicSummenBlock(),
    buildFormParagraph('', 16, false, 28),
    buildClassicSignaturBlock(),
  ];
}

function normalizeTechnikValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => entry.length > 0)
      .join(', ');
  }

  if (typeof value === 'object') {
    return '';
  }

  return String(value).trim();
}

function formatDecimalComma(value, fixedDigits = null) {
  const normalized = normalizeTechnikValue(value);
  if (!normalized) {
    return '';
  }

  const numericSource = normalized.replace(',', '.');
  const numeric = Number(numericSource);
  if (!Number.isFinite(numeric)) {
    return normalized.replace('.', ',');
  }

  if (Number.isInteger(fixedDigits) && fixedDigits >= 0) {
    return numeric.toFixed(fixedDigits).replace('.', ',');
  }

  return String(numeric).replace('.', ',');
}

function withUnit(value, unit, fixedDigits = null) {
  const normalized = normalizeTechnikValue(value);
  if (!normalized) {
    return '–';
  }

  const lower = normalized.toLowerCase();
  if (lower.includes(unit.toLowerCase())) {
    return normalized.replace('.', ',');
  }

  const formatted = formatDecimalComma(normalized, fixedDigits);
  return `${formatted} ${unit}`;
}

function withDash(value, fixedDigits = null) {
  const normalized = normalizeTechnikValue(value);
  if (!normalized) {
    return '–';
  }

  return formatDecimalComma(normalized, fixedDigits);
}

function isMeaningfulTechnikValue(value) {
  return normalizeTechnikValue(value).length > 0;
}

function formatTechnikLabel(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') {
    return 'Technischer Wert';
  }

  const normalized = rawKey
    .replace(/^technik[._]/i, '')
    .replaceAll('_', ' ')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();

  if (!normalized) {
    return 'Technischer Wert';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function withUnitIfMissing(value, unit) {
  const normalized = normalizeTechnikValue(value);
  if (!normalized) {
    return '';
  }

  const lower = normalized.toLowerCase();
  if (lower.includes(unit.toLowerCase())) {
    return normalized;
  }

  return `${normalized} ${unit}`;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mergeTechnikPreferredSource(technik, parsed) {
  if (!isPlainObject(parsed)) {
    return;
  }

  // Bevorzugte Quelle: technischeParameter
  if (isPlainObject(parsed.technischeParameter)) {
    Object.assign(technik, parsed.technischeParameter);
    return;
  }

  // Optionaler Fallback fuer Legacy-Nutzdaten
  if (isPlainObject(parsed.technischeDaten)) {
    Object.assign(technik, parsed.technischeDaten);
    return;
  }

  Object.assign(technik, parsed);
}

function applyFlattenedTechnikQuery(query, technik) {
  for (const [rawKey, rawValue] of Object.entries(query)) {
    if (!/^technik[._]/i.test(rawKey)) {
      continue;
    }

    const key = rawKey.replace(/^technik[._]/i, '');
    if (!key || key.toLowerCase() === 'json') {
      continue;
    }

    technik[key] = rawValue;
  }
}

function parseTechnikFromQuery(query) {
  const technik = {};

  const parsedTechnikJson = parseJsonObject(query.technik_json);
  if (parsedTechnikJson) {
    mergeTechnikPreferredSource(technik, parsedTechnikJson);
  }

  // Query-basierter Fallback: technischeParameter_json oder technischeDaten_json
  const fallbackJsonSources = [query.technischeParameter_json, query.technischeDaten_json];
  for (const source of fallbackJsonSources) {
    const parsedFallback = parseJsonObject(source);
    if (!parsedFallback) {
      continue;
    }

    Object.assign(technik, parsedFallback);
    break;
  }

  applyFlattenedTechnikQuery(query, technik);

  return technik;
}

function pickTechnikValue(query, technik, candidateKeys) {
  for (const key of candidateKeys) {
    if (Object.hasOwn(technik, key) && isMeaningfulTechnikValue(technik[key])) {
      return technik[key];
    }

    if (Object.hasOwn(query, key) && isMeaningfulTechnikValue(query[key])) {
      return query[key];
    }
  }

  return '';
}

function buildTechnischeDatenRows(query) {
  const technik = parseTechnikFromQuery(query);
  const orderedFields = [
    { label: 'Aufzugstyp', keys: ['aufzugstyp'], formatValue: (value) => withDash(value) },
    { label: 'Nenngeschwindigkeit', keys: ['vnenn'], formatValue: (value) => withUnit(value, 'm/s') },
    { label: 'Tragfähigkeit', keys: ['tragfaehigkeit', 'tragfähigkeit'], formatValue: (value) => withUnit(value, 'kg') },
    { label: 'Aufhängung', keys: ['aufhaengung', 'aufhängung'], formatValue: (value) => withDash(value) },
    { label: 'Durchladung', keys: ['durchladung'], formatValue: (value) => withDash(value) },
    { label: 'Türart', keys: ['tuerart', 'türart'], formatValue: (value) => withDash(value) },
    { label: 'Haltestellen', keys: ['haltestellenanzahl'], formatValue: (value) => withDash(value) },
    { label: 'Schachtzugänge', keys: ['schachtzugaenge', 'schachtzugänge'], formatValue: (value) => withDash(value) },
    { label: 'Förderhöhe', keys: ['foerderhoehe', 'förderhöhe'], formatValue: (value) => withUnit(value, 'm', 2) },
  ];

  const rows = [];

  for (const field of orderedFields) {
    const value = pickTechnikValue(query, technik, field.keys);
    const normalizedValue = field.formatValue
      ? field.formatValue(value)
      : withDash(value);

    rows.push({
      label: field.label,
      value: normalizedValue,
    });
  }

  return rows;
}

function buildTechnischeDatenTable(rows, width = FORM_PAGE_WIDTH) {
  const labelWidth = 3000;
  const valueWidth = width - labelWidth;
  const noCellBorders = {
    top: FORM_NO_BORDER,
    bottom: FORM_NO_BORDER,
    left: FORM_NO_BORDER,
    right: FORM_NO_BORDER,
  };

  return new Table({
    width: { size: width, type: WidthType.DXA },
    borders: FORM_NO_TABLE_BORDERS,
    rows: rows.map((row) => new TableRow({
      children: [
        new TableCell({
          width: { size: labelWidth, type: WidthType.DXA },
          borders: noCellBorders,
          margins: { top: 70, bottom: 70, left: 120, right: 120 },
          children: [buildFormParagraph(row.label, 20, true, 0)],
        }),
        new TableCell({
          width: { size: valueWidth, type: WidthType.DXA },
          borders: noCellBorders,
          margins: { top: 70, bottom: 70, left: 120, right: 120 },
          children: [buildFormParagraph(row.value, 20, false, 0)],
        }),
      ],
    })),
  });
}

function buildTechnischeDatenPage(query) {
  const rows = buildTechnischeDatenRows(query);

  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Technische Daten', size: FORM_FONT_TITLE, bold: true, font: DOCX_FONT_FAMILY })],
      spacing: { before: 0, after: 200, line: FORM_LINE_SPACING },
    }),
  ];

  if (rows.length > 0) {
    children.push(buildTechnischeDatenTable(rows));
  }

  return children;
}

// ─── Vorbemerkung ────────────────────────────────────────────────────────────

const VORBEMERKUNG_FONT = 'Arial';
const VORBEMERKUNG_FONT_SIZE = 20; // 10pt in OOXML half-points
const VORBEMERKUNG_LEFT_INDENT = 0;
const VORBEMERKUNG_RIGHT_INDENT = 3685; // 6.5 cm in twips (noch 1 cm breiter)

function loadVorbemerkungText() {
  const filePath = path.join(__dirname, 'lv', 'vorbemerkung.txt');
  if (!fs.existsSync(filePath)) {
    const err = new Error(`Vorbemerkung-Datei nicht gefunden: ${filePath}`);
    err.statusCode = 500;
    throw err;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function isVorbemerkungHeading(line) {
  return (
    line.length < 80 &&
    !line.endsWith('.') &&
    !line.includes(':') &&
    !line.includes(';') &&
    !line.startsWith('•') &&
    !/^\d/.test(line) &&
    !/^[A-Z]{2,3}\s/.test(line) // keine Abkürzungsdefinitionen wie "AG ="
  );
}

function buildVorbemerkungHeadingPara(text, keepWithNext = true) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, size: VORBEMERKUNG_FONT_SIZE, bold: true, font: VORBEMERKUNG_FONT })],
    spacing: { before: 140, after: 60, line: FORM_LINE_SPACING },
    alignment: AlignmentType.LEFT,
    indent: { left: VORBEMERKUNG_LEFT_INDENT, right: VORBEMERKUNG_RIGHT_INDENT },
    keepNext: keepWithNext,
    keepLines: true,
  });
}

function buildVorbemerkungBodyPara(line, keepWithNext = false) {
  if (line.startsWith('•')) {
    return new Paragraph({
      children: [new TextRun({ text: `\u2022  ${line.slice(1).trim()}`, size: VORBEMERKUNG_FONT_SIZE, font: VORBEMERKUNG_FONT })],
      spacing: { before: 0, after: 30, line: FORM_LINE_SPACING },
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: VORBEMERKUNG_LEFT_INDENT, right: VORBEMERKUNG_RIGHT_INDENT },
      keepNext: keepWithNext,
      keepLines: true,
    });
  }
  return new Paragraph({
    children: [new TextRun({ text: line, size: VORBEMERKUNG_FONT_SIZE, font: VORBEMERKUNG_FONT })],
    spacing: { before: 0, after: 40, line: FORM_LINE_SPACING },
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: VORBEMERKUNG_LEFT_INDENT, right: VORBEMERKUNG_RIGHT_INDENT },
    keepNext: keepWithNext,
    keepLines: true,
  });
}

function buildVorbemerkungBlock(block) {
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const result = [];
  const lastNonEmptyIndex = lines.length - 1;
  const keepSmallBlock = lines.length > 0 && lines.length <= 10;
  const firstLine = lines[0];
  const firstIsHeading = isVorbemerkungHeading(firstLine);

  if (lines.length === 1 && firstIsHeading) {
    result.push(buildVorbemerkungHeadingPara(firstLine, false));
    return result;
  }

  const restHasContent = lines.slice(1).some((l) => l.length > 30);
  const useFirstAsHeading = firstIsHeading && restHasContent;

  if (useFirstAsHeading) {
    result.push(buildVorbemerkungHeadingPara(firstLine, true));
  }

  const bodyLines = useFirstAsHeading ? lines.slice(1) : lines;
  const bodyOffset = useFirstAsHeading ? 1 : 0;
  for (let i = 0; i < bodyLines.length; i += 1) {
    const line = bodyLines[i];
    const sourceIndex = i + bodyOffset;
    const keepWithNext = keepSmallBlock && sourceIndex < lastNonEmptyIndex;
    result.push(buildVorbemerkungBodyPara(line, keepWithNext));
  }

  return result;
}

function buildVorbemerkungPage() {
  const rawText = loadVorbemerkungText();
  const blocks = rawText.split(/\r?\n[ \t]*\r?\n/).map((b) => b.trim()).filter((b) => b.length > 0);

  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Vorbemerkung', size: FORM_FONT_TITLE, bold: true, font: VORBEMERKUNG_FONT })],
      spacing: { before: 0, after: 70, line: FORM_LINE_SPACING },
      indent: { left: VORBEMERKUNG_LEFT_INDENT, right: VORBEMERKUNG_RIGHT_INDENT },
    }),
  ];

  // Ersten Block überspringen wenn er der Dokumenttitel ist (enthält "Vorbemerkungen")
  const startIndex =
    blocks.length > 0 && blocks[0].toLowerCase().includes('vorbemerkung') && !blocks[0].includes('\n') ? 1 : 0;

  for (let i = startIndex; i < blocks.length; i++) {
    children.push(...buildVorbemerkungBlock(blocks[i]));
  }

  return children;
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function parseArrayLike(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  const raw = value.trim();
  if (!raw) {
    return [];
  }

  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
      }
    } catch {
      // Fallback auf Trennzeichen-Parsing.
    }
  }

  return raw
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractAktiveSelektionen(query = {}) {
  let payload = null;

  if (typeof query.payload === 'string' && query.payload.trim()) {
    try {
      const parsedPayload = JSON.parse(query.payload);
      if (parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)) {
        payload = parsedPayload;
      }
    } catch {
      payload = null;
    }
  }

  const aktivePaketeRaw = [
    query.aktivePakete,
    query.aktivepakete,
    payload?.aktivePakete,
    payload?.aktivepakete,
  ];

  const aktiveBundlesRaw = [
    query.aktiveBundles,
    query.aktivebundles,
    payload?.aktiveBundles,
    payload?.aktivebundles,
  ];

  const aktivePakete = new Set(
    aktivePaketeRaw
      .flatMap((value) => parseArrayLike(value))
      .map((token) => normalizeToken(token))
      .filter(Boolean)
  );

  const aktiveBundles = new Set(
    aktiveBundlesRaw
      .flatMap((value) => parseArrayLike(value))
      .map((token) => normalizeToken(token))
      .filter(Boolean)
  );

  return {
    aktivePakete,
    aktiveBundles,
    hasSelections: aktivePakete.size > 0 || aktiveBundles.size > 0,
  };
}

async function createBoQDocxBuffer(query = {}) {
  const steuerung = loadAndValidateLv('steuerung.json');
  const antrieb = loadAndValidateLv('antrieb.json');
  const abnahme = loadAndValidateLv('abnahme.json');

  const { aktivePakete, aktiveBundles, hasSelections } = extractAktiveSelektionen(query);

  const lvEntries = [
    { id: normalizeToken(steuerung?.id || 'steuerung'), titel: String(steuerung?.titel || ''), lv: steuerung, force: true },
    { id: normalizeToken(antrieb?.id || 'antrieb'), titel: String(antrieb?.titel || ''), lv: antrieb, aliases: ['antrieb', 'antriebseinheit'], bundleAliases: ['drive'] },
    { id: normalizeToken(abnahme?.id || 'abnahme'), titel: String(abnahme?.titel || ''), lv: abnahme, force: true },
  ]
    .filter((entry) => {
      if (entry.force) {
        return true;
      }

      if (!hasSelections) {
        // Legacy-Fallback: Wenn keine Paket/Bündel-Selektion uebergeben wird,
        // werden vorhandene Zwischenpakete mit ausgegeben.
        return true;
      }

      const packageKeys = [entry.id, ...(entry.aliases || [])].map((token) => normalizeToken(token));
      const bundleKeys = (entry.bundleAliases || []).map((token) => normalizeToken(token));

      const paketAktiv = packageKeys.some((key) => aktivePakete.has(key));
      const bundleAktiv = bundleKeys.some((key) => aktiveBundles.has(key));
      return paketAktiv || bundleAktiv;
    });

  // Reihenfolge-Regel: Steuerung immer zuerst, Abnahme immer zuletzt, alles andere dazwischen.
  const rankMap = { steuerung: 0, abnahme: 2 };
  lvEntries.sort((a, b) => {
    const rankA = Object.hasOwn(rankMap, a.id) ? rankMap[a.id] : 1;
    const rankB = Object.hasOwn(rankMap, b.id) ? rankMap[b.id] : 1;
    const rankDiff = rankA - rankB;
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return a.titel.localeCompare(b.titel, 'de', { sensitivity: 'base' });
  });

  const deckblattChildren = buildDeckblatt(query);
  const formblattChildren = buildFormblatt(query);
  const technischeDatenChildren = buildTechnischeDatenPage(query);
  const vorbemerkungChildren = buildVorbemerkungPage();

  const lvChildren = lvEntries.flatMap((entry, index) => {
    const position = `${String(index + 1).padStart(2, '0')}.01`;
    const filterFn = entry.id === 'steuerung' ? hasRealModuleText : null;
    return buildPositionBlock(position, entry.lv, filterFn, index === 0);
  });

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            color: '000000',
            bold: true,
            underline: { type: UnderlineType.NONE },
            font: DOCX_FONT_FAMILY,
          },
          paragraph: {
            outlineLevel: 0,
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            color: '000000',
            bold: true,
            underline: { type: UnderlineType.NONE },
            font: DOCX_FONT_FAMILY,
          },
          paragraph: {
            outlineLevel: 1,
          },
        },
      ],
    },
    sections: [
      // Sektion 1: Deckblatt (eigene Seite)
      {
        properties: {
          page: {
            margin: {
              top: PAGE_MARGIN_TOP_BOTTOM,
              right: PAGE_MARGIN_LEFT_RIGHT,
              bottom: PAGE_MARGIN_TOP_BOTTOM,
              left: PAGE_MARGIN_LEFT_RIGHT,
            },
          },
        },
        children: deckblattChildren,
      },
      // Sektion 2: Angebots-/Formblatt (eigene Seite nach dem Deckblatt)
      {
        properties: {
          page: {
            margin: {
              top: FORM_PAGE_MARGIN_TOP_BOTTOM,
              right: PAGE_MARGIN_LEFT_RIGHT,
              bottom: FORM_PAGE_MARGIN_TOP_BOTTOM,
              left: PAGE_MARGIN_LEFT_RIGHT,
            },
          },
        },
        children: formblattChildren,
      },
      // Sektion 3: Technische Daten (eigene Seite)
      {
        properties: {
          page: {
            margin: {
              top: FORM_PAGE_MARGIN_TOP_BOTTOM,
              right: PAGE_MARGIN_LEFT_RIGHT,
              bottom: FORM_PAGE_MARGIN_TOP_BOTTOM,
              left: PAGE_MARGIN_LEFT_RIGHT,
            },
          },
        },
        children: technischeDatenChildren,
      },
      // Sektion 4: Vorbemerkung (eigene Seite, gleiche Breite wie LV)
      {
        properties: {
          page: {
            margin: {
              top: PAGE_MARGIN_TOP_BOTTOM,
              right: PAGE_MARGIN_LEFT_RIGHT,
              bottom: PAGE_MARGIN_TOP_BOTTOM,
              left: PAGE_MARGIN_LEFT_RIGHT,
            },
          },
        },
        children: vorbemerkungChildren,
      },
      // Sektion 5: LV-Positionen (beginnt automatisch auf neuer Seite)
      {
        properties: {
          page: {
            margin: {
              top: PAGE_MARGIN_TOP_BOTTOM,
              right: PAGE_MARGIN_LEFT_RIGHT,
              bottom: PAGE_MARGIN_TOP_BOTTOM,
              left: PAGE_MARGIN_LEFT_RIGHT,
            },
          },
        },
        children: lvChildren,
      },
    ],
  });

  try {
    return await Packer.toBuffer(doc);
  } catch (e) {
    const docxError = new Error('DOCX-Erzeugung fehlgeschlagen: ' + e.message);
    docxError.statusCode = 500;
    throw docxError;
  }
}

function getWordExportLvEntries(query = {}) {
  const steuerung = loadAndValidateLv('steuerung.json');
  const antrieb = loadAndValidateLv('antrieb.json');
  const abnahme = loadAndValidateLv('abnahme.json');

  const { aktivePakete, aktiveBundles, hasSelections } = extractAktiveSelektionen(query);

  const lvEntries = [
    { id: normalizeToken(steuerung?.id || 'steuerung'), titel: String(steuerung?.titel || ''), lv: steuerung, force: true },
    { id: normalizeToken(antrieb?.id || 'antrieb'), titel: String(antrieb?.titel || ''), lv: antrieb, aliases: ['antrieb', 'antriebseinheit'], bundleAliases: ['drive'] },
    { id: normalizeToken(abnahme?.id || 'abnahme'), titel: String(abnahme?.titel || ''), lv: abnahme, force: true },
  ]
    .filter((entry) => {
      if (entry.force) {
        return true;
      }

      if (!hasSelections) {
        // Legacy-Fallback: Wenn keine Paket/Buendel-Selektion uebergeben wird,
        // werden vorhandene Zwischenpakete mit ausgegeben.
        return true;
      }

      const packageKeys = [entry.id, ...(entry.aliases || [])].map((token) => normalizeToken(token));
      const bundleKeys = (entry.bundleAliases || []).map((token) => normalizeToken(token));

      const paketAktiv = packageKeys.some((key) => aktivePakete.has(key));
      const bundleAktiv = bundleKeys.some((key) => aktiveBundles.has(key));
      return paketAktiv || bundleAktiv;
    });

  // Reihenfolge-Regel: Steuerung immer zuerst, Abnahme immer zuletzt, alles andere dazwischen.
  lvEntries.sort((a, b) => {
    const rank = (entry) => {
      if (entry.id === 'steuerung') return 0;
      if (entry.id === 'abnahme') return 2;
      return 1;
    };

    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return a.titel.localeCompare(b.titel, 'de', { sensitivity: 'base' });
  });

  return lvEntries;
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cleanGaebDetailText(text) {
  if (!text) return '';

  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00ad/g, '')
    .replace(/([a-zäöüß])-\n([a-zäöüß])/gi, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\n([^\n])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function normalizeRequestForX83(req) {
  const query = req?.query && typeof req.query === 'object' ? req.query : {};
  const body = req?.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  return { ...query, ...body };
}

function buildMinimalX83XmlFromWordSource(query = {}) {
  const lvEntries = getWordExportLvEntries(query);
  const projektnummer = String(query.projektnummer || query.projektId || '').trim() || 'NR';
  const projektname = String(query.projektname || '').trim() || 'Projekt';
  const datum = new Date().toISOString().slice(0, 10);
  const versDate = '2021-05';
  const uhrzeit = new Date().toISOString().slice(11, 19);

  const buildParagraphsXml = (value, fallback = '') => {
    const raw = String(value || '').trim() || String(fallback || '').trim();
    if (!raw) {
      return '<p><span/></p>';
    }

    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (!lines.length) {
      return '<p><span/></p>';
    }

    return lines.map((line) => `<p><span>${escapeXml(line)}</span></p>`).join('');
  };

  const boqCategoriesXml = lvEntries
    .map((entry, titleIndex) => {
      const modules = Array.isArray(entry?.lv?.module) ? entry.lv.module : [];
      const titleLabel = entry.titel || entry.id || ('Titel ' + String(titleIndex + 1));
      const categoryNo = String(titleIndex + 1).padStart(2, '0');

      // Build combined DetailTxt from all modules: "01.01 Kurztext\n\nLangtext\n\n01.02 ..."
      const combinedDetail = modules
        .map((modul, index) => {
          const subNo = `${categoryNo}.${String(index + 1).padStart(2, '0')}`;
          const kurztext = String(modul?.titel || '').trim() || `${titleLabel} Position ${index + 1}`;
          const langtext = cleanGaebDetailText(modul?.text);
          return langtext ? `${subNo} ${kurztext}\n\n${langtext}` : `${subNo} ${kurztext}`;
        })
        .join('\n\n');

      const paketKurztext = `Paket ${titleLabel} komplett`;

      const itemsXml = [
        `          <Item ID="item-${escapeXml(categoryNo)}-0001" RNoPart="0001">`,
        '            <Qty>1</Qty>',
        '            <QU>Stk</QU>',
        '            <Description>',
        '              <CompleteText>',
        '                <DetailTxt>',
        `                  <Text>${buildParagraphsXml(paketKurztext + (combinedDetail ? '\n\n' + combinedDetail : ''), paketKurztext)}</Text>`,
        '                </DetailTxt>',
        '              </CompleteText>',
        '            </Description>',
        '          </Item>',
      ].join('\n');
      const fallbackTitle = 'Titel ' + String(titleIndex + 1);
      return [
        `        <BoQCtgy ID="ctgy-${escapeXml(categoryNo)}" RNoPart="${escapeXml(categoryNo)}">`,
        '          <LblTx>',
        `            ${buildParagraphsXml(titleLabel, fallbackTitle)}`,
        '          </LblTx>',
        '          <BoQBody>',
        '            <Itemlist>',
        itemsXml,
        '            </Itemlist>',
        '          </BoQBody>',
        '        </BoQCtgy>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">',
    '  <GAEBInfo>',
    '    <Version>3.3</Version>',
    `    <VersDate>${escapeXml(versDate)}</VersDate>`,
    `    <Date>${escapeXml(datum)}</Date>`,
    `    <Time>${escapeXml(uhrzeit)}</Time>`,
    '  </GAEBInfo>',
    '  <PrjInfo>',
    `    <NamePrj>${escapeXml(projektname)}</NamePrj>`,
    `    <LblPrj>${escapeXml(projektnummer)}</LblPrj>`,
    '    <Cur>EUR</Cur>',
    '    <CurLbl>Euro</CurLbl>',
    '  </PrjInfo>',
    '  <Award>',
    '    <DP>83</DP>',
    '    <AwardInfo>',
    '      <Cur>EUR</Cur>',
    '      <CurLbl>Euro</CurLbl>',
    '    </AwardInfo>',
    '    <BoQ ID="boq-1">',
    '      <BoQInfo>',
    '        <Name>1</Name>',
    '        <LblBoQ>Leistungsverzeichnis</LblBoQ>',
    '        <OutlCompl>AllTxt</OutlCompl>',
    '        <BoQBkdn>',
    '          <Type>BoQLevel</Type>',
    '          <Length>2</Length>',
    '          <Num>Yes</Num>',
    '        </BoQBkdn>',
    '        <BoQBkdn>',
    '          <Type>Item</Type>',
    '          <Length>4</Length>',
    '          <Num>Yes</Num>',
    '        </BoQBkdn>',
    '      </BoQInfo>',
    '      <BoQBody>',
    boqCategoriesXml,
    '      </BoQBody>',
    '    </BoQ>',
    '  </Award>',
    '</GAEB>',
  ].join('\n');
}

function handleX83TestExport(req, res) {
  try {
    console.log('--- X83 DEBUG START ---');
    console.log('Query:', req.query);
    console.log('Body:', req.body);
    console.log('URL:', req.url);
    console.log('--- X83 DEBUG END ---');

    const projektnummer = req.query.projektnummer || req.query.projektId || 'NR';
    const projektname = req.query.projektname || 'Projekt';
    const ort = req.query.ort || '';

    const requestData = {
      ...normalizeRequestForX83(req),
      projektnummer,
      projektname,
      ort,
    };
    const xmlString = buildMinimalX83XmlFromWordSource(requestData);

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="export.x83"');
    res.send(xmlString);
  } catch (e) {
    const statusCode = e && Number.isInteger(e.statusCode) ? e.statusCode : 500;
    console.error('[Export X83 Test] ' + (e?.message || e));
    res.status(statusCode).json({ error: e?.message || 'X83-Testexport fehlgeschlagen.' });
  }
}

function buildExportFilename(query) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const datum = `${yy}${mm}${dd}`;
  const uhrzeit = `${hh}${min}${ss}`;

  const sanitize = (str) =>
    String(str || '')
      .trim()
      .replaceAll(/[/\\:*?"<>|]/g, '')
      .replaceAll(/\s+/g, '_')
      .replaceAll(/_+/g, '_')
      .replaceAll(/^_|_$/g, '');

  const name = sanitize(query.projektname) || 'Projekt';
  const nummer = sanitize(query.projektnummer) || 'NR';

  return `${datum}_${uhrzeit}_${name}_${nummer}.docx`;
}

async function handleBoQWordDownload(req, res) {
  try {
    const buffer = await createBoQDocxBuffer(req.query);
    const filename = buildExportFilename(req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    const statusCode = e && Number.isInteger(e.statusCode) ? e.statusCode : 500;
    console.error('[Export BoQ] ' + e.message);
    res.status(statusCode).json({ error: e.message || 'Word-Export fehlgeschlagen.' });
  }
}

// Bestehender Endpunkt bleibt kompatibel und nutzt jetzt den kombinierten BoQ-Export.
app.get('/api/export/steuerung/docx', handleBoQWordDownload);

// Primaerer Download-Endpunkt fuer den kombinierten Word-Export.
app.get('/api/export/word/steuerung', handleBoQWordDownload);

app.post('/api/export-x83-test', handleX83TestExport);
app.get('/api/export-x83-test', handleX83TestExport);

// --- Supabase XL-Exports API ---

// Helper: Validate username
function validateUsername(username) {
  const allowedUsers = ['admin', 'testuser'];
  return allowedUsers.includes(username);
}

// Endpoint: List all XL exports for a user
// GET /api/xl-exports?username=admin
app.get('/api/xl-exports', async (req, res) => {
  try {
    const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'username erforderlich'
      });
    }

    if (!validateUsername(username)) {
      return res.status(403).json({
        success: false,
        error: 'Unbekannter Nutzer'
      });
    }

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Supabase nicht verfügbar'
      });
    }

    // Query Supabase
    const { data, error } = await supabase
      .from('xl_exports')
      .select('export_id,project_number,project_name,updated_at')
      .eq('username', username)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[XL-Exports] Abfragefehler:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Datenbankabfrage fehlgeschlagen'
      });
    }

    return res.status(200).json({
      success: true,
      exports: data || []
    });
  } catch (error) {
    console.error('[XL-Exports] Fehler:', error.message);
    res.status(500).json({
      success: false,
      error: 'Interner Fehler'
    });
  }
});

// Endpoint: Get single XL export detail
// GET /api/xl-exports/<exportId>?username=admin
app.get('/api/xl-exports/:exportId', async (req, res) => {
  try {
    const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
    const exportId = typeof req.params.exportId === 'string' ? req.params.exportId.trim() : '';

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'username erforderlich'
      });
    }

    if (!exportId) {
      return res.status(400).json({
        success: false,
        error: 'exportId erforderlich'
      });
    }

    if (!validateUsername(username)) {
      return res.status(403).json({
        success: false,
        error: 'Unbekannter Nutzer'
      });
    }

    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Supabase nicht verfügbar'
      });
    }

    // Query Supabase - get exact record
    const { data, error } = await supabase
      .from('xl_exports')
      .select('export_id,project_number,project_name,data')
      .eq('username', username)
      .eq('export_id', exportId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return res.status(404).json({
          success: false,
          error: 'Export nicht gefunden'
        });
      }
      console.error('[XL-Export-Detail] Abfragefehler:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Datenbankabfrage fehlgeschlagen'
      });
    }

    return res.status(200).json({
      success: true,
      export: data
    });
  } catch (error) {
    console.error('[XL-Export-Detail] Fehler:', error.message);
    res.status(500).json({
      success: false,
      error: 'Interner Fehler'
    });
  }
});

app.listen(port, () => {
  console.log(`BoQ Backend laeuft auf Port ${port}`);
});

