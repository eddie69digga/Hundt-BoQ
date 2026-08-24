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
- `backend/server.js` – Auth, Supabase, Word-Export, LV-Lade- und -Render-Logik
- `backend/lv/steuerung.json` – statische Steuerungs-LV-Paketdaten
- `backend/lv/antrieb.json` – statische Antriebs-LV-Paketdaten
- `backend/lv/abnahme.json` – statische Abnahme-/Messdaten-LV-Paketdaten
- `backend/lv/vorbemerkung.txt` – Vorbemerkungstext für Export
- `docs/auth-users.md` – Benutzer-/Auth-Dokumentation
- `docs/260824_LV_Bibliothek_Components_modular.docx` – modulare LV-Bibliothek (fachliche Textquelle, vorbereitet für spätere Verbindung)

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
- Die aktuelle Umsetzung lädt weitgehend statische LV-Paketdateien aus `backend/lv` und setzt diese zu einem Dokument zusammen.

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

- Components besitzt positionsgenaue Kalkulationsdaten.
- `lvPositionen` werden derzeit nur teilweise erzeugt bzw. genutzt.
- BoQ verwendet beim Word-Export die positionsgenauen Daten noch nicht vollständig.
- Das Backend lädt aktuell weitgehend statische LV-Paketdateien aus `backend/lv`.
- Dadurch können fachlich falsche Pakettexte entstehen.
- Beispiel: Ein Hydraulikaufzug erhält aktuell einen Seilantriebstext.

Abgeleitet daraus gilt:

- Die fachliche Qualität der LV-Texte hängt derzeit noch stark von den statischen Paketdateien und den vorhandenen Fallbacks ab.
- Das ist sinnvoll für den aktuellen Stand, aber kein stabiles Endziel.

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

Bestätigte Abbildungen:

- `hydraulikschlauch` + `hydraulikoel` → `LV_14_05_HYDRAULIKSCHLAUCHE_UND_HYDRAULIKOL`
- `steuerung` → `LV_12_02_STEUERUNG`
- `fahrkorbtableau` → `LV_10_20_FAHRKORBTABLEAU_VERTIKAL`
- `aussenruftableau` → `LV_11_16_BEFEHLSGEBER_AUSSENRUF`
- `standanzeige` → `LV_11_20_STAND_UND_WEITERFAHRTANZEIGE_AUSSEN`
- `schachtbeleuchtung` → `LV_09_02_SCHACHTBELEUCHTUNG`
- `kabelkanaele` → `LV_09_01_SCHACHTINSTALLATION_ELEKTRO`
- `anstrich_schachtgrube` → `LV_07_05_MALERARBEITEN_SCHACHTGRUBE`
- `zues_kosten_vorpruefung` + `zues_kosten_abnahme` + `zues_begleitung_durch_an_aufzug` + `pruefgewichte` → `LV_02_07_INVERKEHRBRINGUNG_INBETRIEBNAHME_PVI` bei `projektart = Teilmodernisierung`
- `transport_allgemein_baustelle_lager` → `LV_02_09_TRANSPORT_UND_BAUSTELLENEINRICHTUNG` bei `projektart = Teilmodernisierung`

Offen bleiben:

- `maschine_standardrahmen`
- `tuerfuehrungen`
- `tuerlaufrollen`
- `tuerkontakte`
- `tuerseile`
- `teil_umbaukit_schiebetueren`

Die Legacy-Abgrenzung ist bewusst: Nur wenn keine passende Positionsstruktur vorliegt, fallen die bisherigen statischen Paketdateien aus `backend/lv` in den Fallback. Im neuen Components-Export wird dieser Fallback nicht mehr genutzt, damit fachlich falsche Texte wie `Antrieb Seil` oder `MRL - Seil Synchron` bei Hydraulik vollständig ausgeschlossen sind.

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

Technik:

- hydraulik
- hydraulik-direkt
- 0,63 m/s
- 630 kg
- 2 Haltestellen
- 2 Schachtzugänge
- Förderhöhe 3,00 m

Bekannter Fehler:

- Im aktuell erzeugten LV erscheint trotzdem ein Seilantrieb / `MRL - Seil Synchron`.

Dieser Testfall ist als Referenz für die zukünftige LV-Weiterentwicklung vorgesehen. Er sollte künftig die fachlich korrekte Variante- und Mappinglogik absichern.

## Wichtige Dateien

### Components-Seite

- Die relevanten Export-/Handoff-Stellen liegen in der Components-Anwendung außerhalb dieses BoQ-Repos.
- Für BoQ relevant ist der Exportpfad mit personenbezogener Zuordnung und der spätere Import über `username` + `export_id`.

### BoQ

- `frontend/index.html` – UI und Import-/Render-Logik
- `backend/server.js` – Auth, Supabase, DOCX-Export, statische LV-Erzeugung
- `backend/lv/*` – aktuelle statische LV-Paketdateien
- `docs/auth-users.md` – Auth-/Nutzer-Details
- `docs/260824_LV_Bibliothek_Components_modular.docx` – modulare LV-Bibliothek

## Workflow

Aktuell gibt es keinen Branch-/Staging-Prozess in diesem Projekt. Der Standardablauf ist:

1. bestehendes Projekt analysieren
2. Änderung umsetzen
3. Tests durchführen
4. Projektdokumentation prüfen
5. Commit
6. Push auf `main`
7. produktiver Live-Test

## Nächste fachliche Schritte

Noch keine Umsetzung wurde hier ausgelöst, aber die nächsten geplanten fachlichen Schritte sind:

1. Positionsgenaue Datenkette herstellen: Components-Kalkulation → positive LV-relevante Positionen → BoQ → Word
2. 0-Mengen und Paket-Fallbacks sauber behandeln
3. Danach modulare LV-Bibliothek anbinden
4. Mappingregeln für Hydraulik, Seil, Steuerung, Schacht, Fahrkorb, ZÜS usw. schrittweise definieren
5. Referenzfall Berghof Lütjensee erneut testen

## Offene Punkte

- Genaues Mapping zwischen Components-Kalkulationsstruktur und BoQ-LV-Struktur ist noch offen.
- Übergangslogik zwischen statischen Paketdateien und modularer Bibliothek muss weiter differenziert werden.
- Welche Komponenten/Positionen aus `lvPositionen` in welchem Umfang tatsächlich LV-relevant sind, ist noch nicht fachlich abschließend definiert.

## Kurzfazit

Der aktuelle BoQ-Stand funktioniert als produktiver Übergangszustand, aber die fachliche Zuordnung zwischen Kalkulationspositionen und LV-Textbausteinen ist noch nicht sauber modelliert. Die modulare LV-Bibliothek unter `docs` ist der passende nächste fachliche Bezugspunkt für die Weiterentwicklung.
