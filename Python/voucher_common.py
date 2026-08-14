from __future__ import annotations

import datetime as dt
import os
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import mysql.connector


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT_DIR / ".env"


def load_env(path: Path = ENV_FILE) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_db_config() -> dict[str, object]:
    return {
        "host": required_env("DB_HOST"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": required_env("DB_USER"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": required_env("DB_NAME"),
        "connection_timeout": 20,
    }


def required_env(key: str) -> str:
    value = os.getenv(key, "").strip()
    if not value:
        raise RuntimeError(f"Missing required .env value: {key}")
    return value


def ensure_voucher_table(config: dict[str, object], table_name: str) -> None:
    connection = mysql.connector.connect(**config)
    cursor = connection.cursor()
    try:
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
              id VARCHAR(128) PRIMARY KEY,
              firm VARCHAR(255) NOT NULL,
              date DATE NULL,
              party VARCHAR(255) DEFAULT '',
              voucher_no VARCHAR(255) DEFAULT '',
              voucher_type VARCHAR(100) DEFAULT '',
              amount DECIMAL(14, 2) DEFAULT 0,
              narration TEXT NULL,
              source VARCHAR(50) DEFAULT 'tally',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()
    finally:
        cursor.close()
        connection.close()


def get_firms(config: dict[str, object], firm_id: str) -> list[dict[str, str]]:
    connection = mysql.connector.connect(**config)
    cursor = connection.cursor(dictionary=True)
    try:
        if firm_id:
            cursor.execute("SELECT id, name, port FROM firms WHERE id = %s ORDER BY id", (firm_id,))
        else:
            cursor.execute("SELECT id, name, port FROM firms ORDER BY id")
        return cursor.fetchall()
    finally:
        cursor.close()
        connection.close()


def fetch_vouchers_for_firm(
    firm: dict[str, str],
    voucher_type: str,
    from_date: str,
    to_date: str,
    timeout: int,
) -> list[dict[str, object]]:
    xml = post_to_tally(firm["port"], build_voucher_request(voucher_type, from_date, to_date), timeout)
    root = ET.fromstring(clean_xml(xml))
    vouchers = [element for element in root.iter() if strip_ns(element.tag).upper() == "VOUCHER"]

    return [normalize_voucher(voucher, firm["name"], voucher_type, index) for index, voucher in enumerate(vouchers)]


def post_to_tally(port: str, body: str, timeout: int) -> str:
    request = urllib.request.Request(
        f"http://localhost:{port}",
        data=body.encode("utf-8"),
        headers={"Content-Type": "text/xml"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not connect to Tally on port {port}. {error}") from error


def build_voucher_request(voucher_type: str, from_date: str, to_date: str) -> str:
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
            <FETCH>Date,VoucherNumber,Reference,PartyLedgerName,LedgerName,VoucherTypeName,Narration,Amount,AccountingEntries.*,LedgerEntries.*</FETCH>
            <FILTER>VoucherTypeFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="VoucherTypeFilter">$VoucherTypeName = "{voucher_type}"</SYSTEM>
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


def normalize_voucher(voucher: ET.Element, firm_name: str, voucher_type: str, voucher_index: int) -> dict[str, object]:
    date = normalize_date(text_of(voucher, "DATE"))
    voucher_no = text_of(voucher, "VOUCHERNUMBER") or text_of(voucher, "REFERENCE") or f"TALLY-{voucher_index + 1}"

    return {
        "id": f"{firm_name}-{voucher_type}-{voucher_no}-{voucher_index}",
        "firm": firm_name,
        "date": date,
        "party": text_of(voucher, "PARTYLEDGERNAME") or text_of(voucher, "LEDGERNAME"),
        "voucher_no": voucher_no,
        "voucher_type": text_of(voucher, "VOUCHERTYPENAME") or voucher_type,
        "amount": abs(number_value(text_of(voucher, "AMOUNT")) or collect_amount(voucher)),
        "narration": text_of(voucher, "NARRATION"),
        "source": "tally",
    }


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


def collect_amount(element: ET.Element) -> float:
    total = 0.0
    for child in element.iter():
        if strip_ns(child.tag).upper() == "AMOUNT":
            total += number_value("".join(child.itertext()))
    return abs(total)


def normalize_date(value: str) -> str | None:
    value = (value or "").strip()
    if re.fullmatch(r"\d{8}", value):
        return f"{value[0:4]}-{value[4:6]}-{value[6:8]}"
    return value or None


def save_voucher_records(config: dict[str, object], table_name: str, records: list[dict[str, object]]) -> None:
    if not records:
        return

    connection = mysql.connector.connect(**config)
    cursor = connection.cursor()
    try:
        cursor.executemany(
            f"""
            INSERT INTO {table_name}
              (id, firm, date, party, voucher_no, voucher_type, amount, narration, source)
            VALUES
              (%(id)s, %(firm)s, %(date)s, %(party)s, %(voucher_no)s, %(voucher_type)s,
               %(amount)s, %(narration)s, %(source)s)
            ON DUPLICATE KEY UPDATE
              firm = VALUES(firm),
              date = VALUES(date),
              party = VALUES(party),
              voucher_no = VALUES(voucher_no),
              voucher_type = VALUES(voucher_type),
              amount = VALUES(amount),
              narration = VALUES(narration),
              source = VALUES(source)
            """,
            records,
        )
        connection.commit()
    finally:
        cursor.close()
        connection.close()


def run_voucher_fetch(args, table_name: str, voucher_type: str) -> int:
    load_env()
    db_config = get_db_config()

    ensure_voucher_table(db_config, table_name)
    firms = get_firms(db_config, args.firm_id)
    if not firms:
        print("No firms found. Add firm name and Tally port first.")
        return 0

    total_saved = 0
    for firm in firms:
        if not firm["name"] or not firm["port"]:
            print(f"Skipping {firm['id']}: firm name or port is blank.")
            continue

        try:
            records = fetch_vouchers_for_firm(firm, voucher_type, args.from_date, args.to_date, args.timeout)
            save_voucher_records(db_config, table_name, records)
            total_saved += len(records)
            print(f"{firm['name']}: saved {len(records)} {voucher_type} rows.")
        except Exception as error:
            print(f"{firm['name'] or firm['id']}: {error}")

    print(f"Done. Total saved rows: {total_saved}")
    return 0
