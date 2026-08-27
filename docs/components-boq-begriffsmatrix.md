# Components ↔ BoQ Begriffs- und Positionsmatrix

Dieses Dokument ist die zentrale fachliche Begriffs- und Mappinggrundlage für den gemeinsamen Workspace aus `01_Components_reload` und `02_BoQ`. Es fasst zusammen, welche technischen Components-Schlüssel welche fachliche Bedeutung tragen, welchem LV-Bibliotheks-Begriff sie entsprechen (oder entsprechen könnten) und wie eindeutig diese Zuordnung heute ist.

Grundlage sind ausschließlich verifizierte Fundstellen im Code (`frontend/js/package-defaults.js`, `backend/calculation-engine.js` in `01_Components_reload`; `POSITION_MAPPING_RULES` und `backend/lv/bibliothek.json` in `02_BoQ`) sowie die modulare Word-LV-Bibliothek (`docs/260824_LV_Bibliothek_Components_modular.docx`). Es werden keine neuen fachlichen Annahmen ergänzt, die nicht bereits in der vorangegangenen Architekturanalyse belegt wurden.

Dieses Dokument ist ein **lebendes Artefakt**. Der `status`-Wert je Zeile soll bei jeder neuen fachlichen Entscheidung aktualisiert werden:

- `bestätigt` – Zuordnung ist im Code umgesetzt und durch den Contract-Test abgesichert.
- `prüfen` – Zuordnung/Bedeutung ist teilweise geklärt, aber es bestehen Unschärfen, Doppeldeutigkeiten oder ein bekanntes Teilproblem (Granularität).
- `offen` – es existiert aktuell kein bestätigtes Mapping bzw. keine abgeschlossene fachliche Entscheidung.

## Legende

- **Beziehung:**
  - `1:1` – eine Components-Position entspricht genau einer LV-Bibliotheks-ID.
  - `n:1` – mehrere Components-Positionen zeigen auf dieselbe LV-Bibliotheks-ID (Dedupliziert).
  - `1:n (variantenabhängig)` – eine Components-Position kann je nach technischem Kontext auf unterschiedliche LV-Bibliotheks-IDs zeigen.
  - `kein eindeutiger Treffer` – aktuell keine passende LV-Bibliotheks-ID identifiziert.
- **Bewertung:**
  - `eindeutig` – Schlüssel, Bezeichnung und fachliche Bedeutung stimmen überein.
  - `missverständlich` – Schlüsselname oder Bezeichnung suggerieren etwas anderes als die tatsächliche fachliche Bedeutung.
  - `historisch gewachsen` – Schlüssel/Struktur stammt erkennbar aus einer früheren, nicht mehr vollständig passenden Modellierung.
  - `fachlich zu prüfen` – die Bedeutung ist technisch nachvollziehbar, aber fachlich noch nicht abschließend entschieden.
  - `offen` – keine ausreichende Datengrundlage für eine Bewertung.

## Matrix

