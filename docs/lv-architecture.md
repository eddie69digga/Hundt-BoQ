# LV-Architektur und aktueller Datenfluss

Dieser Abschnitt dokumentiert den aktuellen IST-Zustand, soweit er aus dem Projekt und den vorhandenen Dateien nachvollziehbar ist. Unklare oder noch nicht abgestimmte Punkte sind als `offen` markiert.

Die zentrale fachliche Begriffs- und Mappinggrundlage für einzelne Components-Keys ↔ LV-Bibliotheks-IDs liegt in `docs/components-boq-begriffsmatrix.md` und wird dort als lebendes Dokument gepflegt (nicht hier dupliziert).

## 1. Aktueller Datenfluss Components → BoQ

Der vorhandene, produktiv getestete Handoff läuft im Wesentlichen so:

1. Components erzeugt einen Cloud-/XL-Export.
2. Die Exportdaten werden pro Nutzer in Supabase gespeichert.
3. BoQ öffnet nach erfolgreichem Login die verfügbaren Exports.
4. Der Nutzer wählt einen Export aus (`export_id` + `username`).
5. Das Frontend lädt die Daten aus `xl_exports` und verarbeitet den Import.
6. In der BoQ-UI werden Projekt-, Paket- und Positionsdaten für den Nutzer dargestellt.
7. Beim Word-Export werden die vorhandenen LV-Pakete aus dem Backend zusammengebaut.

Im aktuellen Code sind die wichtigsten Strukturen im Frontend sichtbar:

- `data.kalkulation.paketSummen`
- `data.kalkulation.lvPositionen`
- `data.kalkulation.lvTextKey`

Diese Strukturen zeigen an, dass Components bereits eine kalkulatorische Paket-/Positionsstruktur bereitstellt, aber die spätere Umwandlung in ein fachlich sauberes LV-Muster noch nicht vollständig umgesetzt ist.

## 2. `paketSummen`

`paketSummen` werden im Frontend als Paketüberblick verwendet. Dort wird eine Zusammenfassung der aktiven Pakete und ihrer Positionen aus der geladenen Kalkulationsstruktur aufgebaut.

Wesentlicher Zweck im aktuellen Stand:

- Paketgruppen im Frontend rendern
- Hinweise auf aktive Pakete visualisieren
- Fallback zu vorhandenen Paketpositionen bilden, falls innerhalb von `lvPositionen` keine komplette Struktur vorliegt

Im Code wird `paketSummen` als Array von Einträgen mit mindestens:

- `paket`
- `positionen`

interpretiert. Der Frontend-Import versucht daraus eine sinnvolle Paket-/Positionsstruktur aufzubauen, falls `lvPositionen` nicht vollständig vorliegen.

`offen`: Wie vollständig und stabil die von Components gelieferten `paketSummen` in Zukunft für eine LV-Textlogik nutzbar sein werden, ist noch nicht abgeschlossen.

## 3. `lvPositionen`

`lvPositionen` sind die zentrale Positionsstruktur aus der Kalkulation. Im Frontend werden sie in Gruppen nach Paket aufbereitet und als detaillierte Positionen dargestellt.

Funktionen im aktuellen Stand:

- Gruppierung nach Paket
- Anzeige von ID, Bezeichnung, Menge, Einheit und `lvTextKey`
- Erkennen von Paketen aus der geladenen Kalkulation
- Fallbacks, wenn `lvPositionen` leer oder unvollständig sind

Ein typischer Datensatz enthält Strukturelemente wie:

- `id`
- `paket`
- `bezeichnung`
- `anzahl`
- `einheit`
- `lvTextKey`

Dieser Stand zeigt bereits den richtigen technischen Ansatz: Es wird versucht, eine positionale Datenbasis für die LV-Erzeugung zu erhalten. Allerdings bleibt die fachliche Verbindung zur finalen LV-Texterzeugung noch unvollständig.

## 4. `lvTextKey`

`lvTextKey` ist im Frontend als Schlüssel für den LV-Text sichtbar. Er wird in der Positionsübersicht angezeigt und dient als Hinweis darauf, welche fachliche Textquelle zur Position gehören sollte.

Aktueller Nutzen:

- Positions-zu-Text-Verknüpfung sichtbar machen
- Debugging zur Erkennung fehlender oder falscher Mappings
- Analyse des Input-Data-Pipelines

Wichtig ist hier der aktuelle fachliche Befund:

- Die Struktur existiert bereits.
- Die fachliche und stabile Zuordnung zu konkreten LV-Textbausteinen ist aber noch nicht sauber gelöst.

`offen`: Die genaue, langfristige Definition von `lvTextKey` als verbindliche Quelle für LV-Bibliotheks-IDs ist noch offen.

## 5. Bestehende statische LV-Dateien

Das Backend lädt derzeit vor allem statische LV-Paketdateien aus `backend/lv`:

- `steuerung.json`
- `antrieb.json`
- `abnahme.json`
- `vorbemerkung.txt`

Diese Dateien bilden den aktuellen Basisbestand für die Word-Erzeugung. Jeder Eintrag in den JSON-Dateien enthält typischerweise:

- `id`
- `titel`
- `kurztext`
- `mengeneinheit`
- `fliesstext`
- `module[]`

Beispiel aus `backend/lv/antrieb.json`:

- `id: "antrieb"`
- `titel: "Antriebseinheit"`
- Modul `antrieb_seil` mit Textbeginn `MRL - Seil Synchron`

Damit ist der aktuelle Zustand fachlich klar nachvollziehbar: Der Text stammt aus einer statischen Paketdatei und nicht aus einer positionsbezogenen, fallbezogenen Logik.

## 6. Aktuelles Word-Export-Verhalten

Der Word-Export wird im Backend über `createBoQDocxBuffer` und die Endpunkte `POST /api/export/word/steuerung` (primär) bzw. `POST /api/export/steuerung/docx` ausgelöst. Die GET-Varianten bleiben aus Kompatibilitätsgründen erhalten.

Der aktuelle Ablauf:

1. Das Frontend sendet die vollständige Kalkulationsstruktur (`currentData`, inkl. `kalkulation.paketSummen[*].positionen`) im POST-Body unter dem Feld `data`.
2. `getWordExportLvEntries(query)` bzw. `createBoQDocxBuffer(query)` prüfen zuerst über `buildPositionMappingReport`, ob positive Positionsdaten vorhanden sind.
3. Liegen positive Positionen vor, wird ausschließlich `resolveMappedStaticLvEntries` verwendet: Es werden nur die durch die Mappingregeln bestätigten statischen Einträge (`steuerung`, `abnahme`) ausgewählt; `antrieb` (mit dem Seil-/MRL-Text) wird in diesem Modus grundsätzlich ausgeschlossen, unabhängig von `aktivePakete`/`aktiveBundles`.
4. Fehlen positive Positionsdaten (bei einem GET-Request ohne Body oder bei alten Datensätzen), greift der Legacy-Pfad: `extractAktiveSelektionen(query)` entscheidet, welche Pakete aktiv sind, und alle Standardpakete (Steuerung, Antrieb, Abnahme) werden nach der bisherigen Logik zusammengeführt.
5. `buildMinimalX83XmlFromWordSource` bzw. `createBoQDocxBuffer` bauen daraus das Word-/XML-Dokument.

Wesentlicher Effekt:

- Im positionsgenauen Modus ist der ausgegebene Text an die tatsächlich bestätigten Bibliotheks-Mappings gekoppelt; ein fachlich falscher Seil-/MRL-Antriebstext bei Hydraulikanlagen kann nicht mehr entstehen.
- Der Legacy-Pfad bleibt ausschließlich für Altdaten ohne geeignete Positionsstruktur bestehen.

## 6a. Bekannte frühere Fehlerursache (behoben)

Der Word-Export-Button im Frontend (`triggerSteuerungWordExport`) übermittelte ursprünglich nur Formular-/Deckblattfelder sowie `technik_json` als GET-Query-Parameter, nicht aber `kalkulation.paketSummen`. Dadurch erkannte `readPositiveComponentsFromQuery` niemals positive Positionen, `shouldUsePositionMapping` blieb `false`, und der Export lief immer über den Legacy-Fallback ohne aktive Paket-/Bündel-Selektion – dieser gibt standardmäßig alle Pakete inklusive des statischen `antrieb.json` (Seil-/MRL-Text) aus. Das erklärte, warum trotz korrekt erkannter Hydraulik-Technik weiterhin `Antrieb Seil` / `MRL - Seil Synchron` im Dokument erschien.

Behoben durch:

- Umstellung des Frontend-Exports auf `POST` mit der vollständigen `currentData`-Struktur im Body (Feld `data`).
- Backend-Endpunkte akzeptieren jetzt zusätzlich `POST` und verschmelzen Query und Body (`mergeWordExportRequestData`).
- `resolveMappedStaticLvEntries` schließt `antrieb` explizit aus, sobald positive Positionsdaten vorliegen (`sameExportPositionMode`).

## 7. Bekannte Brüche im Datenfluss

Der zentrale bekannte Bruch ist:

`Kalkulationsstruktur != LV-Struktur`

Konkrete Auswirkungen:

- `lvPositionen` und `paketSummen` sind nicht automatisch mit der LV-Texterzeugung identisch
- Fachliche Varianten (Hydraulik vs. Seil) sind derzeit über feste Pakettexte und Fallbacks abgebildet
- 0-Mengen oder nicht relevante Kalkulationspositionen können mit falschen LV-Texten in Verbindung gebracht werden
- Mehrere Kalkulationspositionen können auf einen gemeinsamen LV-Baustein führen, ohne dass die Logik dies explizit modelliert
- Fehlende Mappings werden derzeit nicht mit `offen` behandelt, sondern über Fallback-Text ersetzt

## 8. Zielbild einer positionsgenauen LV-Erzeugung

Das gewünschte Zielbild ist eine sachlich saubere, datengetriebene LV-Erzeugung:

- Components liefert echte positionsgenaue Daten
- relevante positive Positionen werden identifiziert
- daraus werden fachlich passende LV-Bausteine ausgewählt
- 0-Mengen erzeugen keinen konkreten Text
- Varianten werden anhand der spezifischen Technik/Anlage aufgelöst
- fehlende Mappings werden als `offen` bzw. explizit behandelt, nicht mit Fallbacks vertuscht

Das Ziel ist nicht, statische Paketdateien vollständig zu entfernen, sondern die fachlichen Aussagen aus der Bibliothek und den positionenbasierten Daten sauber miteinander zu verbinden.

## 9. Positionsgenauer Modus und Bibliotheks-Mapping

Der produktive Export unterscheidet seit dem aktuellen Stand zwischen zwei Modi:

- positionsgenauer Modus: aktiv, sobald positive Positionen aus `kalkulation.paketSummen[*].positionen` vorliegen
- Legacy-Modus: nur aktiv, wenn keine passende Positionsstruktur verfügbar ist

Im positionsgenauen Modus gelten die folgenden Regeln:

- nur Mengen > 0 werden berücksichtigt
- die technische Kontextprüfung erfolgt aus `technischeParameter`, `projekt` und `aufzugstyp` / `projektart`
- die Zuordnung läuft auf bestätigte Bibliotheks-IDs
- gleiche Ziel-LV-ID werden dedupliziert
- nicht bekannte Positionen verbleiben als `open`
- kein statischer Paket-Fallback mehr innerhalb neuer Components-Exporte
- kein Seil-/MRL-Fallback bei Hydraulik

Bestätigte Mappings (`bibliotheksId` → `contentSource`):

- `hydraulikschlauch` + `hydraulikoel` → `LV_14_05_HYDRAULIKSCHLAUCHE_UND_HYDRAULIKOL` (`bibliothek`)
- `steuerung` → `LV_12_02_STEUERUNG` (`static`, Paket `steuerung.json`)
- `fahrkorbtableau` → `LV_10_20_FAHRKORBTABLEAU_VERTIKAL` (`static`, Paket `steuerung.json`)
- `aussenruftableau` → `LV_11_16_BEFEHLSGEBER_AUSSENRUF` (`static`, Paket `steuerung.json`)
- `standanzeige` → `LV_11_20_STAND_UND_WEITERFAHRTANZEIGE_AUSSEN` (`static`, Paket `steuerung.json`)
- `schachtbeleuchtung` → `LV_09_02_SCHACHTBELEUCHTUNG` (`static`, Paket `steuerung.json`)
- `kabelkanaele` → `LV_09_01_SCHACHTINSTALLATION_ELEKTRO` (`static`, Paket `steuerung.json`)
- `anstrich_schachtgrube` → `LV_07_05_MALERARBEITEN_SCHACHTGRUBE` (`bibliothek`)
- `zues_kosten_vorpruefung` + `zues_kosten_abnahme` + `zues_begleitung_durch_an_aufzug` + `pruefgewichte` → `LV_02_07_INVERKEHRBRINGUNG_INBETRIEBNAHME_PVI` (`static`, Paket `abnahme.json`) bei `projektart = Teilmodernisierung`
- `transport_allgemein_baustelle_lager` → `LV_02_09_TRANSPORT_UND_BAUSTELLENEINRICHTUNG` (`bibliothek`) bei `projektart = Teilmodernisierung`

