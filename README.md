# NCT Rental — reservations and broker channel system

Web app for running UR-Drive Jordan car rental: reservations, check-out and check-in agreements,
fleet, staff and permissions, finances (expenses, franchise payments, commission) and the
broker channel console (OTA XML, rates, price rules, API keys).

## How it is put together

Everything lives in this one repository and runs as **one Render service** at www.nctrental.com.
(Render still builds from the copy in `car-rental-backend-java` until the switch in `docs/one-repository.md`.)

| Part | Where | What it does |
|------|-------|--------------|
| Website | top level (React 18, TypeScript, Vite, Tailwind) | Everything staff see in the browser |
| Server | `src/` and `pom.xml` (Spring Boot 3, Java 17, PostgreSQL) | Login, data storage, permission checks, broker XML/REST gateway, email |
| Build | `Dockerfile` | Builds the website, puts it inside the server, produces one container |

The browser talks only to the server it was opened from (`services/apiBase.ts`).
`firebase/api.ts` is the server client; the folder name is historical, there is no Firebase.

## Folders

- `App.tsx`, `index.tsx` — app shell, navigation and data loading
- `components/` — screens; `components/channel/` is the broker console, `components/ui/` the shared building blocks
- `services/` — business logic without UI (pricing, revenue, imports, PDF helpers); covered by tests
- `__tests__/` — Jest tests
- `public/` — icons, fonts, `sw.js` (offline cache)
- `scripts/build-web.mjs` — production build
- `src/main/java/com/carrental/backend/`
  - `security/`, `config/` — login (JWT), the server secret, CORS, rate limits
  - `controller/`, `service/` — staff API; `StateSectionGuard` checks who may change which data
  - `ota/` — broker gateway: OTA XML (REST and SOAP), `/api/v3`, OAuth clients, webhooks, rates
  - `notify/` — email (SMTP settings are stored encrypted)
  - `audit/`, `staff/` — activity log, staff accounts
- `src/test/` — server tests

## Working on it

Needs Node 22 (`.node-version`), Java 17 and Maven.

```bash
npm ci               # install exact versions from package-lock.json
npm run dev          # website on http://localhost:5173; set VITE_API_URL to a running server
npm test             # unit tests
npx tsc --noEmit -p . # type check
npm run build        # production build into dist/
mvn test -Dexec.skip=true   # server tests
docker build -t nct . # the same build Render runs
```

End-to-end tests run the real server, with the website inside, on a throwaway in-memory database and
work through the system in a browser like staff and brokers do (`e2e/`):

- every screen, as administrator, as staff and on a phone;
- sign-in, wrong password, signing out and in as someone else;
- turning on two-step sign-in, then signing in with the app code and with a backup code;
- new booking (all five steps), editing a booking, two people saving at the same time;
- full check-out (all seven steps, signatures, receipt PDF) and check-in with a traffic violation
  that reaches the Traffic Tickets register;
- fleet, branches, sources, extras and company details saved on the server;
- creating a staff account and the new person signing in with only their screens;
- expenses (administrator and accountant), vehicle damages, traffic tickets (key 0000), PDF reports;
- a broker over OTA XML: channel, rates, API key, search, booking, change, cancel;
- permissions refused by the server, passwords never sent, health check, error reports.

```bash
npm run build && mvn -B package -DskipTests -Dexec.skip=true
npm run e2e
```

The `e2e` server mode creates two test accounts and refuses to start on any real database.
GitHub runs all of these checks on every push and pull request (`.github/workflows/ci.yml`).

## Settings (environment variables on Render)

Required:

| Name | What |
|------|------|
| `JWT_SECRET` | Random value, at least 32 characters. The server will not start without it. It signs logins and protects stored secrets (SMTP password, connector keys). |
| `JDBC_DATABASE_URL` or `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | PostgreSQL |

Optional: `JWT_SECRET_PREVIOUS` (old secret(s), comma separated, kept while changing the secret
so logins and stored secrets keep working), `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `MAIL_*`,
`LOG_LEVEL_*`, `SESSION_*`.

Monitoring:

- `ALERT_EMAIL`: where error summaries go (at most one email every 30 minutes while errors
  happen). Uses the outgoing email set up in Settings → Email. Without it nothing is emailed.
- Render → Settings → **Health Check Path** = `/health`. It answers `OK` only while the server can
  reach its database, so Render can restart a stuck server.
- Every unexpected error, on the server or in a staff member's browser, gets a reference such as
  `ERR-7K2M9Q`, shown to the person and listed in **Activity Log → System errors**.

Data storage (`STORAGE_MODE`, default `document`): see `docs/database-plan.md`.

| Mode | What happens | Way back |
|------|--------------|----------|
| `document` | All data in one document (as before) | — |
| `dual` | Also every booking and record in its own table row; reads the document | `document` |
| `tables` | Reads bookings and records from the tables, checked against the complete document | `dual` |
| `tables-only` | Bookings and records only in tables; the document keeps settings | `tables` or `dual` (the document is rebuilt) |

In every mode except `document`, each change or deletion of a booking keeps the previous version.
Administrators see this in **Company Details → Data storage**: whether the tables and the document match (per
section and per month), a booking's earlier versions, and recently deleted bookings (server: `/api/admin/storage/…`).

Never commit secret values. `docs/application.example.yml` lists the settings without values.

## Two-step sign-in

Optional for each person (off until they turn it on, so nobody's sign-in changes on its own):
**My Profile → Two-step sign-in → Turn on**, scan the QR code with an authenticator app, type the code.
They get ten single-use backup codes, shown once. From then on, sign-in asks for the password and then the
6-digit code from the app (or a backup code). The app key is stored encrypted, backup codes only as hashes;
a code works once; five tries per sign-in and ten wrong codes per account in 15 minutes.
Someone lost their phone and backup codes: an administrator types their email under **Turn off for them** on
the same page; they sign in with the password and set it up again.

## Changing the server secret

1. Set `JWT_SECRET_PREVIOUS` to the current value and `JWT_SECRET` to a new random value.
2. Deploy. Everyone stays logged in and stored secrets still open.
3. Re-save the SMTP and connector settings once so they are protected with the new secret, then
   remove `JWT_SECRET_PREVIOUS` after the login lifetime has passed.

## Broker XML (OpenTravel)

Each broker channel has an XML layout (OTA XML → channel → **OpenTravel XML layout**):

- **OpenTravel standard** (all new channels): every answer is valid against the official OpenTravel 2017B
  schemas, which the tests check message by message (`src/test/resources/ota-xsd/2017B`, published by the OpenTravel
  Alliance). Codes come from the OpenTravel code lists as used in the Alliance's own sample messages
  (`OtaCodes.java`): vehicle rental 1, surcharge 5, tax 7, extra distance 8; covers CDW 7, PDW 31, PAI 32, PEP 35,
  SLI 42, ALI 1. Covers without an official code get the broker's code on the same screen; until then they are
  sent in `TPA_Extensions/AdditionalCoverages`.
- **As connected**: the layout a broker was built and certified against. Existing channels keep it until the broker
  confirms the standard layout; then switch it on the same screen.

Prices, availability and bookings are identical in both layouts.

## Rules for changes

- Permissions are enforced by the server. Hiding a button in the website is only a convenience.
- Never put keys, passwords or secrets in this repository; the server reads them from its environment.
- Brokers only ever see the brand **UR-Drive Jordan**.
- Run the tests, the type check and the build before every push.
