# P11 — Moving the data into proper database tables (plan)

Status: **built and tested, not switched on.** The code is in place with `STORAGE_MODE=document` (as before)
as the default, so deploying it changes nothing. Each switch below is one setting on Render, needs your
approval, a fresh Render export, and a quiet time window.

Render backups (checked): Point-in-Time Recovery for the last 3 days, and Export for complete backup files.

## 1. How the data is stored today

| What | Where |
|------|-------|
| Bookings, fleet, staff list, invoices, traffic tickets, damages, expenses, franchise payments, sources, locations, extras, company details, OTA settings | **One row** in table `app_data` (id `main`), as one large JSON text |
| Backups | Up to 72 hourly copies of that row, in the **same table** (three days) |
| Login accounts, activity log, broker gateway (channels, rates, broker bookings, webhooks) | Their own tables already |
| Old tables `reservations`, `vehicles`, `traffic_tickets`, `expenses`, … | Left over from an earlier version. The app does not use them; a few old server parts still read `reservations` and `vehicles` |
| Table structure | Changed automatically at start-up (`ddl-auto=update`), with no record of what changed |

It works, and it has been made safe for one server: saves are applied one after another, each
save only changes the sections it touched, and staff permissions are checked per section (P2).

## 2. Why change it

1. **Every save rewrites everything.** Saving one booking writes the whole document (all
   bookings of all years). It grows with every booking, so saves and loads get slower year by year.
2. **One damaged save can affect everything.** A bad save or a bug touches all data at once; the
   only cure is restoring the whole document from an hourly copy, losing everything after it.
3. **Backups live in the same place as the data.** If the database is lost, the hourly copies
   are lost with it.
4. **The database cannot protect the data.** It cannot refuse a duplicate booking number, a
   booking without dates, or a ticket for a booking that does not exist, because it only sees text.
5. **Reports need everything.** Yearly summary, accounting and the broker gateway must load and
   read the whole document to answer one question.
6. **Two ways of storing bookings.** The old `reservations` table and the document disagree,
   which is confusing and a source of mistakes.

## 3. What does not change

- Staff see the same screens and work the same way. No retraining.
- Logins, passwords and permissions stay exactly as they are.
- Brokers see no change (same XML/REST answers, same booking numbers).
- One server, as today.
- The JSON document is kept, read-only, for at least 30 days after each phase as a fallback.

## 4. The plan, in phases

### How to switch, step by step

1. Render → car-rental-db → Recovery → **Create export**, download it.
2. Render → NCT backend-java → Environment → `STORAGE_MODE` = `dual` → deploy. As an
   administrator, open **Company Details → Data storage → Data storage check**: it must say "Everything
   matches" and every line "Identical".
3. After 1–2 weeks with "identical" every day: `STORAGE_MODE` = `tables`, deploy, check again.
4. After another quiet week: `STORAGE_MODE` = `tables-only`.
5. Any problem at any step: set the previous value back and deploy. Nothing is lost.

### Phase 0 — Safety first (no data moved)

- Take a full database backup outside the database (Render's PostgreSQL backup and a
  `pg_dump` file kept somewhere else) and **test restoring it** on a separate database.
- Add versioned table changes (Flyway): every table change becomes a numbered, reviewed file in
  the repository, run once, recorded in the database. The current structure is recorded as the
  starting point ("baseline"); nothing changes in the tables.
- Add a daily backup export of the business data to a file outside the database.

Risk: none for the data. Rollback: not needed.

### Phase 1 — Bookings (the biggest and busiest section)

1. **New table `bookings`**: one row per booking, with the fields reports need as real columns
   (booking number — unique, year/month, status, pick-up and return dates, source, branch, car,
   amounts, agreement state, version) plus the remaining details as JSON, so no field is lost.
2. **Copy** all bookings from the document into the table (read-only on the document).
   Check: same number of bookings per month, same totals per month and per source, every booking
   number found once. Any difference stops the phase.
3. **Write to both** for 1–2 weeks: every save goes to the document *and* the table; a daily
   comparison report lists any difference (there should be none).
4. **Switch reading** to the table (behind a setting that can be turned back instantly).
5. Stop writing bookings into the document after a quiet week; the document keeps its last copy
   for 30 days.

The broker gateway and the reports then read only the bookings they need (one month, one car),
instead of the whole document.

Rollback at any step: turn the setting back; the document is still complete.

### Phase 2 — The other records

Same method (copy → check → write to both → switch → retire), one section at a time:
fleet (cars), invoices, traffic tickets, vehicle damages, expenses, franchise payments.
Each gets its own table with the database checks that fit it (for example: a ticket's booking
number must exist; a car's plate number is unique).

### Phase 3 — Settings stay as a document

Company details, agreement terms, extras, locations, sources and OTA display settings are small,
change rarely and are always used together. They stay in one settings document — this is the
normal, professional choice for settings.

### Phase 4 — Clean-up

- Remove the old unused tables (`reservations`, `vehicles`, …) and the old server parts that read
  them, after confirming nothing uses them (each one checked and listed for approval first).
- Move the hourly copies out of the main table (they are replaced by the daily export from
  Phase 0 and the per-record history).
- Keep a change history per booking (who changed what, when) — useful for disputes.

## 5. Safety rules for every phase

- Separate approval for each phase, with the exact list of tables and code changes.
- A fresh, tested backup taken the same day, before starting.
- Done in a quiet time window you choose (for example late evening).
- Automatic checks before and after: counts and money totals per month must match exactly.
- The whole test suite (website, server, end-to-end) passes before and after.
- A one-step way back at every point until the old copy is retired.
- Nothing is deleted until you approve it, at the end, after at least 30 days.

## 6. What I need from you before Phase 0

1. Approval to start Phase 0 (backups and versioned table changes only — no data moved).
2. Which Render PostgreSQL plan you are on (its backup options differ by plan), or a screenshot of
   the database's **Backups** page — never the passwords.
3. A quiet time window for later phases.