| Paket | Components-Key | Components-Bezeichnung | Tatsächliche Bedeutung (Kalkulationslogik) | Datentyp / Mengenlogik | Fachlicher LV-Begriff | Mögliche Bibliotheks-ID(s) | Beziehung | Bewertung | Status |
|---|---|---|---|---|---|---|---|---|---|
| antrieb | `maschine_standardrahmen` | Anzeige-Label lt. Calc-Engine: „Antrieb / Maschine ohne Rahmen“ | Bei **Seil**: Antriebsmaschine (Motor+Getriebe) *ohne* Rahmen (Rahmen separat als `adapterrahmen`). Bei **Hydraulik**: das *komplette* Hydraulikaggregat inkl. Gestell | Stk, immer `anzahl: 1` | Antrieb Seil (Kap. 13) *oder* Antrieb Hydraulik (Kap. 14) | Teilweise geschlossen (2026-08-25, Variantengruppe `antrieb-standardrahmen` in `POSITION_MAPPING_RULES`): Hydraulik + `frequenzgeregelt` → `LV_14_01_TWR_HYDRAULIK_FREQUENZGEREGELT`; Hydraulik + `softstart` → `LV_14_02_TWR_HYDRAULIK_MIT_SOFTSTART` (beide verifiziert gegen die Word-Quelle, Kapitel 14). Weiterhin bewusst offen: Hydraulik + `konventionell`/leer (kein Baustein in Kapitel 14 vorhanden, siehe `docs/lv-architecture.md` Abschnitt 20) sowie Seil (kein eindeutiger 1:1-Kandidat unter `LV_13_01`/`LV_13_02`/`LV_13_03`) | 1:n (variantenabhängig) | missverständlich + fachlich zu prüfen (nur für den offenen Rest) | `prüfen` |
| antrieb | `hydraulikschlauch` + `hydraulikoel` | „Hydraulikschlauch“ / „Hydrauliköl“ | zwei separate Kalkulationspositionen, fachlich ein LV-Baustein | `hydraulikoel`: Liter (linear aus Tragfähigkeit berechnet); `hydraulikschlauch`: Stk pauschal | Hydraulikschläuche und Hydrauliköl | `LV_14_05_HYDRAULIKSCHLAUCHE_UND_HYDRAULIKOL` | n:1 | eindeutig | `bestätigt` |
| antrieb | `frequenzregelung` | „Frequenzregelung“ | Wird von der Calc-Engine nur bei `hydraulikRegelungsart = frequenzgeregelt` und positiver Menge erzeugt | Stk | Frequenzumrichter / Regelung | `LV_12_12_FREQUENZUMRICHTER_REGELUNG` | 1:1 | eindeutig, eigene Position | `bestätigt` |
| antrieb | `tragseile`, `ablenkrolle` | „Tragseile“ / „Ablenkrollen“ | Bei Seil Standardausstattung; bei Hydraulik nur bei `hydraulik-indirekt` vorhanden | Stk (`ablenkrolle`-Menge abhängig von `aufhaengung`) | evtl. Kap. 14-Unterbaustein oder Analogie zu Kap. 13 | kein Bibliothekseintrag identifiziert | kein eindeutiger Treffer | historisch gewachsen | `offen` |
| antrieb | `aufhaengung` | „Aufhängung“ (`1:1`/`2:1`) | Kommt sowohl als `technischeParameter.aufhaengung` als auch als `fahrkorb.aufhaengung` vor; bei Hydraulik-indirekt wird `2:1` erzwungen | technisches Attribut, keine eigenständige Kalkulationsposition | Variantensteuerung für Kap. 13/14 | kein direktes Mapping (Attribut, keine Position) | – | missverständlich (doppelt geführtes Feld) | `prüfen` |
| antrieb | `antriebTyp` | „Antriebsart“ (UI) | mechanische Bauart-Dimension: `seil-oben` / `hydraulik-direkt` / `hydraulik-indirekt` | Enum | Kapitelwahl (13 vs. 14) | – | steuert `technicalCondition`/Paket-Defaults | missverständlich (Name suggeriert „Typ“ allgemein, ist Konstruktionsvariante) | `prüfen` |
| antrieb | `hydraulikRegelungsart` | „Regelungsart“ (seit 2026-08-24, vorher automatisch aus `antriebTyp` abgeleitet) | Elektronik-Dimension: `frequenzgeregelt` / `softstart` / `konventionell` / offen – unabhängig von `antriebTyp` | Enum | Unterbaustein-Auswahl innerhalb Kap. 14 (`LV_14_01`/`LV_14_02`) | `LV_14_01` (frequenzgeregelt), `LV_14_02` (softstart); `konventionell` ohne Bibliotheks-ID | 1:n (variantenabhängig) | fachlich zu prüfen (Beispiel: darf nicht mit `antriebTyp` verwechselt werden) | `prüfen` |
| steuerung | `steuerung` | „Steuerung Grundpreis ohne Tableaus und FU“ | Grundposition | Stk | Steuerung | `LV_12_02_STEUERUNG` | 1:1 | eindeutig | `bestätigt` |
| steuerung | `fahrkorbtableau` | „Fahrkorbtableau“ | 1:1 | Stk | Fahrkorbtableau vertikal | `LV_10_20_FAHRKORBTABLEAU_VERTIKAL` | 1:1 | eindeutig | `bestätigt` |
| steuerung | `aussenruftableau` | „Außenruftableau“ | Menge = `schachtzugaenge` | Stk | Befehlsgeber (Außenruf) | `LV_11_16_BEFEHLSGEBER_AUSSENRUF` | 1:1 | eindeutig | `bestätigt` |
| steuerung | `standanzeige` | „Stand- und Weiterfahrtsanzeige“ | Menge = `schachtzugaenge` | Stk | Stand-/Weiterfahrtanzeige Außen | `LV_11_20_STAND_UND_WEITERFAHRTANZEIGE_AUSSEN` | 1:1 | eindeutig | `bestätigt` |
| steuerung | `schachtbeleuchtung` | „Schachtbeleuchtung“ | 1:1 | Stk | Schachtbeleuchtung | `LV_09_02_SCHACHTBELEUCHTUNG` | 1:1 | eindeutig | `bestätigt` |
| steuerung | `kabelkanaele` | „Kabelkanäle / Elektromaterial“ | 1:1 | Stk | Schachtinstallation (Elektro) | `LV_09_01_SCHACHTINSTALLATION_ELEKTRO` | 1:1 | eindeutig | `bestätigt` |
| fahrschacht | `antrittsblech` | „Antrittsblech“ | Antrittsbleche zwischen Schachttürschwelle und Bestandsboden | Stk | Antrittsbleche | `LV_11_24_ANTRITTSBLECHE` | 1:1 | eindeutig | `bestätigt` |
| steuerung | `frequenzumrichter`, `bremswiderstand`, `verbindungsleitungen`, `lastmessung`, `kontakt_regler`, `inkrementalgeber`, `notruf` | diverse | Bei Hydraulik werden mehrere dieser Keys per Code-Filter (`delete steuerungBasis.*`) aus den Paket-Defaults entfernt, bevor sie in die Kalkulation gelangen. Granularitätsproblem behoben (2026-08-25): `contentSource: 'static'` löst pro Regel genau ein Modul auf, nicht mehr das gesamte `steuerung.json`-Paket; diese 7 Keys sind jetzt explizit als `open` in `POSITION_MAPPING_RULES` (`open-steuerung-antriebsregelung`) getrackt, statt bei Positivität unberücksichtigt zu bleiben | Stk | teils in `steuerung.json`-Modulen enthalten (nicht granular geprüft) | kein individuelles Mapping – bewusst offen, kein erfundener Bibliotheksbaustein | – | fachlich zu prüfen (welcher Bibliotheksbaustein je Key, falls vorhanden) | `prüfen` |
| fahrkorb | `led_flaechenlicht_fahrkorb` | „LED Flächenlicht über komplette Fahrkorbfläche“ | Vollflächige Fahrkorbdeckenbeleuchtung | Stk | LED-Flächenlicht | `LV_10_11_02_LED_FLACHENLICHT` | 1:1 | eindeutig | `bestätigt` |
| fahrkorb | `lichtgitter_vorhandene_fahrkorbschiebetuer` | „Lichtgitter bei vorhandener Fahrkorbschiebetür“ | Berührungsloses Lichtgitter an vorhandener Fahrkorbtür | Stk | Lichtvorhang | `LV_10_30_LICHTVORHANG` | 1:1 | eindeutig | `bestätigt` |
| messungen | `zues_kosten_vorpruefung`, `zues_kosten_abnahme`, `zues_begleitung_durch_an_aufzug`, `pruefgewichte` | ZÜS-bezogene Einzelpositionen | 4 Components-Positionen → 1 LV-Baustein, nur bei `projektart = Teilmodernisierung` | Stk | Inverkehrbringung/Inbetriebnahme (PVI) | `LV_02_07_INVERKEHRBRINGUNG_INBETRIEBNAHME_PVI` | n:1 (bedingt) | eindeutig | `bestätigt` |
| messungen | `transport_allgemein_baustelle_lager` | „Transport…“ | nur bei Teilmodernisierung | Stk | Transport und Baustelleneinrichtung | `LV_02_09_TRANSPORT_UND_BAUSTELLENEINRICHTUNG` | 1:1 (bedingt) | eindeutig | `bestätigt` |
| fahrschacht | `anstrich_schachtgrube` | „Anstrich Schachtgrube“ | 1:1 | Stk | Malerarbeiten (Schachtgrube) | `LV_07_05_MALERARBEITEN_SCHACHTGRUBE` | 1:1 | eindeutig | `bestätigt` |
| fahrschacht | `tuerfuehrungen` | „Türführungen“ | Untere Führungsschuhe für Schachtschiebetüren | Stk | Untere Türführung für Automatiktüren | `LV_11_12_UNTERE_TURFUHRUNG_FUR_AUTOMATIKTUREN` | 1:1 | eindeutig, neutral | `bestätigt` |
| fahrschacht | `tuerlaufrollen` | „Türlaufrollen“ | Laufrollen der automatischen Schachttüren | Stk | Laufrollen für Automatiktüren | `LV_11_07_LAUFROLLEN_FUR_AUTOMATIKTUREN` | 1:1 | eindeutig, neutral | `bestätigt` |
| fahrschacht | `tuerkontakte` | „Türkontakte“ | Türkontakte der automatischen Schachttüren | Stk | Türkontakt für Automatiktüren | `LV_11_10_TURKONTAKT_FUR_AUTOMATIKTUREN` | 1:1 | eindeutig, neutral | `bestätigt` |
| fahrschacht | `tuerseile` | „Türseile“ | Türseile der automatischen Schachttüren | Stk | Türseil für Automatiktüren | `LV_11_13_TURSEIL_FUR_AUTOMATIKTUREN` | 1:1 | eindeutig, neutral | `bestätigt` |
| messungen | `hst_duebel_schachttueren`, `chemieduebel_schachttueren`, `auszugsversuch_mauerwerksschaechten` | Befestigungs-/Dübelpositionen | Kalkulatorische Nebenleistungen, keine eigenständige LV-Position | Stk | – | – | – | eindeutig `not_lv_position` | `bestätigt` |
| messungen | `montageruestung` | „Montagerüstung“ | Kalkulatorische Nebenleistung, keine eigenständige LV-Position | Stk | – | – | – | eindeutig `not_lv_position` | `bestätigt` |
| fahrkorb | `teil_umbaukit_schiebetueren` | „Teil-Umbaukit für automatische Schiebetüren “ | Teilumbau der Türantriebstechnik | Stk | ähnlich, aber nicht identisch zu `LV_10_28_FAHRKORBABSCHLUSSTUR_UBERHOLEN_UMBAUSATZ` (bezieht sich auf die ganze Fahrkorbabschlusstür, nicht nur ein Teil-Kit) | keine exakte Entsprechung gefunden | kein eindeutiger Treffer | offen | `offen` |

