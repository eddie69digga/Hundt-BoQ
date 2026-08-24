# BoQ-Authentifizierung und Cloud-Export-Nutzer

## Zentrale Benutzerkonfiguration

Die freigegebenen BoQ-Benutzer werden in `backend/server.js` in
`PASSWORD_ENV_BY_USERNAME` gepflegt. Dieselbe Konfiguration steuert sowohl
`POST /api/login` als auch die Freigabe der Endpunkte unter
`GET /api/xl-exports`.

Aktuell konfigurierte Zuordnungen:

- `admin` verwendet `ADMIN_PASSWORD`
- `testuser` verwendet `TESTUSER_PASSWORD`
- `eddie` verwendet `EDDIE_PASSWORD`

Passwortwerte dürfen ausschließlich als Environment Variables bereitgestellt
werden. Lokal kann dafür die von Git ignorierte Datei `backend/.env` verwendet
werden. Produktiv müssen die Variablen im Render-Service des BoQ-Backends
gesetzt werden. Es gibt keinen Passwort-Fallback im Quellcode.

## Frontend und Components-Handoff

Das BoQ-Frontend betrachtet weder einen URL-Parameter `username` noch einen
alten `localStorage`-Eintrag als erfolgreichen Login. Der Components-Handoff
mit `export_id` und `username` bleibt erhalten: Der übergebene Benutzername wird
im Loginformular vorgefüllt. Erst nach erfolgreichem `POST /api/login` wird die
App geöffnet und der angeforderte Cloud-Export automatisch geladen.

Der authentifizierte Benutzername wird nur im Speicher der aktuellen Seite
gehalten. Ein Neuladen der BoQ-Seite erfordert deshalb eine erneute Anmeldung.

## Supabase

Supabase ist für BoQ keine Authentifizierungsquelle. Die Backend-Endpunkte
prüfen den angefragten Benutzernamen gegen die zentrale Konfiguration, lesen
aus der Tabelle `xl_exports` und filtern serverseitig mit
`username = <freigegebener Benutzername>`. Das Frontend ruft diese Endpunkte
erst nach einem erfolgreichen BoQ-Login auf. `SUPABASE_URL` und
`SUPABASE_SERVICE_ROLE_KEY` werden ebenfalls ausschließlich über Environment
Variables konfiguriert.
