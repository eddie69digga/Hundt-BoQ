# Project Memory BoQ

## Zweck der Anwendung

BoQ steht hier für ein Leistungsverzeichnis / Bill of Quantities im Bereich Aufzugsplanung. Die Anwendung dient dazu, technische und fachliche Projektinformationen aus Komponenten-Exporten in ein taugliches BoQ-Format zu überführen, insbesondere für die Weiterverarbeitung in Word-/Dokumentausgaben.

Im Zusammenspiel mit Components bildet BoQ die nachgelagerte Verarbeitungsebene: Components liefert die kalkulatorischen und projektbezogenen Informationen, BoQ visualisiert und strukturiert diese für Nutzer und erzeugt aus den vorhandenen Daten das Leistungsverzeichnis.

Ziel ist die Erstellung und Weiterverarbeitung von Leistungsverzeichnissen mit nachvollziehbarer fachlicher Struktur, ohne die fachlichen Aussagen aus dem ursprünglichen Projektkontext zu verlieren.

## Systemarchitektur

### Frontend

- Hauptdatei: `frontend/index.html`
- Statische Weboberfläche für Login, Import, Projektübersicht, Paket- und Positionsübersicht.
- Die App erwartet nach erfolgreichem Login eine Cloud-Export-Auswahl und lädt den gewählten Export aus Supabase.
- Die UI zeigt dabei unter anderem:
  - Projekt- und Auftragsdaten
  - aktive Pakete
  - `lvPositionen`-Sammlungen
  - LV-Text-Keys und Positionsliste
  - Exportfunktion für Word-Dokumente

### Backend

- Hauptdatei: `backend/server.js`
- Node.js/Express-Service mit zentraler Logik für:
  - Login-Authentifizierung
  - Zugang auf Cloud-Exports
  - Supabase-Abfragen
  - DOCX-Erzeugung für BoQ-Word-Exports
  - statische LV-Paketdateien unter `backend/lv`

### Relevante Verzeichnisse

- `backend/` – Serverlogik, .env, LV-Pakete, Export- und Supabase-Logik
- `backend/lv/` – vorhandene statische LV-JSON-Dateien
- `frontend/` – UI und Assets
- `docs/` – Auth- und Dokumentationsmaterial, inklusive modularer LV-Bibliothek

### Zentrale Dateien

- `frontend/index.html` – UI, Import-/Render-Logik, Projekt-, Paket- und Positionsübersicht
- `backend/server.js` – Auth, Supabase, Word-Export, positionsgenaue Mappinglogik, LV-Lade- und -Render-Logik
- `backend/lv/steuerung.json` – statische Steuerungs-LV-Paketdaten
- `backend/lv/antrieb.json` – statische Antriebs-LV-Paketdaten (nur Seil-/MRL-Text; im positionsgenauen Modus nicht verwendet)
- `backend/lv/abnahme.json` – statische Abnahme-/Messdaten-LV-Paketdaten
- `backend/lv/bibliothek.json` – Bibliotheksresolver für Bausteine ohne statische Paketentsprechung
- `backend/lv/vorbemerkung.txt` – Vorbemerkungstext für Export
- `backend/test/mapping-contract.test.js` – Contract-Test (`npm test`)
- `docs/auth-users.md` – Benutzer-/Auth-Dokumentation
- `docs/260824_LV_Bibliothek_Components_modular.docx` – modulare LV-Bibliothek (fachliche Quelle für `bibliothek.json`)

### API-Kommunikation

- Das Frontend meldet sich über `POST /api/login` an.
- Nach erfolgreichem Login werden Cloud-Exports über `GET /api/xl-exports` und `GET /api/xl-exports/:exportId` abgerufen.
- Der Benutzername wird dabei serverseitig als freigegebener Nutzer validiert.
- Der Word-Export läuft über Endpunkte wie:
  - `POST /api/export/word/steuerung` (primär, sendet die vollständige Kalkulationsstruktur im Body als `data`)
  - `GET /api/export/word/steuerung` (Abwärtskompatibilität, ohne Positionsdaten → Legacy-Modus)
  - `POST /api/export/steuerung/docx` / `GET /api/export/steuerung/docx` (Alias, gleiches Verhalten)
