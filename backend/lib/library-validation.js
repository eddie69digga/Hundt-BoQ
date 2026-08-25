'use strict';

/**
 * Validierungsprozess fuer die strukturierte LV-Bibliothek (`backend/lv/bibliothek.json`) und die
 * Mappingregeln (`POSITION_MAPPING_RULES` in `backend/server.js`).
 *
 * Schritt I der Arbeitsphase (siehe docs/lv-architecture.md, Abschnitt 18): reine, seiteneffektfreie
 * Funktion, damit sie sowohl automatisiert testbar (backend/test/library-validation.test.js) als auch
 * spaeter vom Word-Importer (Schritt C) vor jedem Bulk-Import aufgerufen werden kann.
 *
 * `errors`: harte Verstoesse, die einen Import/eine Auslieferung verhindern muessen.
 * `warnings`: fachliche Hinweise/Berichte, die KEIN Fehler sind (z. B. ungenutzte Bibliothekseintraege,
 * auffaellig identische Texte) - siehe Architekturauftrag: "nicht zwingend als Fehler".
 */

const VALID_TYP = new Set(['Kategorie', 'Baustein', 'Variante', 'Unterbaustein', 'Unterabschnitt']);
const VALID_STATUS = new Set(['entwurf', 'bestaetigt', 'veraltet']);
const VALID_CONTENT_SOURCES = new Set(['bibliothek', 'static']);
const REQUIRED_FIELDS = ['id', 'struktur', 'kapitel', 'titel', 'typ', 'status'];

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function validateLibraryEntries(entries) {
  const errors = [];
  const warnings = [];

  const idCounts = new Map();
  for (const entry of entries) {
    const id = entry?.id;
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      errors.push(`Doppelte Bibliotheks-ID: "${id}" kommt ${count}x vor.`);
    }
  }

  for (const entry of entries) {
    const label = entry?.id || '(ohne ID)';

    for (const field of REQUIRED_FIELDS) {
      if (!entry?.[field]) {
        errors.push(`Eintrag ${label}: Pflichtfeld "${field}" fehlt.`);
      }
    }

    // Kategorie-Eintraege (reine Kapitelueberschriften) duerfen ohne Fliesstext bleiben.
    if (entry?.typ !== 'Kategorie' && !entry?.text) {
      errors.push(`Eintrag ${label}: Pflichtfeld "text" fehlt (Typ "${entry?.typ}").`);
    }

    if (entry?.typ && !VALID_TYP.has(entry.typ)) {
      errors.push(`Eintrag ${label}: ungueltiger typ "${entry.typ}".`);
    }

    if (entry?.status && !VALID_STATUS.has(entry.status)) {
      errors.push(`Eintrag ${label}: ungueltiger status "${entry.status}".`);
    }

    if (entry?.struktur && entry?.kapitel && !entry.struktur.startsWith(entry.kapitel)) {
      errors.push(`Eintrag ${label}: kapitel "${entry.kapitel}" passt nicht zum ersten Segment von struktur "${entry.struktur}".`);
    }
  }

  // Auffaellig identische Texte (Bericht, kein Fehler).
  const textMap = new Map();
  for (const entry of entries) {
    if (!entry?.text) {
      continue;
    }
    const norm = normalizeText(entry.text);
    if (!textMap.has(norm)) {
      textMap.set(norm, []);
    }
    textMap.get(norm).push(entry.id);
  }
  for (const ids of textMap.values()) {
    if (ids.length > 1) {
      warnings.push(`Auffaellig identischer Text in mehreren Bibliothekseintraegen: ${ids.join(', ')}.`);
    }
  }

  return { errors, warnings };
}

