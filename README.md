# Report

Local React + Node app for fetching Tally data from configured firms.

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The React app calls the backend through `/api`. The backend runs on:

```text
http://localhost:4000
```

## Sales Management Tracker

Use **Customer Targets** to enter April–March targets and **Intercompany** to identify debtor ledgers that should be excluded. The **Sales Tracker** then reports gross sales, credit notes, exclusions, net sales, target achievement, customer performance, and the monthly matrix for an Indian financial year.

The tracker can be saved through the browser's **Print / PDF** action or exported as a multi-sheet Excel workbook.

## Company Master Sync

The **Master → Companies** page reads company records received at `POST /api/sync/companies`. Requests must send the configured `NPD_SYNC_SECRET` in the `X-Sync-Secret` header and identify the tab configured by `NPD_SYNC_ALLOWED_TAB` (normally `Companies`). Records are upserted by the sheet's `Id` column.

## Tally Setup

In the app, open `Firms` and add each firm name with its Tally HTTP port number. Tally must be running on the same Windows PC, with HTTP/XML access available on those ports.

## Hostinger Database

The app works immediately with local JSON data. When the Hostinger MySQL/MariaDB database is ready, copy `.env.example` to `.env` and fill:

```text
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=u380633007_reports
```

When `DB_HOST`, `DB_USER`, and `DB_NAME` are set, the backend creates the required `firms` and `sales_history` tables automatically.