`contentSource: 'static'` bedeutet: Der Bibliotheks-Baustein ist bereits real als EINZELNES Modul in `steuerung.json` bzw. `abnahme.json` enthalten. Jede Regel mit `contentSource: 'static'` traegt zusaetzlich `staticModuleId` (die Modul-`id` innerhalb des Pakets). Aufgeloest wird ausschliesslich GENAU DIESES EINE Modul als eigene LV-Position - niemals das gesamte statische Paket.

`contentSource: 'bibliothek'` bedeutet: Es existiert KEIN passendes Modul in den statischen Paketen (insbesondere `antrieb.json` enthaelt ausschliesslich den Seil-/MRL-Text und darf hierfuer nicht verwendet werden). Der Baustein wird stattdessen dediziert aus `backend/lv/bibliothek.json` aufgeloest und als eigene LV-Position ausgegeben.

Offen bleiben:

- `maschine_standardrahmen`
- `tuerfuehrungen`
- `tuerlaufrollen`
- `tuerkontakte`
- `tuerseile`
- `teil_umbaukit_schiebetueren`

Die Legacy-Abgrenzung ist bewusst und technisch sauber: Wenn kein neues Components-Export mit passender Positionsbasis vorliegt, kann die bisherige statische LV-Logik weiterverwendet werden. Bei einem echten Components-Export mit positiven Positionen ist dieser statische Fallback jedoch nicht mehr erlaubt (auch nicht als leerer Rueckfall, wenn eine Bibliotheks-ID sich nicht aufloesen laesst).

### 9.1 Behobenes Granularitaetsproblem (Schritt E)

Bis zur Korrektur wurde bei `contentSource: 'static'` das GESAMTE statische Paket (`steuerung.json` mit allen ~20 Modulen bzw. `abnahme.json`) dedupliziert unter dem Paket-Schluessel (`staticEntryId`, `steuerung`) eingefuegt, sobald IRGENDEINE der 6 auf dasselbe Paket zeigenden Regeln (`steuerung`, `fahrkorbtableau`, `aussenruftableau`, `standanzeige`, `schachtbeleuchtung`, `kabelkanaele`) positiv war. Dadurch erschienen automatisch auch nicht bestaetigte, nicht positive Module desselben Pakets im LV (Frequenzumrichter/Regelung, Lastmesssystem, Schaltschrank, Brandfallsteuerung, Schachtkopierung, Parkhaltestelle) - ein Verstoss gegen `Kalkulationsstruktur != LV-Struktur`.

Fix (`backend/server.js`, `resolveMappedStaticLvEntries()` / `resolveStaticModuleEntryAsLv()`):

- Jede Regel mit `contentSource: 'static'` traegt jetzt `staticModuleId` (das genaue Modul innerhalb des Pakets, `schachtbeleuchtung` → Modul-ID `schachtbeleuchtung`, `aussenruftableau` → Modul-ID `befehlsgeber_aussenruf`).
- Aufgeloest wird ein synthetisches LV-Objekt mit genau diesem einen Modul (analog zu `resolveBibliothekEntryAsLv()`), nicht mehr das komplette Paket.
- Dedupliziert wird ausschliesslich ueber die Ziel-Bibliotheks-ID (`bibliotheksId`), nicht mehr ueber den Paket-Schluessel. Dadurch fuehren mehrere Regeln, die auf dasselbe Paket zeigen (alle 6 Steuerung-Positionen), zu jeweils EIGENEN LV-Positionen, wenn sie einzeln positiv sind - und zu GAR KEINER Ausgabe, wenn sie es nicht sind.
- Fachlich richtige Ausgaben bleiben erhalten: Der Modultext in `steuerung.json`/`abnahme.json` ist inhaltlich identisch mit dem entsprechenden `backend/lv/bibliothek.json`-Eintrag (verifiziert; einzige Unterschiede sind Tabulatur-Formatierung ohne Renderingauswirkung sowie ein Anfuehrungszeichen-Encoding-Artefakt bei `fahrkorbtableau_vertikal`).
- Abgesichert durch `backend/test/granularity-contract.test.js` (positive Granularitaet, Negativpruefung auf DOCX-Ebene mit eindeutigen Textfragmenten, Dedup-Pruefung, Vollstaendigkeitspruefung fuer alle 6 Steuerung-Positionen, Offen-Pruefung ohne erfundenen Ersatztext).

## 9a. Bibliotheksresolver (`backend/lv/bibliothek.json`)

Fuer Bibliotheks-IDs ohne passendes Modul in den statischen Paketen (`LV_14_05_HYDRAULIKSCHLAUCHE_UND_HYDRAULIKOL`, `LV_07_05_MALERARBEITEN_SCHACHTGRUBE`, `LV_02_09_TRANSPORT_UND_BAUSTELLENEINRICHTUNG`) existiert ein dedizierter Bibliotheksresolver:

- Quelle: `docs/260824_LV_Bibliothek_Components_modular.docx` (Titel + Fliesstext je Bibliotheks-ID, wortgetreu uebernommen, nicht umformuliert).
- Kompilat: `backend/lv/bibliothek.json` (Objekt keyed nach Bibliotheks-ID mit `titel` und `text`).
- Zugriff im Code: `loadBibliothek()` / `resolveBibliothekEntryAsLv(bibliotheksId)` in `backend/server.js`.
- `backend/lv/bibliothek.json` enthaelt zusaetzlich Titel/Text fuer alle 10 bestaetigten IDs (auch die `static`-Faelle), damit der Contract-Test (siehe unten) fuer jede ID eine kanonische, aus der Bibliothek stammende Referenz zum Abgleich hat - unabhaengig davon, ob der eigentliche Exporttext aus dem statischen Paket oder aus der Bibliothek stammt.

