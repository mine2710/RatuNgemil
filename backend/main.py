"""
Main FastAPI application entry point.
Serves both the API and the frontend static files.
"""

import os
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from database import init_db, get_db
from models import Transaction
from routes import products, transactions, reports
import sheets
from auth import login as auth_login, require_auth

# Initialize FastAPI app
app = FastAPI(
    title="Ratu Ngemil - POS System",
    description="Sistem kasir terintegrasi untuk UMKM",
    version="1.0.0"
)

# CORS middleware - allow all origins for local network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(products.router)
app.include_router(transactions.router)
app.include_router(reports.router)


# --- Google Sheets API Routes ---

class SheetsConfig(BaseModel):
    spreadsheet_id: str
    enabled: bool = True


class LoginPayload(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(payload: LoginPayload):
    """Authenticate user and return API token."""
    token = auth_login(payload.username, payload.password)
    return {"token": token, "username": payload.username}


@app.get("/api/health")
def health_check():
    """Simple health endpoint for deployment checks."""
    return {"status": "API jalan"}


@app.get("/api/sheets/status")
def sheets_status(_auth=Depends(require_auth)):
    """Check Google Sheets integration status."""
    config = sheets.get_sheets_config()
    return {
        "configured": sheets.is_configured(),
        "enabled": config.get("enabled", False),
        "spreadsheet_id": config.get("spreadsheet_id", ""),
        "has_credentials": os.path.exists(sheets.CREDENTIALS_PATH)
    }


@app.post("/api/sheets/config")
def update_sheets_config(config: SheetsConfig, _auth=Depends(require_auth)):
    """Update Google Sheets configuration."""
    sheets.save_sheets_config({
        "spreadsheet_id": config.spreadsheet_id,
        "enabled": config.enabled
    })
    return {"message": "Konfigurasi Google Sheets berhasil disimpan"}


@app.post("/api/sheets/sync/{transaction_id}")
def sync_single_transaction(transaction_id: int, db: Session = Depends(get_db), _auth=Depends(require_auth)):
    """Sync a single transaction to Google Sheets."""
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    
    result = sheets.sync_transaction(tx.to_dict(include_items=True))
    if not result["synced"]:
        raise HTTPException(status_code=500, detail=result.get("reason", "Sync gagal"))
    return result


@app.post("/api/sheets/sync-all")
def sync_all_to_sheets(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    _auth=Depends(require_auth)
):
    """Sync all transactions (with optional date filter) to Google Sheets."""
    from datetime import datetime, timedelta
    
    query = db.query(Transaction)
    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d")
        query = query.filter(Transaction.timestamp >= start)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Transaction.timestamp < end)
    
    transactions = query.order_by(Transaction.timestamp.desc()).all()
    if not transactions:
        raise HTTPException(status_code=404, detail="Tidak ada transaksi untuk disinkronkan")
    
    tx_dicts = [t.to_dict(include_items=True) for t in transactions]
    result = sheets.sync_all_transactions(tx_dicts)
    if not result["synced"]:
        raise HTTPException(status_code=500, detail=result.get("reason", "Sync gagal"))
    return result


# --- Serve Frontend ---

# Get the directory paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
FRONTEND_DIR = os.path.join(PARENT_DIR, "frontend")

# Mount static files
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def serve_index():
    """Serve the main frontend page."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/favicon.ico", include_in_schema=False)
def serve_favicon():
    """Serve favicon to avoid 404 noise in browser logs."""
    return FileResponse(
        os.path.join(FRONTEND_DIR, "assets", "logo.png"),
        media_type="image/png"
    )


# --- Startup Event ---

@app.on_event("startup")
def startup():
    """Initialize database on startup."""
    init_db()
    print("=" * 50)
    print("  RATU NGEMIL - POS System")
    print("  Server berjalan di http://localhost:8000")
    print("  API Docs: http://localhost:8000/docs")
    print("=" * 50)
