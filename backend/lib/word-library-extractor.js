'use strict';

/**
 * Word-Bibliothek-Extraktor (Schritt C, Grundlage fuer den kontrollierten Importprozess).
 *
 * Liest `docs/260824_LV_Bibliothek_Components_modular.docx` und extrahiert alle strukturierten
 * Bibliothekseintraege anhand der in der Word-Datei bereits vorhandenen, maschinenlesbaren
 * Metadatenzeile (Absatzformat "LVBibliothekMetadaten"): "Struktur <nr> | Typ <typ> |
 * Bibliotheks-ID <id>", die direkt unter jeder Baustein-/Kategorie-/Varianten-Ueberschrift steht.
 *
 * Der Extraktor trifft KEINE fachlichen Entscheidungen: er liest nur, was in der Word-Datei bereits
 * explizit als Struktur/Typ/ID/Titel/Text vorhanden ist. Keine Mappingentscheidungen, kein Erraten
 * von Varianten, keine Umformulierung von Text.
 */

const JSZip = require('jszip');

function decodeXmlText(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Zerlegt das rohe word/document.xml in eine flache Liste von Absaetzen {style, text}.
function parseParagraphs(documentXml) {
  const paraRegex = /<w:p( [^>]*)?>([\s\S]*?)<\/w:p>/g;
  const paragraphs = [];
  let match;

  while ((match = paraRegex.exec(documentXml)) !== null) {
    const body = match[2];
    const styleMatch = body.match(/<w:pStyle w:val="([^"]+)"/);
    const style = styleMatch ? styleMatch[1] : null;
    const textMatches = [...body.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]);
    const text = decodeXmlText(textMatches.join(''));
    paragraphs.push({ style, text });
  }

  return paragraphs;
}

const METADATA_STYLE = 'LVBibliothekMetadaten';
const METADATA_LINE_RE = /Struktur\s*([^|]+?)\s*\|\s*Typ\s*([^|]+?)\s*\|\s*Bibliotheks-ID\s*([A-Za-z0-9_]+)/;

// Findet den Titel eines Eintrags: den naechsten nicht-leeren Absatz VOR der Metadatenzeile.
function findTitleBefore(paragraphs, metaIndex) {
  for (let i = metaIndex - 1; i >= 0; i -= 1) {
    const text = paragraphs[i].text.trim();
    if (text) {
      return text;
    }
    // Nicht weiter als bis zur vorherigen Metadatenzeile zurueckscannen (sonst koennte der Titel
    // eines vorherigen Eintrags faelschlich uebernommen werden, falls der aktuelle Titel fehlt).
    if (paragraphs[i].style === METADATA_STYLE) {
      break;
    }
  }
  return '';
}

// Baut den Fliesstext eines Eintrags: alle Absaetze zwischen der Metadatenzeile (exklusive) und dem
// naechsten Eintrag (naechste Metadatenzeile, exklusive deren Titel-Absatz).
function extractBodyText(paragraphs, metaIndex, nextMetaIndex) {
  const bodyEndExclusive = nextMetaIndex === -1 ? paragraphs.length : nextMetaIndex - 1;
  const lines = [];

  for (let i = metaIndex + 1; i < bodyEndExclusive; i += 1) {
    // Word speichert gelegentlich ein trailing Leerzeichen im letzten Textlauf eines Absatzes
    // (rein layoutbedingt, keine fachliche Aussage) - trimEnd() entfernt das, ohne echte
    // Einrueckungen (z. B. Tabulatoren fuer Parameterzeilen) anzutasten.
    lines.push(paragraphs[i].text.replace(/[ \t]+$/, ''));
  }

  while (lines.length && lines[0] === '') {
    lines.shift();
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Extrahiert alle Bibliothekseintraege aus dem rohen document.xml. Liefert das Roh-Schema
// (id, struktur, kapitel, kategorie, titel, typ, text) - status wird bewusst NICHT hier gesetzt
// (das ist Sache des Importers, nicht des Extraktors: reines Auslesen vs. Import-Entscheidung).
function extractLibraryEntriesFromXml(documentXml) {
  const paragraphs = parseParagraphs(documentXml);
  const metaIndexes = [];

  for (let i = 0; i < paragraphs.length; i += 1) {
    if (paragraphs[i].style === METADATA_STYLE) {
      metaIndexes.push(i);
    }
  }

  const rawEntries = metaIndexes.map((metaIndex, position) => {
    const metaText = paragraphs[metaIndex].text;
    const parsed = metaText.match(METADATA_LINE_RE);
    const nextMetaIndex = position + 1 < metaIndexes.length ? metaIndexes[position + 1] : -1;

    return {
      struktur: parsed ? parsed[1].trim() : null,
      typ: parsed ? parsed[2].trim() : null,
      id: parsed ? parsed[3].trim() : null,
      titel: findTitleBefore(paragraphs, metaIndex),
      text: extractBodyText(paragraphs, metaIndex, nextMetaIndex),
    };
  });

  // Kategorie-IDs je Kapitel (erstes Struktur-Segment) fuer die kategorie-Referenz der uebrigen Typen.
  const kategorieIdByKapitel = new Map();
  for (const entry of rawEntries) {
    if (entry.typ === 'Kategorie' && entry.struktur) {
      kategorieIdByKapitel.set(entry.struktur, entry.id);
    }
  }

  return rawEntries.map((entry) => {
    const kapitel = entry.struktur ? entry.struktur.split('.')[0] : null;
    return {
      id: entry.id,
      struktur: entry.struktur,
      kapitel,
      kategorie: entry.typ === 'Kategorie' ? null : kategorieIdByKapitel.get(kapitel) || null,
      titel: entry.titel,
      typ: entry.typ,
      text: entry.text,
    };
  });
}

async function extractLibraryEntriesFromDocxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) {
    throw new Error('word/document.xml nicht in der DOCX-Datei gefunden.');
  }
  const documentXml = await documentXmlFile.async('string');
  return extractLibraryEntriesFromXml(documentXml);
}

module.exports = {
  parseParagraphs,
  extractLibraryEntriesFromXml,
  extractLibraryEntriesFromDocxBuffer,
};