Bekannter, bereits behobener Fehler: Bis zur Korrektur wurde `contentSource` zwar in den Mapping-Regeln definiert, aber beim Aufbau von `mapped` in `buildPositionMappingReport()` nicht in den Report kopiert. Dadurch griff `resolveMappedStaticLvEntries()` fuer alle Regeln implizit auf den `static`-Zweig zurueck, und `staticEntryId: null` fuehrte dazu, dass `LV_14_05`, `LV_07_05` und `LV_02_09` in der Export-Auswahl komplett fehlten (nicht durch falschen Text ersetzt, sondern schlicht nicht vorhanden). Fix: `contentSource: rule.contentSource` wird jetzt explizit in jeden `mapped`-Eintrag geschrieben.

## 9b. Contract-Test-Standard (verbindlich fuer positionsgenaue LV-Exporte)

Für positionsgenaue LV-Exporte gilt ab sofort ein verschärfter Teststandard. `gruen` bedeutet NICHT:

- HTTP 200
- DOCX vorhanden
- Stichprobe (einzelne Substring-Treffer) okay

`gruen` bedeutet:

- vollständiger Soll-Ist-Abgleich aller bestätigten Mapping-IDs
- offene Positionen nachvollziehbar
- Negativliste (Seil/MRL) bestanden
- keine erwartete gemappte Position geht verloren

Umgesetzt in `backend/test/mapping-contract.test.js` (`npm test` im Verzeichnis `backend/`), geprüft in 5 Stufen gegen den realen Referenzfall Berghof (`docs/260824_Berghof_Luetjensee_Aufzug_155180_datenexport_XL (3).json`):

- **Stufe A (Input):** positive Positionen aus `kalkulation.paketSummen[*].positionen` sowie technischer Kontext (`aufzugstyp = hydraulik`) werden erkannt.
- **Stufe B (Mapping):** `buildPositionMappingReport()` liefert alle 10 bestätigten Ziel-LV-IDs in `mapped`; die 6 bewusst offenen Components-Positionen erscheinen korrekt in `open`.
- **Stufe C (Resolution):** `resolveMappedStaticLvEntries()` löst jede der 10 IDs tatsächlich in ein Modul mit dem kanonischen Bibliotheks-Titel auf (Abgleich gegen `backend/lv/bibliothek.json`); kein `antrieb`-Eintrag (Seil/MRL) in der Auswahl.
- **Stufe D (Export):** Steuerung und Abnahme sind in der finalen Word-Export-Auswahl enthalten.
- **Stufe E (DOCX-Inhalt):** Das erzeugte DOCX enthält für jede der 10 IDs den kanonischen Titel als Text; die Seil-/MRL-Negativliste ist vollständig abwesend.

Schlägt eine Stufe fehl, benennt der Test explizit, auf welcher Stufe der Datenpfad gebrochen ist ("STUFE C GEBROCHEN: ... nicht in aufgeloester Export-Auswahl gefunden"), statt nur pauschal "Test fehlgeschlagen" zu melden.



Die modulare LV-Bibliothek unter `docs` ist der fachliche Referenzbestand für zukünftige LV-Texterzeugung:

- Strukturierte Textbausteine
- Stabile Bibliotheks-IDs
- Wiederverwendbare fachliche Einheiten
- spätere Zuordnung zu Components-Daten über Mappinglogik

Wichtig ist die bisher in der Dokumentation festgehaltene Einschränkung:

- Texte sollen nicht ohne fachlichen Grund umgeschrieben werden.
- Die Bibliothek ist die künftige fachliche Textquelle, nicht ein bloßer Textspeicher für Fallbacks.

## 10. Umgang mit fehlenden Mappings

Aktuell offen und als fachlicher Qualitätsmaßstab definiert:

- Fehlende Mappings dürfen nicht durch fachlich falsche Fallbacks ersetzt werden.
- Wenn eine Mapping unklar ist, soll sie als `offen` gekennzeichnet werden.
- Ein generischer Fallback darf nur dort verwendet werden, wo er fachlich neutral ist und keinen fachlichen Irrtum erzeugt.

## 11. Umgang mit 0-Mengen

Der vorhandene Qualitätsmaßstab ist eindeutig:

- 0-Mengen dürfen keinen konkreten Text erzeugen.
- Eine Position mit Menge 0 darf kein fachlich relevantes LV-Modul aktivieren.

## 12. Variantenlogik

Die Dokumentation verlangt ausdrücklich eine explizite Variantenlogik für:

- Hydraulik
- Seil
- Steuerung
- Schacht
- Fahrkorb
- ZÜS usw.

Das ist erforderlich, da standardisierte Texte in den statischen LV-Paketen die konkrete Variante nicht zuverlässig unterscheiden. Ein Hydraulikaufzug darf nicht aus einem Seilantriebstext bestehen.

## 13. Referenz-Testfall Berghof Lütjensee

Projekt:

- `Berghof Lütjensee / Aufzug 155180`
- Referenzdatei: `docs/260824_Berghof_Luetjensee_Aufzug_155180_datenexport_XL (3).json`

Technik:

- hydraulik
- hydraulik-direkt
- 0,63 m/s
- 630 kg
- 2 Haltestellen
- 2 Schachtzugänge
- Förderhöhe 3,00 m
- Projektart: Teilmodernisierung

Status: behoben und durch `backend/test/mapping-contract.test.js` reproduzierbar abgesichert. Der zuvor bekannte Fehler (Seilantrieb / `MRL - Seil Synchron` trotz Hydraulik-Kontext) ist nicht mehr reproduzierbar; zusätzlich wurde ein zweiter, unabhängiger Fehler behoben (siehe 9a): drei bestätigte Ziel-LV-IDs (`LV_14_05`, `LV_07_05`, `LV_02_09`) fehlten in der Export-Auswahl vollständig, weil `contentSource` nicht in den Mapping-Report übernommen wurde.

Dieser Fall bleibt der verbindliche Contract-Test für die Weiterentwicklung der LV-Logik (siehe 9b).

## 14. Offene Punkte

- fachliche Zuordnung der 6 bewusst offenen Components-Positionen (`maschine_standardrahmen`, `tuerfuehrungen`, `tuerlaufrollen`, `tuerkontakte`, `tuerseile`, `teil_umbaukit_schiebetueren`) zu Bibliotheks-IDs: `offen`
- vollständige Integration der modularen LV-Bibliothek für alle übrigen (noch nicht bestätigten) Bausteine: `offen`
- Datenkonsistenz zwischen `pakete.kalkulationsEingaben` und `kalkulation.paketSummen` im Components-Export: siehe 16 (Diagnose + kleine Korrektur in Components umgesetzt)

## 15. Kurzfazit

