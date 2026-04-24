"""
Google Sheets integration module.
Syncs transaction data to a Google Spreadsheet.

Setup instructions:
1. Go to https://console.cloud.google.com/
2. Create a new project (or use existing)
3. Enable "Google Sheets API" and "Google Drive API"
4. Create a Service Account (IAM & Admin > Service Accounts)
5. Download the JSON key file
6. Save it as: pos-app/data/google_credentials.json
7. Create a Google Spreadsheet
8. Share the spreadsheet with the service account email (found in the JSON file)
9. Copy the spreadsheet ID from the URL and set it in the app
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
CREDENTIALS_PATH = os.path.join(DATA_DIR, "google_credentials.json")
CONFIG_PATH = os.path.join(DATA_DIR, "sheets_config.json")


def get_sheets_config():
    """Load Google Sheets configuration."""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    return {"spreadsheet_id": "", "enabled": False}


def save_sheets_config(config: dict):
    """Save Google Sheets configuration."""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


def is_configured():
    """Check if Google Sheets integration is properly configured."""
    config = get_sheets_config()
    return (
        config.get("enabled", False)
        and config.get("spreadsheet_id", "")
        and os.path.exists(CREDENTIALS_PATH)
    )


def get_client():
    """Get authenticated gspread client."""
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]

        credentials = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=scopes)
        client = gspread.authorize(credentials)
        return client
    except Exception as e:
        logger.error(f"Failed to connect to Google Sheets: {e}")
        raise


def sync_transaction(transaction_dict: dict):
    """
    Sync a single transaction to Google Sheets.
    Appends transaction data as rows to the 'Transaksi' sheet.
    """
    if not is_configured():
        return {"synced": False, "reason": "Google Sheets belum dikonfigurasi"}

    try:
        config = get_sheets_config()
        client = get_client()
        spreadsheet = client.open_by_key(config["spreadsheet_id"])

        # Get or create 'Transaksi' worksheet
        try:
            worksheet = spreadsheet.worksheet("Transaksi")
        except Exception:
            worksheet = spreadsheet.add_worksheet(title="Transaksi", rows=1000, cols=13)
            # Add headers
            headers = [
                "No Transaksi", "Tanggal", "Produk", "Qty",
                "Harga Satuan", "Subtotal Item", "Subtotal Transaksi",
                "PPN", "Total", "Pembayaran", "Kembalian", "Catatan", "Cabang"
            ]
            worksheet.append_row(headers)

        # Append items
        tx_id = f"TRX-{transaction_dict['id']:04d}"
        timestamp = transaction_dict.get("timestamp", "")

        for item in transaction_dict.get("items", []):
            row = [
                tx_id,
                timestamp,
                item.get("product_name", ""),
                item.get("quantity", 0),
                item.get("price_each", 0),
                item.get("subtotal", 0),
                transaction_dict.get("subtotal", 0),
                transaction_dict.get("tax", 0),
                transaction_dict.get("total", 0),
                transaction_dict.get("payment", 0),
                transaction_dict.get("change_amount", 0),
                transaction_dict.get("notes", ""),
                transaction_dict.get("branch", "Pusat")
            ]
            worksheet.append_row(row, value_input_option="USER_ENTERED")

        return {"synced": True, "message": f"Transaksi {tx_id} berhasil disinkronkan ke Google Sheets"}

    except Exception as e:
        logger.error(f"Google Sheets sync error: {e}")
        return {"synced": False, "reason": str(e)}


def sync_all_transactions(transactions: list):
    """Sync multiple transactions to Google Sheets (batch)."""
    if not is_configured():
        return {"synced": False, "reason": "Google Sheets belum dikonfigurasi"}

    try:
        config = get_sheets_config()
        client = get_client()
        spreadsheet = client.open_by_key(config["spreadsheet_id"])

        # Get or create 'Transaksi' worksheet
        try:
            worksheet = spreadsheet.worksheet("Transaksi")
            worksheet.clear()
        except Exception:
            worksheet = spreadsheet.add_worksheet(title="Transaksi", rows=1000, cols=13)

        # Add headers
        headers = [
            "No Transaksi", "Tanggal", "Produk", "Qty",
            "Harga Satuan", "Subtotal Item", "Subtotal Transaksi",
            "PPN", "Total", "Pembayaran", "Kembalian", "Catatan", "Cabang"
        ]

        all_rows = [headers]

        for t in transactions:
            tx_id = f"TRX-{t['id']:04d}"
            timestamp = t.get("timestamp", "")

            for item in t.get("items", []):
                row = [
                    tx_id,
                    timestamp,
                    item.get("product_name", ""),
                    item.get("quantity", 0),
                    item.get("price_each", 0),
                    item.get("subtotal", 0),
                    t.get("subtotal", 0),
                    t.get("tax", 0),
                    t.get("total", 0),
                    t.get("payment", 0),
                    t.get("change_amount", 0),
                    t.get("notes", ""),
                    t.get("branch", "Pusat")
                ]
                all_rows.append(row)

        # Batch update for performance
        worksheet.update(range_name=f"A1:M{len(all_rows)}", values=all_rows, value_input_option="USER_ENTERED")

        return {
            "synced": True,
            "message": f"Berhasil menyinkronkan {len(transactions)} transaksi ke Google Sheets"
        }

    except Exception as e:
        logger.error(f"Google Sheets batch sync error: {e}")
        return {"synced": False, "reason": str(e)}