## Offene fachliche Entscheidungen

- ~~Soll `maschine_standardrahmen` langfristig in zwei fachlich getrennte Components-Keys aufgeteilt werden (Seil-Maschine vs. Hydraulikaggregat), oder soll die Zuordnung stattdessen über variantenabhängige Mapping-Regeln (mehrere Ziel-IDs je nach `antriebTyp`/`hydraulikRegelungsart`) gelöst werden?~~ **Entschieden (2026-08-25):** variantenabhängige Mapping-Regeln (Variantengruppe `antrieb-standardrahmen`, unterscheidet nach `hydraulikRegelungsart`, nicht nach `antriebTyp`). Kein Aufsplitten des Components-Keys nötig.
- Wie soll `hydraulikRegelungsart = 'konventionell'` behandelt werden – verifiziert (2026-08-25): Kapitel 14 der Word-Bibliothek enthält außer `LV_14_01`/`LV_14_02` keinen weiteren TWR-Aggregat-Baustein. Offen bleibt die fachliche Entscheidung: neuen Bibliothekstext für `konventionell` verfassen lassen, oder diese Variante bewusst dauerhaft ohne LV-Position lassen?
- Die vier Türtechnik-Zuordnungen sind nach Neutralisierung der Bibliotheksbezeichnungen bestätigt und verwenden keine Herstellerannahme.
- Für `maschine_standardrahmen` bei Seil (`aufzugstyp = seil`) existiert weiterhin kein eindeutiger 1:1-Kandidat (`LV_13_01`/`LV_13_02`/`LV_13_03`, Kapitel 13 „Antrieb Seil“) - welcher davon (falls überhaupt einer) tatsächlich zutrifft, ist noch nicht entschieden.
- Für `teil_umbaukit_schiebetueren` bleibt offen, ob im Word-Dokument bereits ein fachlich passender Kandidat existiert.
- `frequenzregelung` ist als eigene LV-Position bestätigt und wird getrennt von `maschine_standardrahmen` auf `LV_12_12_FREQUENZUMRICHTER_REGELUNG` gemappt.
- Soll das doppelt geführte Feld `aufhaengung` (`technischeParameter.aufhaengung` vs. `fahrkorb.aufhaengung`) auf eine einzige Quelle konsolidiert werden?