Der aktuelle Datenfluss zeigt bereits die richtigen Komponenten: Components liefert Kalkulationsdaten, BoQ verarbeitet sie und das Backend erzeugt DOCX-Exporte. Die positionsgenaue Mappinglogik verbindet Kalkulationsstruktur und LV-Struktur für 10 bestätigte Bibliotheks-IDs; ein Contract-Test sichert diesen Zustand gegen Regressionen ab. Die modulare LV-Bibliothek unter `docs` ist als Bibliotheksresolver für Bausteine ohne statische Paketentsprechung angebunden (`backend/lv/bibliothek.json`).

## 16. Diagnose: `kalkulationsEingaben` vs. `paketSummen` (Components-Export)

Im Referenz-Export `(3).json` wurde festgestellt, dass `pakete.kalkulationsEingaben` positive Werte (`anzahl_fahrschacht_schiebetuer_2tlg`, `anzahl_fahrschacht_demontage_schiebetuer_2tlg`, `anzahl_fahrschacht_muz_standard`, `anzahl_fahrschacht_antrittsblech`, `anzahl_fahrschacht_zargenbeleuchtung`, jeweils `2`) enthält, die in `kalkulation.paketSummen[*].positionen` NICHT als positive Positionen erscheinen.

Ursache (verifiziert über `kalkulation.letzteKalkulationsdaten.pakete.fahrschacht`, den Eingabe-Snapshot der zuletzt ausgeführten Kalkulation): Zum Zeitpunkt der letzten Berechnung standen diese 5 Felder noch auf `anzahl: 0`. Die Werte wurden danach im Frontend auf `2` geändert, ohne dass vor dem XL-Export erneut kalkuliert wurde. `paketSummen` basiert auf `status.letzteKalkulation` (dem zwischengespeicherten Ergebnis der letzten Berechnung) und war damit zum Exportzeitpunkt veraltet.

Das ist kein Fehler der BoQ-Mappinglogik (diese arbeitet bewusst mit `paketSummen`), sondern ein Timing-Problem auf Components-Seite: Eingaben können nach der letzten Kalkulation geändert werden, ohne dass der Export dies erkennt oder kennzeichnet.

Kleine, sichere Korrektur (Components, `01_Components_reload/frontend/index.html`, Funktion `fuehreXlExportAus`): Vor dem Aufbau des Export-Payloads wird jetzt `await bereiteKalkulationVor()` aufgerufen. Diese Funktion existiert bereits im Code (Signatur-Cache, kein unnötiger Request bei unverändertem Stand) und wird auch an anderer Stelle vor der Ergebnisanzeige verwendet. Schlägt die Kalkulation fehl, wird der Export nicht blockiert, sondern mit dem zuletzt verfügbaren Stand fortgesetzt (Warnung im Log). Damit ist sichergestellt, dass `paketSummen` beim XL-Export den aktuellen Eingabestand widerspiegelt, sofern die Kalkulation erfolgreich durchgeführt werden kann.

## 17. Bibliotheksschema (Schritt B)

`backend/lv/bibliothek.json` ist ab sofort ein **Array** strukturierter Bibliothekseinträge (vorher: flaches Objekt keyed nach ID). Das Schema ist direkt aus der realen Struktur der Word-Quelle abgeleitet, nicht erfunden: `docs/260824_LV_Bibliothek_Components_modular.docx` enthält bereits pro Baustein eine maschinenlesbare Metadatenzeile im Format `Struktur <Nr> | Typ <Typ> | Bibliotheks-ID <ID>` direkt unter der jeweiligen Überschrift. Das Schema übernimmt exakt diese Felder plus die fachlich notwendige Ergänzung `status`:

```json
{
  "id": "LV_09_02_SCHACHTBELEUCHTUNG",
  "struktur": "09.02",
  "kapitel": "09",
  "kategorie": "LV_KAP_09_SCHACHTAUSRUSTUNG",
  "titel": "Schachtbeleuchtung",
  "typ": "Baustein",
  "text": "...",
  "status": "bestaetigt"
}
```

Feldbedeutung:

- `id` – stabile Bibliotheks-ID, Quelle: Word-Metadatenzeile (`Bibliotheks-ID ...`). Wird nie geändert, sobald ein Mapping darauf verweist.
- `struktur` – hierarchische Gliederungsnummer aus der Word-Quelle (`09.02`, `10.08.01`, `18.04.09.02`). Codiert die Hierarchie bereits vollständig über die Punktnotation.
- `kapitel` – erstes Struktur-Segment (`09`), mechanisch aus `struktur` abgeleitet. Kein eigenständiges Feld mit potenziell abweichender Wahrheit, sondern eine Bequemlichkeits-Ableitung für Filterung/Validierung nach Kapitel.
- `kategorie` – Referenz auf die Bibliotheks-ID des Kapitels (`typ: "Kategorie"`, `LV_KAP_09_SCHACHTAUSRUSTUNG`), nicht der Klartext-Kapiteltitel. Der Kapiteltitel wird bei Bedarf über den Kategorie-Eintrag selbst nachgeschlagen (keine doppelte Titelpflege).
- `titel` – Überschrift des Bausteins, wortgetreu aus Word übernommen.
- `typ` – einer von `Kategorie` (Kapitelebene, kein eigener LV-Baustein), `Baustein` (regulärer LV-Baustein), `Variante` (alternative Ausführung eines Bausteins), `Unterbaustein`, `Unterabschnitt` (weitere Verschachtelungstiefen). Werte 1:1 aus der Word-Metadatenzeile übernommen, keine neue Klassifikation erfunden.
- `text` – Fliesstext des Bausteins, wortgetreu aus Word übernommen, nicht umformuliert.
- `status` – Workflow-Status des Bibliothekseintrags selbst (NICHT der Mapping-Status aus `docs/components-boq-begriffsmatrix.md`): `entwurf` (importiert, fachlich noch ungeprüft), `bestaetigt` (Inhalt geprüft, für Mapping freigegeben), `veraltet` (nicht mehr aktuell, nicht für neues Mapping verwenden).

Bewusst **kein** `parentId`-Feld: Die `struktur`-Punktnotation codiert die Hierarchie bereits vollständig und eindeutig; ein zusätzliches Elternreferenzfeld wäre eine redundante, potenziell divergierende zweite Wahrheit ohne fachlichen Mehrwert (`keine unnötige Hierarchie`).

Zugriff im Code (`backend/server.js`):

- `loadBibliothekEntries()` – liefert das rohe Array (Quelle für Validierung/Import/Reporting).
- `loadBibliothek()` – liefert weiterhin eine nach `id` gekeyte Lookup-Struktur (Rückwärtskompatibilität zu `resolveBibliothekEntryAsLv()` und dem bestehenden Contract-Test).

