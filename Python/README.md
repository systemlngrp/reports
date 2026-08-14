# Sales Data Fetch

This Python script fetches Sales vouchers from local Tally and saves item rows into the MySQL `sales_history` table.

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
