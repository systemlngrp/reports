from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import mysql.connector


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT_DIR / ".env"


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Sales vouchers from local Tally and save to MySQL.")
    parser.add_argument("--from-date", default="", help="Start date in YYYY-MM-DD format. Defaults to today.")
    parser.add_argument("--to-date", default="", help="End date in YYYY-MM-DD format. Defaults to today.")
    parser.add_argument("--firm-id", default="", help="Fetch one firm only, for example firm-1.")
    args = parser.parse_args()

    load_env(ENV_FILE)
    connection = mysql.connector.connect(
        host=required_env("DB_HOST"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=required_env("DB_USER"),
        password=os.getenv("DB_PASSWORD", ""),
        database=required_env("DB_NAME"),
    )

    try:
        ensure_sales_table(connection)
        firms = get_firms(connection, args.firm_id)
        if not firms:
            print("No firms found. Add firm name and Tally port first.")
            return 0

        total_saved = 0
        for firm in firms:
            if not firm["name"] or not firm["port"]:
                print(f"Skipping {firm['id']}: firm name or port is blank.")
                continue

            try:
                records = fetch_sales_for_firm(firm, args.from_date, args.to_date)
                save_sales_records(connection, records)
                total_saved += len(records)
                print(f"{firm['name']}: saved {len(records)} sales rows.")
            except Exception as error:
                print(f"{firm['name'] or firm['id']}: {error}")

        print(f"Done. Total saved rows: {total_saved}")
        return 0
    finally:
        connection.close()


def load_env(path: Path) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def required_env(key: str) -> str:
    value = os.getenv(key, "").strip()
    if not value:
        raise RuntimeError(f"Missing required .env value: {key}")
    return value


def ensure_sales_table(connection) -> None:
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sales_history (
          id VARCHAR(64) PRIMARY KEY,
          firm VARCHAR(255) NOT NULL,
          date DATE NULL,
          debtor VARCHAR(255) DEFAULT '',
          invoice_no VARCHAR(255) DEFAULT '',
          item VARCHAR(255) DEFAULT '',
          part_no VARCHAR(255) DEFAULT '',
          qty DECIMAL(14, 3) DEFAULT 0,
          rate DECIMAL(14, 3) DEFAULT 0,
          amount DECIMAL(14, 2) DEFAULT 0,
          source VARCHAR(50) DEFAULT 'tally',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.commit()
    cursor.close()


def get_firms(connection, firm_id: str) -> list[dict[str, str]]:
    cursor = connection.cursor(dictionary=True)
    if firm_id:
        cursor.execute("SELECT id, name, port FROM firms WHERE id = %s ORDER BY id", (firm_id,))
    else:
        cursor.execute("SELECT id, name, port FROM firms ORDER BY id")
    rows = cursor.fetchall()
    cursor.close()
    return rows


def fetch_sales_for_firm(firm: dict[str, str], from_date: str, to_date: str) -> list[dict[str, object]]:
    xml = post_to_tally(firm["port"], build_sales_request(from_date, to_date))
    root = ET.fromstring(clean_xml(xml))
    vouchers = [element for element in root.iter() if strip_ns(element.tag).upper() == "VOUCHER"]

    records: list[dict[str, object]] = []
    for voucher_index, voucher in enumerate(vouchers):
        records.extend(normalize_sales_voucher(voucher, firm["name"], voucher_index))
    return records


def post_to_tally(port: str, body: str) -> str:
    request = urllib.request.Request(
        f"http://localhost:{port}",
        data=body.encode("utf-8"),
        headers={"Content-Type": "text/xml"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not connect to Tally on port {port}. {error}") from error


def build_sales_request(from_date: str, to_date: str) -> str:
    return f"""
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VoucherCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVFROMDATE>{tally_date(from_date)}</SVFROMDATE>
        <SVTODATE>{tally_date(to_date)}</SVTODATE>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="VoucherCollection" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>Date,VoucherNumber,PartyLedgerName,VoucherTypeName,InventoryEntries.*,AllInventoryEntries.*</FETCH>
            <FILTER>VoucherTypeFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="VoucherTypeFilter">$VoucherTypeName = "Sales"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
""".strip()


def tally_date(value: str) -> str:
    if not value:
        return dt.date.today().strftime("%Y%m%d")
    return value.replace("-", "")


def clean_xml(xml: str) -> str:
    return re.sub(r"&(?!amp;|lt;|gt;|quot;|apos;)", "&amp;", xml.strip())


def normalize_sales_voucher(voucher: ET.Element, firm_name: str, voucher_index: int) -> list[dict[str, object]]:
    date = normalize_date(text_of(voucher, "DATE"))
    invoice_no = text_of(voucher, "VOUCHERNUMBER") or text_of(voucher, "REFERENCE") or f"TALLY-{voucher_index + 1}"
    debtor = text_of(voucher, "PARTYLEDGERNAME")
    entries = child_lists(voucher, {"ALLINVENTORYENTRIES.LIST", "INVENTORYENTRIES.LIST"})

    if not entries:
        return [
            {
                "id": f"{firm_name}-{invoice_no}-{voucher_index}-0",
                "firm": firm_name,
                "date": date,
                "debtor": debtor,
                "invoice_no": invoice_no,
                "item": "",
                "part_no": "",
                "qty": 0,
                "rate": 0,
                "amount": abs(number_value(text_of(voucher, "AMOUNT"))),
                "source": "tally",
            }
        ]

    records = []
    for entry_index, entry in enumerate(entries):
        records.append(
            {
                "id": f"{firm_name}-{invoice_no}-{voucher_index}-{entry_index}",
                "firm": firm_name,
                "date": date,
                "debtor": debtor,
                "invoice_no": invoice_no,
                "item": text_of(entry, "STOCKITEMNAME"),
                "part_no": text_of(entry, "PARTNO") or text_of(entry, "BASICUSERDESCRIPTION"),
                "qty": abs(number_value(text_of(entry, "ACTUALQTY") or text_of(entry, "BILLEDQTY"))),
                "rate": number_value(text_of(entry, "RATE")),
                "amount": abs(number_value(text_of(entry, "AMOUNT"))),
                "source": "tally",
            }
        )
    return records


def child_lists(element: ET.Element, names: set[str]) -> list[ET.Element]:
    return [child for child in list(element) if strip_ns(child.tag).upper() in names]


def text_of(element: ET.Element, name: str) -> str:
    target = name.upper()
    for child in element.iter():
        if strip_ns(child.tag).upper() == target:
            return "".join(child.itertext()).strip()
    return ""


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1]


def number_value(value: str) -> float:
    match = re.search(r"-?\d+(?:\.\d+)?", value or "")
    return float(match.group(0)) if match else 0.0


def normalize_date(value: str) -> str | None:
    value = (value or "").strip()
    if re.fullmatch(r"\d{8}", value):
        return f"{value[0:4]}-{value[4:6]}-{value[6:8]}"
    return value or None


def save_sales_records(connection, records: list[dict[str, object]]) -> None:
    if not records:
        return

    cursor = connection.cursor()
    cursor.executemany(
        """
        INSERT INTO sales_history
          (id, firm, date, debtor, invoice_no, item, part_no, qty, rate, amount, source)
        VALUES
          (%(id)s, %(firm)s, %(date)s, %(debtor)s, %(invoice_no)s, %(item)s, %(part_no)s,
           %(qty)s, %(rate)s, %(amount)s, %(source)s)
        ON DUPLICATE KEY UPDATE
          firm = VALUES(firm),
          date = VALUES(date),
          debtor = VALUES(debtor),
          item = VALUES(item),
          part_no = VALUES(part_no),
          qty = VALUES(qty),
          rate = VALUES(rate),
          amount = VALUES(amount),
          source = VALUES(source)
        """,
        records,
    )
    connection.commit()
    cursor.close()


if __name__ == "__main__":
    sys.exit(main())