Migration: Die bisherigen 10 Einträge wurden 1:1 in das neue Schema übernommen. `struktur`, `kapitel`, `kategorie` und `typ` stammen aus der realen Word-Metadatenzeile (verifiziert je Eintrag, nicht geschätzt); `status` wurde für alle 10 auf `bestaetigt` gesetzt, da sie bereits produktiv gemappt und durch den Contract-Test abgesichert sind. `titel` und `text` wurden inhaltlich unverändert übernommen.

Die Word-Quelle enthält insgesamt 311 strukturierte Einträge (24 Kategorien/Kapitel, 226 Bausteine, 22 Varianten, 32 Unterbausteine, 7 Unterabschnitte, keine doppelten IDs) - das ist der Zielumfang für den späteren Vollimport (Schritt D).

## 18. Validierungsprozess (Schritt I)

`backend/lib/library-validation.js` stellt eine reine, seiteneffektfreie Validierungsfunktion (`validateLibrary({ entries, rules, staticPackages })`) bereit, die sowohl die strukturierte Bibliothek (`backend/lv/bibliothek.json`) als auch die Mappingregeln (`POSITION_MAPPING_RULES`) prüft. Ergebnis ist immer `{ errors, warnings }`:

- `errors` – harte Verstöße, die einen Bulk-Import (Schritt C/D) verhindern müssen.
- `warnings` – fachliche Berichte, die bewusst KEIN Fehler sind (ungenutzte Bibliothekseinträge, auffällig identische Texte, mehrere Regeln auf denselben Components-Key oder dieselbe Ziel-ID).

Geprüft werden mindestens:

- doppelte Bibliotheks-IDs (`errors`)
- fehlende Pflichtfelder (`id`, `struktur`, `kapitel`, `titel`, `typ`, `status`; `text` ist nur bei `typ: 'Kategorie'` optional) (`errors`)
- ungültige `status`- bzw. `typ`-Werte gegenüber dem Schema aus Abschnitt 17 (`errors`)
- Inkonsistenz zwischen `struktur` und `kapitel` (`errors`)
- Mapping auf eine nicht existente Bibliotheks-ID bzw. ein nicht existentes Modul in einem statischen Paket = Waisen-Mapping (`errors`)
- ungültige Variantenbedingungen (`technicalCondition` ist keine Funktion) (`errors`)
- unbekannte `contentSource`-Werte (`errors`)
- doppelte/überlappende Regeln: derselbe Components-Key in mehreren `mapped`-Regeln ohne gemeinsame `variantGroup` (`warnings` - technisch erkennbar, aber ob sich die `technicalCondition`-Werte tatsächlich gegenseitig ausschließen, wird nicht automatisch bewiesen, sondern zur manuellen Prüfung gemeldet), bzw. mehrere Regeln mit derselben Ziel-Bibliotheks-ID (`warnings`)
- nicht-deterministische Variantengruppen: mehrere `mapped`-Regeln mit derselben `variantGroup` matchen für denselben, enumerierten repräsentativen technischen Kontext gleichzeitig (`errors`, siehe Abschnitt 19)
- Bibliothekseinträge ohne Verwendung durch eine Mapping-Regel (`warnings`, kein Fehler)
- auffällig identische Texte über mehrere Bibliothekseinträge hinweg (`warnings`, kein Fehler)

Abgesichert durch `backend/test/library-validation.test.js`:

1. Selbsttests mit bewusst fehlerhaften synthetischen Daten beweisen, dass der Validierungsprozess jede der oben genannten Fehlerklassen tatsächlich erkennt (kein stiller No-op).
2. Anschließend wird der reale Datenbestand (`backend/lv/bibliothek.json` + `POSITION_MAPPING_RULES`) geprüft; aktueller Stand: 0 Fehler, 0 Berichte.

Verbindliche Regel für die folgenden Schritte (Word-Import, Vollübernahme): Ein Bulk-Import darf erst erfolgen, wenn `backend/test/library-validation.test.js` für den importierten Datenbestand fehlerfrei durchläuft.

## 19. Variantenfähiges Mapping (Schritt G)

Eine Components-Position kann abhängig von technischen Bedingungen auf unterschiedliche Bibliotheks-IDs zeigen (`1:n variantenabhängig`). Umsetzung ohne neue Sonderlogik im Renderer:

- Mehrere Regeln in `POSITION_MAPPING_RULES` teilen sich dieselben `componentsIds` und ein gemeinsames `variantGroup`-Feld (String-Kennung der Variantengruppe).
- Jede Regel der Gruppe hat eine eigene `bibliotheksId` und eine eigene `technicalCondition`, die sich mit den anderen Regeln der Gruppe gegenseitig ausschließen muss.
- Eine abschließende, ebenfalls der `variantGroup` zugehörige `open`-Regel deckt alle technischen Kontexte ab, die von keiner `mapped`-Regel der Gruppe erfasst werden (Negation der Vereinigung aller `mapped`-Bedingungen) - damit bleibt die Position nachvollziehbar `open` statt unsichtbar zu verschwinden, wenn keine Variante zutrifft.
- **Determinismus-Test** (`validateVariantGroupDeterminism()` in `backend/lib/library-validation.js`): Für jede `variantGroup` wird über eine enumerierte Menge repräsentativer technischer Kontexte (Kombinationen aus `aufzugstyp`, `hydraulikRegelungsart`, `projektart`) geprüft, dass für jeden Kontext höchstens eine `mapped`-Regel der Gruppe matcht. Ein Verstoß ist ein harter Validierungsfehler, kein Bericht - das ist die konkrete, testbare Umsetzung von "deterministisch und testbar" (Enumeration statt allgemeinem Beweis über beliebige Prädikatsfunktionen).

Erste produktive Variantengruppe: `antrieb-standardrahmen` für `maschine_standardrahmen` (siehe Abschnitt 20).

Wichtig, bereits in der bestätigten Architektur festgelegt und hier nur bestätigt: `antriebTyp` (mechanische Antriebs-/Aufhängungsart: `seil-oben` / `hydraulik-direkt` / `hydraulik-indirekt`) und `hydraulikRegelungsart` (Regelungsart: `frequenzgeregelt` / `softstart` / `konventionell`) sind unabhängige Dimensionen und dürfen nicht gekoppelt werden. Die Variantengruppe `antrieb-standardrahmen` unterscheidet ausschließlich nach `hydraulikRegelungsart` (und `aufzugstyp`), nicht nach `antriebTyp`.