- Die Exporte werden aus den vorhandenen Datenstrukturen zusammengebaut und als DOCX ausgeliefert.
- Wichtig: Nur wenn `kalkulation.paketSummen[*].positionen` im Request (Body oder Query) vorhanden ist, aktiviert sich die positionsgenaue Mappinglogik. Fehlt diese Struktur (z. B. bei einem reinen GET ohne Body), greift automatisch der Legacy-Fallback mit den statischen Paketdateien.

### Cloud-Export

- Components erzeugt exportierte Projekt-/Kalkulationsdaten.
- Die Daten werden nutzerbezogen in Supabase gespeichert (Tabelle `xl_exports`).
- BoQ lädt diese Exportdaten nach erfolgreichem Login und setzt sie im Frontend für die Weiterverarbeitung um.
- Die Zuordnung erfolgt über `username` und `export_id`.

### Supabase-Nutzung

- Supabase wird für BoQ als Datenspeicher für Cloud-Exports genutzt.
- Es ist keine eigene Authentifizierungsquelle für die BoQ-Anwendung; die Benutzerprüfung erfolgt serverseitig im Backend anhand der zentralen Benutzerkonfiguration.
- Relevante Namen der Environment Variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Der Zugriff ist pro Benutzer auf die eigenen Exports eingeschränkt.

### Word-/Dokumenterzeugung

- Das Backend generiert DOCX-Dateien mit `docx`.
- Die Exporte bestehen aus Deckblatt, Projekt-/Formularseiten, technischen Daten, Vorbemerkung und LV-Abschnitten.
- Im positionsgenauen Modus setzt sich der LV-Teil aus statischen Paketmodulen (`steuerung.json`, `abnahme.json`) und dedizierten Bibliotheksbausteinen (`backend/lv/bibliothek.json`) zusammen, abhängig vom bestätigten `contentSource` jeder Bibliotheks-ID.
- Im Legacy-Modus (keine positiven Positionsdaten) lädt die Umsetzung weiterhin die statischen LV-Paketdateien aus `backend/lv` vollständig.

## Hosting

Aktueller Stand (Dokumentationsstand):

- Frontend: Netlify
- Backend: Render
- Supabase: Speicherung der Exporte

Erforderliche Environment Variables (nur Namen, keine Secrets):

