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