## 20. Geschlossene und weiterhin offene Mappings (Schritt H)

Auf Basis der realen Word-Metadatenzeilen (Kapitel 14, Antrieb Hydraulik) wurde `maschine_standardrahmen` **teilweise** geschlossen:

- `aufzugstyp = hydraulik` + `hydraulikRegelungsart = frequenzgeregelt` → `LV_14_01_TWR_HYDRAULIK_FREQUENZGEREGELT` ("TWR – Hydraulik Frequenzgeregelt ")
- `aufzugstyp = hydraulik` + `hydraulikRegelungsart = softstart` → `LV_14_02_TWR_HYDRAULIK_MIT_SOFTSTART` ("TWR – Hydraulik mit Softstart ")

Beide Bausteine sind inhaltlich passend zur fachlichen Bedeutung von `maschine_standardrahmen` bei Hydraulik ("das komplette Hydraulikaggregat inkl. Gestell", siehe `docs/components-boq-begriffsmatrix.md`) und wurden wortgetreu aus der Word-Quelle in `backend/lv/bibliothek.json` übernommen (Struktur `14.01`/`14.02`, Kapitel `14`, Kategorie `LV_KAP_14_ANTRIEB_HYDRAULIK`).

Bewusst weiterhin **offen** (kein erfundener Ersatztext, siehe Stopp-Kriterien des Architekturauftrags):

- `aufzugstyp = hydraulik` + `hydraulikRegelungsart = konventionell` bzw. leer/unbekannt: In Kapitel 14 der Word-Bibliothek existiert außer `LV_14_01`/`LV_14_02` kein weiterer TWR-Aggregat-Baustein (verifiziert: Kapitel 14 enthält `14.01`–`14.09`, kein `konventionell`-Pendant). Es ist fachlich nicht entschieden, ob dafür ein neuer Bibliothekstext verfasst werden soll oder ob diese Variante bewusst ohne LV-Position bleibt (bereits als offene Frage in `docs/components-boq-begriffsmatrix.md` dokumentiert).
- `aufzugstyp = seil` (jede `antriebTyp`-Ausprägung): Die Begriffsmatrix benennt mehrere mögliche Kandidaten (`LV_13_01`/`LV_13_02`/`LV_13_03`, Kapitel 13 „Antrieb Seil“), aber keine eindeutige 1:1-Zuordnung - bleibt offen, bis diese fachliche Entscheidung getroffen ist.

Abgesichert durch `backend/test/variant-mapping.test.js` (alle 5 Kontexte: frequenzgeregelt, softstart, konventionell, leer, seil) sowie den Determinismus-Test in `backend/test/library-validation.test.js`.

Türtechnik (`tuerfuehrungen`, `tuerlaufrollen`, `tuerkontakte`, `tuerseile`) und `teil_umbaukit_schiebetueren` wurden NICHT geschlossen: Die vorhandenen Bibliothekskandidaten sind herstellerspezifisch () formuliert, Components kennt aktuell keine Herstellerdimension - das ist eine echte, in `docs/components-boq-begriffsmatrix.md` dokumentierte offene fachliche Entscheidung (siehe dort, Abschnitt "Offene fachliche Entscheidungen").

Eindeutig aus der bestehenden Bibliothek ableitbare Einzelpositionen wurden am 2026-08-27 geschlossen:

- `antrittsblech` → `LV_11_24_ANTRITTSBLECHE`
- `led_flaechenlicht_fahrkorb` → `LV_10_11_02_LED_FLACHENLICHT`
- `lichtgitter_vorhandene_fahrkorbschiebetuer` → `LV_10_30_LICHTVORHANG`

Diese Zuordnungen sind 1:1, ohne Herstellerannahme, und durch den IO-Contract-Test abgesichert. Die übrigen Türpositionen bleiben davon unberührt offen.

## 21. Word-Import (Schritt C)

`backend/lib/word-library-extractor.js` extrahiert strukturierte Bibliothekseinträge direkt aus `word/document.xml` der DOCX-Quelle. Grundlage ist dieselbe maschinenlesbare Metadatenzeile wie in Abschnitt 17 beschrieben (`Struktur <nr> | Typ <typ> | Bibliotheks-ID <id>`, Absatzformat `LVBibliothekMetadaten`):

- Titel: der nächste nicht-leere Absatz **vor** der Metadatenzeile.
- Fliesstext: alle Absätze zwischen der Metadatenzeile (exklusive) und der nächsten Metadatenzeile (exklusive deren Titel-Absatz), zeilenweise `trimEnd()`, mehr als 2 aufeinanderfolgende Leerzeilen werden auf eine doppelte Leerzeile reduziert.
- `kapitel`: erstes Struktur-Segment. `kategorie`: ID des zum Kapitel gehörenden `Kategorie`-Eintrags (nicht bei `typ: 'Kategorie'` selbst).

Der Extraktor trifft **keine** fachlichen Entscheidungen: kein Mapping, kein Erraten von Varianten, keine Umformulierung.

`backend/scripts/import-word-library.js` (`planImport()`) gleicht den frischen Extrakt gegen den bestehenden `backend/lv/bibliothek.json`-Bestand ab:

- Bestehende IDs werden **niemals** verändert - auch nicht, wenn der frische Word-Extrakt abweicht. Eine Abweichung wird als Bericht (`diff`) ausgegeben, damit ein Mensch entscheiden kann, ob die bestehende, bereits fachlich geprüfte Kuration aktualisiert werden soll.
- Neue IDs werden mit `status: 'entwurf'` ergänzt (fachlich ungeprüft), nie mit `bestaetigt`.
- Vor jedem Schreibvorgang läuft `validateLibrary()` über den gesamten Merge-Bestand; bei Fehlern wird **nicht** geschrieben (`node scripts/import-word-library.js`, ohne `--apply`, ist der Standard-Dry-Run).

Bekannter, bewusst nicht automatisch übernommener Befund: 3 der 12 ursprünglich manuell kuratierten Einträge (`LV_07_05_MALERARBEITEN_SCHACHTGRUBE`, `LV_14_01_TWR_HYDRAULIK_FREQUENZGEREGELT`, `LV_14_02_TWR_HYDRAULIK_MIT_SOFTSTART`) weichen im Feld `text` minimal von einer frischen Word-Extraktion ab (Trailing-Whitespace-Bereinigung bei den beiden `LV_14_*`-Einträgen; bei `LV_07_05` enthält die Word-Quelle einen zusätzlichen, sichtbar unvollständigen, grün eingefärbten Entwurfssatz "Schachtgrubenanstrich - ölfest in 2-K", der im ursprünglich kuratierten Text bewusst nicht enthalten ist). Diese 3 Fälle werden bei jedem Importlauf weiterhin als Bericht angezeigt, aber **nicht** automatisch überschrieben - das ist eine fachliche Entscheidung (Wortlaut übernehmen oder nicht), die hier offen bleibt.