- `ADMIN_PASSWORD`
- `TESTUSER_PASSWORD`
- `EDDIE_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Benutzer / Authentifizierung

Aktueller Stand:

- Benutzer `admin`
- Benutzer `testuser`
- Benutzer `eddie`
- Zentrale Benutzerkonfiguration im Backend in `PASSWORD_ENV_BY_USERNAME`
- Passwortprüfung erfolgt über Environment Variables
- `EDDIE_PASSWORD` ist Teil der lokalen Benutzerkonfiguration, aber kein Klartext-Passwort wird hier dokumentiert

Detailinformationen stehen in `docs/auth-users.md`; dort bleiben die tatsächlichen Auth-Details und die Nutzungsregeln dokumentiert.

## Components → BoQ Handoff

- Components erzeugt einen Cloud-/XL-Export.
- BoQ lädt Exporte nutzerbezogen.
- Die Zuordnung erfolgt über `username` und `export_id`.
- Projekt-, Technik- und Kalkulationsdaten werden aus dem Export übernommen.
- In der Praxis besteht ein produktiv getesteter Handoff zwischen Components und BoQ.

Die Frontend-/Importlogik erkennt dabei unter anderem:

- `data.kalkulation.paketSummen`
- `data.kalkulation.lvPositionen`
- `data.kalkulation.lvTextKey`

Diese Strukturen sind im aktuellen Stand als Übergang zwischen Components-Daten und BoQ-LV-Erzeugung relevant, aber noch nicht vollständig als positionsgenaue LV-Erzeugung umgesetzt.

## Aktuelle LV-Erzeugung

Der aktuelle IST-Zustand ist nach Projektlage wie folgt:

- Components besitzt positionsgenaue Kalkulationsdaten (`kalkulation.paketSummen[*].positionen`).
- BoQ verwendet beim Word-/X83-Export den positionsgenauen Modus, sobald positive Positionsdaten vorliegen (siehe unten).
- Bausteine ohne passendes Modul in den statischen Paketdateien (`backend/lv/*.json`) werden über einen dedizierten Bibliotheksresolver (`backend/lv/bibliothek.json`) aufgelöst, nicht über einen erfundenen oder falschen Paketfallback.
- Ein Hydraulikaufzug erhält dadurch keinen Seilantriebstext (`Antrieb Seil` / `MRL - Seil Synchron`) mehr; dies ist durch einen automatisierten Contract-Test abgesichert (`backend/test/mapping-contract.test.js`).

Abgeleitet daraus gilt:

- Die fachliche Qualität der LV-Texte für die 10 bestätigten Bibliotheks-IDs ist durch den Contract-Test gegen Regressionen abgesichert.
- Für alle anderen (noch nicht bestätigten) Positionen gilt weiterhin der Legacy-Pfad bzw. `open`.

## Bekannter Architekturfehler

`Kalkulationsstruktur != LV-Struktur`

Das ist der zentrale fachliche und technische Bruch im aktuellen Ansatz:

- Die Kalkulationsstruktur aus Components ist nicht identisch mit der LV-Struktur der BoQ-LV-Pakete.
- Paketaktivität darf künftig nicht automatisch alle LV-Bausteine aktivieren.
- Nur fachlich relevante positive Positionen sollen konkrete LV-Inhalte auslösen.
- 0-Mengen dürfen keinen konkreten Text erzeugen.
- Varianten wie Hydraulik / Seil müssen explizit ausgewertet werden.
- Fehlende Mappings dürfen nicht durch fachlich falsche Fallbacks ersetzt werden.
- Mehrere Kalkulationspositionen können auf einen gemeinsamen LV-Baustein führen.

## Positionsgenauer Modus und Mapping-Logik

Der aktuelle produktive LV-Export unterscheidet zwischen zwei Modi:

- Positionsgenauer Modus: aktiv, sobald positive Positionsdaten aus `kalkulation.paketSummen[*].positionen` vorliegen.
- Legacy-Modus: nur aktiv, wenn keine geeignete Positionsstruktur vorhanden ist.

Im positionsgenauen Modus gilt folgende Reihenfolge:

1. Nur Positionen mit Menge > 0 werden berücksichtigt.
2. Der technische Kontext wird aus `technischeParameter` / `projekt` / `aufzugstyp` / `projektart` gelesen.
3. Die Zuordnung erfolgt auf bestätigte LV-Bibliotheks-IDs.
4. Mehrere Positionen auf dieselbe Ziel-LV-ID werden dedupliziert.
5. Unbekannte Positionen bleiben als `open` stehen und erzeugen keinen fachlich falschen Fallback.
6. Beim neuen Components-Export wird kein statischer Gesamtpaket-Fallback mehr verwendet.
7. Bei Hydraulik bleibt der Seil-/MRL-Fallback ausgeschlossen.

Bestätigte Abbildungen (`bibliotheksId` → `contentSource`):

- `hydraulikschlauch` + `hydraulikoel` → `LV_14_05_HYDRAULIKSCHLAUCHE_UND_HYDRAULIKOL` (`bibliothek`)
- `steuerung` → `LV_12_02_STEUERUNG` (`static`)
- `fahrkorbtableau` → `LV_10_20_FAHRKORBTABLEAU_VERTIKAL` (`static`)
- `aussenruftableau` → `LV_11_16_BEFEHLSGEBER_AUSSENRUF` (`static`)
- `standanzeige` → `LV_11_20_STAND_UND_WEITERFAHRTANZEIGE_AUSSEN` (`static`)
- `schachtbeleuchtung` → `LV_09_02_SCHACHTBELEUCHTUNG` (`static`)
- `kabelkanaele` → `LV_09_01_SCHACHTINSTALLATION_ELEKTRO` (`static`)
- `anstrich_schachtgrube` → `LV_07_05_MALERARBEITEN_SCHACHTGRUBE` (`bibliothek`)
- `zues_kosten_vorpruefung` + `zues_kosten_abnahme` + `zues_begleitung_durch_an_aufzug` + `pruefgewichte` → `LV_02_07_INVERKEHRBRINGUNG_INBETRIEBNAHME_PVI` (`static`) bei `projektart = Teilmodernisierung`
- `transport_allgemein_baustelle_lager` → `LV_02_09_TRANSPORT_UND_BAUSTELLENEINRICHTUNG` (`bibliothek`) bei `projektart = Teilmodernisierung`

`static` = bereits reales Modul in `steuerung.json`/`abnahme.json`. `bibliothek` = kein passendes statisches Modul vorhanden; Baustein wird dediziert aus `backend/lv/bibliothek.json` aufgelöst (Quelle: `docs/260824_LV_Bibliothek_Components_modular.docx`, wortgetreu übernommen).

Offen bleiben:

- `maschine_standardrahmen`
- `tuerfuehrungen`
- `tuerlaufrollen`
- `tuerkontakte`
- `tuerseile`
- `teil_umbaukit_schiebetueren`

Die Legacy-Abgrenzung ist bewusst: Nur wenn keine passende Positionsstruktur vorliegt, fallen die bisherigen statischen Paketdateien aus `backend/lv` in den Fallback. Im neuen Components-Export wird dieser Fallback nicht mehr genutzt, damit fachlich falsche Texte wie `Antrieb Seil` oder `MRL - Seil Synchron` bei Hydraulik vollständig ausgeschlossen sind.

## Contract-Test-Standard (verbindlich für positionsgenaue LV-Exporte)

`grün` bedeutet NICHT: HTTP 200, DOCX vorhanden, Stichprobe okay.

`grün` bedeutet: vollständiger Soll-Ist-Abgleich aller bestätigten Mapping-IDs, offene Positionen nachvollziehbar, Negativliste (Seil/MRL) bestanden, keine erwartete gemappte Position geht verloren.

Umgesetzt in `backend/test/mapping-contract.test.js` (Ausführung: `npm test` im Verzeichnis `backend/`). Der Test prüft 5 Stufen (Input → Mapping → Resolution → Export → DOCX-Inhalt) gegen den realen Referenzfall Berghof und benennt bei einem Fehlschlag explizit, auf welcher Stufe der Datenpfad gebrochen ist. Details siehe `docs/lv-architecture.md`, Abschnitt 9b.

## Modulare LV-Bibliothek

Die neue modulare LV-Bibliothek liegt unter `docs`:

- Pfad: `docs/260824_LV_Bibliothek_Components_modular.docx`
- Zweck: zukünftige fachliche Textquelle für die LV-Erzeugung
- Sie enthält strukturierte Textbausteine und stabile Bibliotheks-IDs
- Texte sollen nicht ohne fachlichen Grund umgeschrieben werden
- Spätere Mappinglogik soll Components-Daten mit diesen Bibliotheks-IDs verbinden

Diese Bibliothek ist der geplante fachliche Basisbestand, der die statische Paketlogik langfristig ersetzen soll. Noch keine Mappingregeln wurden hier festgeschrieben; dies ist bewusst offen.

## Referenz-Testfall

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

Status: behoben, durch `backend/test/mapping-contract.test.js` reproduzierbar abgesichert. Zwei unabhängige Fehler wurden auf dem Weg dahin behoben:

1. Der Word-Export-Button im Frontend sendete ursprünglich keine Kalkulationsdaten mit, wodurch immer der Legacy-Fallback (inkl. Seiltext) griff.
2. `contentSource` wurde in den Mapping-Regeln definiert, aber nicht in den Mapping-Report übernommen, wodurch 3 bestätigte Bibliotheks-IDs (`LV_14_05`, `LV_07_05`, `LV_02_09`) in der Export-Auswahl komplett fehlten.

Zusätzlich diagnostiziert (siehe `docs/lv-architecture.md`, Abschnitt 16): `pakete.kalkulationsEingaben` im Components-Export kann neuer sein als `kalkulation.paketSummen`, wenn nach der letzten Berechnung Eingaben geändert wurden, ohne dass vor dem Export erneut kalkuliert wurde. Kleine Korrektur in Components umgesetzt: `fuehreXlExportAus()` ruft jetzt vor dem Aufbau des Export-Payloads `bereiteKalkulationVor()` auf.

## Wichtige Dateien

### Components-Seite

- Die relevanten Export-/Handoff-Stellen liegen in der Components-Anwendung außerhalb dieses BoQ-Repos (`01_Components_reload/frontend/index.html`, Funktion `fuehreXlExportAus`).
- Für BoQ relevant ist der Exportpfad mit personenbezogener Zuordnung und der spätere Import über `username` + `export_id`.

### BoQ

- `frontend/index.html` – UI und Import-/Render-Logik; Word-Export sendet `POST` mit voller Kalkulationsstruktur im Body.
- `backend/server.js` – Auth, Supabase, DOCX-Export, positionsgenaue Mappinglogik, Bibliotheksresolver.
- `backend/lv/*.json` – statische LV-Paketdateien (`steuerung.json`, `antrieb.json`, `abnahme.json`).
- `backend/lv/bibliothek.json` – Bibliotheksresolver für Bausteine ohne statische Paketentsprechung.
- `backend/test/mapping-contract.test.js` – Contract-Test (`npm test`), 5-stufiger Soll-Ist-Abgleich gegen den Referenzfall Berghof.
- `docs/auth-users.md` – Auth-/Nutzer-Details.
- `docs/260824_LV_Bibliothek_Components_modular.docx` – modulare LV-Bibliothek (Quelle für `bibliothek.json`).
- `docs/260824_Berghof_Luetjensee_Aufzug_155180_datenexport_XL (3).json` – reale Referenzdatei für den Contract-Test.

## Workflow

Aktuell gibt es keinen Branch-/Staging-Prozess in diesem Projekt. Der Standardablauf ist:

1. bestehendes Projekt analysieren
2. Änderung umsetzen
3. Tests durchführen (`npm test` in `backend/`)
4. Projektdokumentation prüfen
5. Commit
6. Push auf `main`
7. produktiver Live-Test

## Nächste fachliche Schritte

1. Fachliche Zuordnung der 6 bewusst offenen Components-Positionen zu Bibliotheks-IDs definieren.
2. Weitere Bibliotheks-IDs aus der modularen LV-Bibliothek schrittweise bestätigen und in `POSITION_MAPPING_RULES` sowie `backend/lv/bibliothek.json` aufnehmen.
3. Contract-Test (`backend/test/mapping-contract.test.js`) bei jeder neuen Bestätigung um die jeweilige ID erweitern.

## Offene Punkte

- Fachliche Zuordnung der 6 bewusst offenen Components-Positionen (`maschine_standardrahmen`, `tuerfuehrungen`, `tuerlaufrollen`, `tuerkontakte`, `tuerseile`, `teil_umbaukit_schiebetueren`) ist noch offen.
- Vollständige Integration der modularen LV-Bibliothek für alle übrigen (noch nicht bestätigten) Bausteine ist noch offen.

## Kurzfazit

Für die 10 aktuell bestätigten Bibliotheks-IDs ist die Kalkulationsstruktur sauber mit der LV-Struktur verbunden und durch einen automatisierten Contract-Test (5 Stufen: Input, Mapping, Resolution, Export, DOCX-Inhalt) gegen Regressionen abgesichert. Für alle anderen Positionen bleibt der Legacy-Pfad bzw. `open` bestehen. Die modulare LV-Bibliothek unter `docs` ist als Bibliotheksresolver angebunden und der Bezugspunkt für weitere Bestätigungen.
