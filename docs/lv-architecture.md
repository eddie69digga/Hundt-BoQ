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
4. Fehlen positive Positionsdaten (z. B. bei einem GET-Request ohne Body oder bei alten Datensätzen), greift der Legacy-Pfad: `extractAktiveSelektionen(query)` entscheidet, welche Pakete aktiv sind, und alle Standardpakete (Steuerung, Antrieb, Abnahme) werden nach der bisherigen Logik zusammengeführt.
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

Bis zur Korrektur wurde bei `contentSource: 'static'` das GESAMTE statische Paket (`steuerung.json` mit allen ~20 Modulen bzw. `abnahme.json`) dedupliziert unter dem Paket-Schluessel (`staticEntryId`, z. B. `steuerung`) eingefuegt, sobald IRGENDEINE der 6 auf dasselbe Paket zeigenden Regeln (`steuerung`, `fahrkorbtableau`, `aussenruftableau`, `standanzeige`, `schachtbeleuchtung`, `kabelkanaele`) positiv war. Dadurch erschienen automatisch auch nicht bestaetigte, nicht positive Module desselben Pakets im LV (z. B. Frequenzumrichter/Regelung, Lastmesssystem, Schaltschrank, Brandfallsteuerung, Schachtkopierung, Parkhaltestelle) - ein Verstoss gegen `Kalkulationsstruktur != LV-Struktur`.

Fix (`backend/server.js`, `resolveMappedStaticLvEntries()` / `resolveStaticModuleEntryAsLv()`):

- Jede Regel mit `contentSource: 'static'` traegt jetzt `staticModuleId` (das genaue Modul innerhalb des Pakets, z. B. `schachtbeleuchtung` → Modul-ID `schachtbeleuchtung`, `aussenruftableau` → Modul-ID `befehlsgeber_aussenruf`).
- Aufgeloest wird ein synthetisches LV-Objekt mit genau diesem einen Modul (analog zu `resolveBibliothekEntryAsLv()`), nicht mehr das komplette Paket.
- Dedupliziert wird ausschliesslich ueber die Ziel-Bibliotheks-ID (`bibliotheksId`), nicht mehr ueber den Paket-Schluessel. Dadurch fuehren mehrere Regeln, die auf dasselbe Paket zeigen (z. B. alle 6 Steuerung-Positionen), zu jeweils EIGENEN LV-Positionen, wenn sie einzeln positiv sind - und zu GAR KEINER Ausgabe, wenn sie es nicht sind.
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

Schlägt eine Stufe fehl, benennt der Test explizit, auf welcher Stufe der Datenpfad gebrochen ist (z. B. "STUFE C GEBROCHEN: ... nicht in aufgeloester Export-Auswahl gefunden"), statt nur pauschal "Test fehlgeschlagen" zu melden.



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