Abgesichert durch `backend/test/word-import.test.js`: 311 Einträge werden aus der Word-Quelle extrahiert (keine Duplikate, alle Kernfelder vorhanden), alle bestehenden Einträge bleiben im Merge-Ergebnis byte-identisch, neue Einträge erhalten ausnahmslos `status: 'entwurf'`, keine ID-Kollision, und der resultierende Merge-Bestand ist validierungsfehlerfrei (Voraussetzung für Schritt D).

## 22. Vollübernahme (Schritt D)

Am 2026-08-25 mit `node scripts/import-word-library.js --apply` durchgeführt. Ergebnis:

- Word-Quelle: 311 Einträge (24 Kategorien, 226 Bausteine, 22 Varianten, 32 Unterbausteine, 7 Unterabschnitte).
- Bereits bestehend (unverändert übernommen): 12 Einträge (`status: 'bestaetigt'`).
- Neu importiert (`status: 'entwurf'`): 299 Einträge.
- Duplikate: 0. Fehler: 0.
- Bestehende Einträge mit Bericht (Abweichung zur Word-Quelle, nicht automatisch übernommen): 3 (siehe Abschnitt 21).
- `backend/lv/bibliothek.json` enthält jetzt 311 Einträge.

Validierungsbericht des Merge-Bestands (258 Berichte, 0 Fehler):

- 27 × "kein Fliesstext vorhanden" - reine Gruppierungsknoten, deren Inhalt vollständig in untergeordneten `Variante`/`Unterbaustein`-Einträgen steht (`LV_10_08_WANDBELAGE` mit den Varianten `LV_10_08_01_GLAS`/`_02_EDELSTAHL`/`_03_HPL...`).
- 17 × "auffällig identischer Text in mehreren Einträgen" - u. a. weil Kapitel 01 (Vorbemerkungen Neuanlagen) und Kapitel 02 (Vorbemerkungen Ersatzanlagen/Teilmodernisierung) zahlreiche wortgleiche Klauseln enthalten (`LV_01_07`/`LV_02_07` beide "Inverkehrbringung / Inbetriebnahme (PVI)").
- 214 × "wird von keiner Mapping-Regel verwendet" - erwartet, da für die 299 neuen Einträge noch keine Mapping-Regel existiert; das ist **keine** Aufforderung, jetzt automatisch neue Mappings zu ergänzen (siehe Anti-Try-and-Error-Regel: Kalkulationsstruktur bestimmt, welche Bausteine tatsächlich gebraucht werden, nicht die Bibliotheksgröße).

Wichtig: Der Vollimport erweitert ausschließlich die **Bibliothek** (die Menge verfügbarer, potenziell referenzierbarer LV-Bausteine). Er verändert `POSITION_MAPPING_RULES` nicht und schließt keine weiteren offenen Components-Positionen. Die 299 neu importierten Einträge sind `entwurf` (fachlich ungeprüft) und werden erst nach einer bestätigten fachlichen Zuordnung überhaupt referenziert.

## 23a. Vollständiger Components-IO-Positionsvertrag

Seit 2026-08-27 wird jede positive Components-Kalkulationsposition im BoQ-Report
positionsgenau und deterministisch klassifiziert. Zulässige Statuswerte sind
`mapped`, `open`, `not_lv_position` und `invalid`; keine positive Position wird
stillschweigend verworfen. Korrekturwerte (`korrekturwert_1` bis `_4`) sind
`not_lv_position`. Die Word-Auswahl wird weiterhin ausschließlich aus `mapped`
aufgebaut. Strukturell gültige, aber fachlich noch nicht zugeordnete Positionen
bleiben als `open` sichtbar, ohne dass ein Bibliotheksbaustein erfunden wird.
Der Contract ist durch `backend/test/io-contract.test.js` abgesichert.

Für die Nachvollziehbarkeit in der BoQ-Oberfläche stellt das Backend denselben
Report zusätzlich über `POST /api/io-report` bereit. Das Frontend zeigt daraus
Statuszählung und Positionsdetails inklusive LV-ID; der Word-Export bleibt
unverändert auf `mapped` beschränkt.

## 23. Auslagerung Mappinglogik (Schritt F) - geprüft, bewusst zurückgestellt

Geprüft am 2026-08-25, nach Abschluss der Vollübernahme (Schritt D):

- `backend/server.js` umfasst aktuell ca. 2.550 Zeilen (Auth, Supabase, DOCX-Erzeugung, GAEB/X83-Export, positionsgenaue Mappinglogik).
- `POSITION_MAPPING_RULES` umfasst aktuell 19 Regeln. Die Vollübernahme (Schritt D) hat bewusst nur die Bibliothek erweitert; die drei zusätzlichen Regeln vom 2026-08-27 schließen ausschließlich eindeutig ableitbare Einzelpositionen.
- Die reine Mapping-/Resolutionslogik (`POSITION_MAPPING_RULES`, `buildPositionMappingReport()`, `resolveMappedStaticLvEntries()`, `resolveBibliothekEntryAsLv()`, `resolveStaticModuleEntryAsLv()`, `loadBibliothek()`/`loadBibliothekEntries()`) ist weiterhin räumlich zusammenhängend innerhalb von `server.js` und über klare Testgrenzen (`backend/test/mapping-contract.test.js`, `granularity-contract.test.js`, `variant-mapping.test.js`, `io-contract.test.js`) abgesichert.

Entscheidung: Schritt F wird **bewusst zurückgestellt**, nicht durchgeführt. Ein Auslagern in ein eigenes Modul (analog zu `backend/lib/library-validation.js` und `backend/lib/word-library-extractor.js`) wäre risikoarm und architektonisch naheliegend, löst bei 19 Regeln aber noch keine bestehende Wartbarkeitsschwierigkeit. Erneut zu prüfen, sobald `POSITION_MAPPING_RULES` durch weitere fachlich bestätigte Mappings spürbar wächst (> 40-50 Regeln) oder `server.js` aus anderen Gründen unübersichtlich wird.
