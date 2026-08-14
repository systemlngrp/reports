from __future__ import annotations

import argparse
import sys

from voucher_common import run_voucher_fetch


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Receipt vouchers from local Tally and save to MySQL.")
    parser.add_argument("--from-date", default="", help="Start date in YYYY-MM-DD format. Defaults to today.")
    parser.add_argument("--to-date", default="", help="End date in YYYY-MM-DD format. Defaults to today.")
    parser.add_argument("--firm-id", default="", help="Fetch one firm only, for example firm-1.")
    parser.add_argument("--timeout", type=int, default=60, help="Tally request timeout in seconds.")
    return run_voucher_fetch(parser.parse_args(), "receipts_history", "Receipt")


if __name__ == "__main__":
    sys.exit(main())