function validateMappingRules(rules, { entries = [], staticPackages = {} } = {}) {
  const errors = [];
  const warnings = [];

  const idSet = new Set(entries.map((entry) => entry?.id));
  const mappedRules = rules.filter((rule) => rule.status === 'mapped');

  for (const rule of rules) {
    const label = rule.groupKey || '(ohne groupKey)';

    if (typeof rule.technicalCondition !== 'function') {
      errors.push(`Regel ${label}: technicalCondition ist keine Funktion (ungueltige Variantenbedingung).`);
    }

    if (rule.status !== 'mapped') {
      continue;
    }

    if (!rule.bibliotheksId) {
      errors.push(`Regel ${label}: status "mapped" ohne bibliotheksId.`);
      continue;
    }

    if (!VALID_CONTENT_SOURCES.has(rule.contentSource)) {
      errors.push(`Regel ${label}: unbekannte contentSource "${rule.contentSource}".`);
      continue;
    }

    if (rule.contentSource === 'bibliothek' && !idSet.has(rule.bibliotheksId)) {
      errors.push(`Regel ${label}: bibliotheksId "${rule.bibliotheksId}" existiert nicht in der Bibliothek (Waisen-Mapping).`);
    }

    if (rule.contentSource === 'static') {
      if (!rule.staticEntryId || !rule.staticModuleId) {
        errors.push(`Regel ${label}: contentSource "static" ohne staticEntryId/staticModuleId (Granularitaetsrisiko).`);
      } else {
        const sourceLv = staticPackages[rule.staticEntryId];
        if (!sourceLv) {
          errors.push(`Regel ${label}: statisches Paket "${rule.staticEntryId}" nicht gefunden.`);
        } else {
          const modules = Array.isArray(sourceLv.module) ? sourceLv.module : [];
          const hasModule = modules.some((m) => m?.id === rule.staticModuleId);
          if (!hasModule) {
            errors.push(`Regel ${label}: Modul "${rule.staticModuleId}" nicht in Paket "${rule.staticEntryId}" gefunden (Waisen-Mapping).`);
          }
        }
      }
    }
  }

  // Doppelte/ueberlappende Regeln: derselbe Components-Key in mehreren "mapped"-Regeln.
  const componentIdToRules = new Map();
  for (const rule of mappedRules) {
    for (const cid of rule.componentsIds || []) {
      if (!componentIdToRules.has(cid)) {
        componentIdToRules.set(cid, []);
      }
      componentIdToRules.get(cid).push(rule);
    }
  }
  for (const [cid, rulesForId] of componentIdToRules) {
    if (rulesForId.length > 1) {
      warnings.push(
        `Components-Key "${cid}" ist in ${rulesForId.length} Mapping-Regeln vertreten (${rulesForId
          .map((r) => r.groupKey)
          .join(', ')}) - pruefen, ob sich die technicalCondition-Werte gegenseitig ausschliessen.`
      );
    }
  }

  // Mehrere unterschiedliche Regeln auf dieselbe Ziel-Bibliotheks-ID (Bericht: architekturell
  // erlaubt/gewollt bei n:1, aber pruefenswert, ob die Bedingungen sich wirklich ausschliessen).
  const bibliotheksIdToRules = new Map();
  for (const rule of mappedRules) {
    if (!rule.bibliotheksId) {
      continue;
    }
    if (!bibliotheksIdToRules.has(rule.bibliotheksId)) {
      bibliotheksIdToRules.set(rule.bibliotheksId, []);
    }
    bibliotheksIdToRules.get(rule.bibliotheksId).push(rule);
  }
  for (const [bibliotheksId, rulesForId] of bibliotheksIdToRules) {
    const distinctGroupKeys = new Set(rulesForId.map((r) => r.groupKey));
    if (distinctGroupKeys.size > 1) {
      warnings.push(
        `Ziel-Bibliotheks-ID "${bibliotheksId}" wird von ${distinctGroupKeys.size} unterschiedlichen Regeln adressiert (${[...distinctGroupKeys].join(', ')}).`
      );
    }
  }

  // Bibliothekseintraege ohne Verwendung (Bericht, kein Fehler). Ein Bibliothekseintrag gilt bereits
  // als verwendet, wenn irgendeine "mapped"-Regel auf seine ID zeigt - unabhaengig von contentSource
  // (auch `static`-Regeln referenzieren eine Bibliotheks-ID als Ziel, siehe docs/lv-architecture.md).
  const usedBibliotheksIds = new Set(mappedRules.map((r) => r.bibliotheksId).filter(Boolean));
  for (const entry of entries) {
    if (entry?.typ === 'Baustein' && !usedBibliotheksIds.has(entry.id)) {
      warnings.push(`Bibliothekseintrag "${entry.id}" ("${entry.titel}") wird von keiner Mapping-Regel verwendet.`);
    }
  }

  return { errors, warnings };
}

// Fuehrt beide Pruefungen zusammen aus und liefert ein einziges konsolidiertes Ergebnis.
function validateLibrary({ entries = [], rules = [], staticPackages = {} } = {}) {
  const entryResult = validateLibraryEntries(entries);
  const ruleResult = validateMappingRules(rules, { entries, staticPackages });

  return {
    errors: [...entryResult.errors, ...ruleResult.errors],
    warnings: [...entryResult.warnings, ...ruleResult.warnings],
  };
}

module.exports = {
  validateLibrary,
  validateLibraryEntries,
  validateMappingRules,
};
