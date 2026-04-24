"""
Reports API routes.
Handles Excel export, summary statistics, and Google Sheets sync.
"""

import os
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional
import pandas as pd

from backend.database import get_db
from backend.models import Transaction, TransactionItem
from backend.auth import require_auth

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(require_auth)])


@router.get("/summary")
def get_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get sales summary statistics."""
    query = db.query(Transaction)
    
    # Default: today's data
    if not date_from and not date_to:
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(Transaction.timestamp >= today)
    else:
        if date_from:
            start = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(Transaction.timestamp >= start)
        if date_to:
            end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(Transaction.timestamp < end)
    
    transactions = query.all()
    
    total_revenue = sum(t.total for t in transactions)
    total_transactions = len(transactions)
    total_items = 0
    for t in transactions:
        for item in t.items:
            total_items += item.quantity
    
    avg_transaction = total_revenue / total_transactions if total_transactions > 0 else 0
    
    return {
        "total_revenue": total_revenue,
        "total_transactions": total_transactions,
        "total_items_sold": total_items,
        "average_transaction": avg_transaction
    }


@router.get("/excel")
def export_excel(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Export transactions to Excel file."""
    query = db.query(Transaction)
    
    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d")
        query = query.filter(Transaction.timestamp >= start)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Transaction.timestamp < end)
    
    transactions = query.order_by(Transaction.timestamp.desc()).all()
    
    if not transactions:
        raise HTTPException(status_code=404, detail="Tidak ada transaksi untuk periode ini")
    
    # Build data for Excel
    rows = []
    for t in transactions:
        for item in t.items:
            rows.append({
                "No Transaksi": f"TRX-{t.id:04d}",
                "Tanggal": t.timestamp.strftime("%Y-%m-%d %H:%M:%S") if t.timestamp else "",
                "Produk": item.product_name,
                "Kategori": "",
                "Qty": item.quantity,
                "Harga Satuan": item.price_each,
                "Subtotal Item": item.subtotal,
                "Subtotal Transaksi": t.subtotal,
                "PPN": t.tax,
                "Total Transaksi": t.total,
                "Pembayaran": t.payment,
                "Kembalian": t.change_amount,
                "Cabang": t.branch or "Pusat",
            })
    
    df = pd.DataFrame(rows)
    
    # Write to Excel in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Transaksi', index=False)
        
        # Auto-adjust column widths
        worksheet = writer.sheets['Transaksi']
        for idx, col in enumerate(df.columns):
            max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
            worksheet.column_dimensions[chr(65 + idx)].width = max_len
        
        # Add summary sheet
        summary_data = {
            "Keterangan": ["Total Transaksi", "Total Pendapatan", "Total PPN", "Rata-rata per Transaksi"],
            "Nilai": [
                len(transactions),
                sum(t.total for t in transactions),
                sum(t.tax for t in transactions),
                sum(t.total for t in transactions) / len(transactions) if transactions else 0
            ]
        }
        df_summary = pd.DataFrame(summary_data)
        df_summary.to_excel(writer, sheet_name='Ringkasan', index=False)
    
    output.seek(0)
    
    filename = f"Laporan_Ratu_Ngemil_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/daily")
def get_daily_report(days: int = 7, db: Session = Depends(get_db)):
    """Get daily revenue for the last N days."""
    result = []
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    for i in range(days - 1, -1, -1):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        
        day_total = db.query(func.sum(Transaction.total)).filter(
            Transaction.timestamp >= day_start,
            Transaction.timestamp < day_end
        ).scalar() or 0
        
        day_count = db.query(func.count(Transaction.id)).filter(
            Transaction.timestamp >= day_start,
            Transaction.timestamp < day_end
        ).scalar() or 0
        
        result.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "day_name": day_start.strftime("%A"),
            "revenue": day_total,
            "transactions": day_count
        })
    
    return result
