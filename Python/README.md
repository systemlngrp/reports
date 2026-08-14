# Tally Data Fetch

These Python scripts fetch vouchers from local Tally and save rows into MySQL.

## Setup

```bash
cd Python
python -m pip install -r requirements.txt
```

The script reads database settings from the project `.env` file.

## Run

Fetch today's sales for all configured firms:

```bash
python fetch_sales.py
```

Fetch sales for a date range:

```bash
python fetch_sales.py --from-date 2026-08-01 --to-date 2026-08-14
```

Fetch one firm only:

```bash
python fetch_sales.py --firm-id firm-1
```

Fetch receipts:

```bash
python fetch_receipts.py --from-date 2026-08-01 --to-date 2026-08-14
```

Fetch credit notes:

```bash
python fetch_credit_notes.py --from-date 2026-08-01 --to-date 2026-08-14
```
