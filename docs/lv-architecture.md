# LV-Architektur und aktueller Datenfluss

Dieser Abschnitt dokumentiert den aktuellen IST-Zustand, soweit er aus dem Projekt und den vorhandenen Dateien nachvollziehbar ist. Unklare oder noch nicht abgestimmte Punkte sind als `offen` markiert.

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

Der Word-Export wird im Backend über `createBoQDocxBuffer` und die Endpunkte `GET /api/export/word/steuerung` bzw. `GET /api/export/steuerung/docx` ausgelöst.

Der aktuelle Ablauf:

1. `getWordExportLvEntries(query)` lädt die Standard-LV-Pakete:
   - Steuerung
   - Antrieb
   - Abnahme
2. Es prüft `extractAktiveSelektionen(query)` und entscheidet, welche Pakete aktiv sind.
3. Die Pakete werden als Reihenfolge `Steuerung` → `Antrieb` → `Abnahme` zusammengeführt.
4. `buildMinimalX83XmlFromWordSource` bzw. `createBoQDocxBuffer` bauen daraus das Word-/XML-Dokument.
5. Die Textinhalte kommen aktuell weitgehend aus den statischen JSON-Paketen und `vorbemerkung.txt`.

Wesentlicher Effekt:

- Das Dokument ist funktional nutzbar,
- aber der fachliche Text ist an den aktuellen static-packages-Stand gekoppelt,
- nicht an die tatsächliche varianterkennende Kalkulationslogik.

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

## 9. Rolle der modularen LV-Bibliothek

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

Technik:

- hydraulik
- hydraulik-direkt
- 0,63 m/s
- 630 kg
- 2 Haltestellen
- 2 Schachtzugänge
- Förderhöhe 3,00 m

Bekannter Fehler:

- Im aktuellen LV erscheint trotzdem ein Seilantrieb / `MRL - Seil Synchron`.

Damit ist dieser Fall ein sauberer Referenz-Test für die Weiterentwicklung der LV-Logik. Er soll künftig sicherstellen, dass die fachliche Variante korrekt erkannt und eine passende LV-Bibliothekszuordnung gefunden wird.

## 14. Offene Punkte

- exakte Zuordnung von `lvPositionen` zu Bibliotheks-IDs: `offen`
- fachliche Unterscheidung zwischen Varianten und Paketaktivitäten: `offen`
- genaue Regel, wie 0-Mengen in der finalen LV-Erzeugung behandelt werden: `offen`
- Mappings für Hydraulik, Seil, Steuerung, Schacht, Fahrkorb, ZÜS: `offen`
- vollständige Integration der modularen LV-Bibliothek in den aktuellen Exportpfad: `offen`

## 15. Kurzfazit

Der aktuelle Datenfluss zeigt bereits die richtigen Komponenten: Components liefert Kalkulationsdaten, BoQ verarbeitet sie und das Backend erzeugt DOCX-Exporte. Der fachliche Bruch liegt aber in der fehlenden Verknüpfung zwischen Kalkulationsstruktur und LV-Struktur. Die modulare LV-Bibliothek unter `docs` bildet den logischen nächsten Schritt für eine fachlich robuste, positionsgenaue Weiterentwicklung.
