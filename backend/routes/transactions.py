"""
Transaction API routes.
Handles creating transactions, listing, and detail views.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from database import get_db
from models import Product, Transaction, TransactionItem
from auth import require_auth

router = APIRouter(prefix="/api/transactions", tags=["transactions"], dependencies=[Depends(require_auth)])


# --- Pydantic Schemas ---

class TransactionItemCreate(BaseModel):
    product_id: int
    quantity: int


class TransactionCreate(BaseModel):
    items: List[TransactionItemCreate]
    payment: float
    tax_rate: float = 0  # 0 = no tax, 0.11 = 11% PPN
    notes: Optional[str] = None
    branch: str = "Pusat"


# --- Routes ---

@router.get("")
def list_transactions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    List transactions with optional date range filter.
    Date format: YYYY-MM-DD
    """
    query = db.query(Transaction)
    
    if date_from:
        try:
            start = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(Transaction.timestamp >= start)
        except ValueError:
            raise HTTPException(status_code=400, detail="Format tanggal salah. Gunakan YYYY-MM-DD")
    
    if date_to:
        try:
            end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(Transaction.timestamp < end)
        except ValueError:
            raise HTTPException(status_code=400, detail="Format tanggal salah. Gunakan YYYY-MM-DD")
    
    transactions = query.order_by(Transaction.timestamp.desc()).limit(limit).all()
    return [t.to_dict(include_items=True) for t in transactions]


@router.get("/{transaction_id}")
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Get a single transaction with its items."""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    return transaction.to_dict(include_items=True)


@router.post("")
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    """
    Create a new transaction.
    - Validates product availability and stock
    - Calculates totals
    - Reduces stock automatically
    """
    if not data.items:
        raise HTTPException(status_code=400, detail="Transaksi harus memiliki minimal 1 item")
    
    # Validate all products and calculate subtotal
    subtotal = 0
    items_data = []
    
    for item in data.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Produk dengan ID {item.product_id} tidak ditemukan")
        if product.stock < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Stok '{product.name}' tidak cukup. Tersedia: {product.stock}, Diminta: {item.quantity}"
            )
        
        item_subtotal = product.price * item.quantity
        subtotal += item_subtotal
        items_data.append({
            "product": product,
            "quantity": item.quantity,
            "price_each": product.price,
            "subtotal": item_subtotal
        })
    
    # Calculate tax and total
    tax = subtotal * data.tax_rate
    total = subtotal + tax
    
    # Validate payment
    if data.payment < total:
        raise HTTPException(
            status_code=400,
            detail=f"Pembayaran kurang. Total: Rp {total:,.0f}, Dibayar: Rp {data.payment:,.0f}"
        )
    
    change_amount = data.payment - total
    
    # Create transaction
    transaction = Transaction(
        timestamp=datetime.now(),
        subtotal=subtotal,
        tax=tax,
        total=total,
        payment=data.payment,
        change_amount=change_amount,
        notes=data.notes,
        branch=data.branch or "Pusat"
    )
    db.add(transaction)
    db.flush()  # Get the transaction ID
    
    # Create transaction items and reduce stock
    for item_data in items_data:
        tx_item = TransactionItem(
            transaction_id=transaction.id,
            product_id=item_data["product"].id,
            product_name=item_data["product"].name,
            quantity=item_data["quantity"],
            price_each=item_data["price_each"],
            subtotal=item_data["subtotal"]
        )
        db.add(tx_item)
        
        # Reduce stock
        item_data["product"].stock -= item_data["quantity"]
    
    db.commit()
    db.refresh(transaction)
    
    return transaction.to_dict(include_items=True)


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Delete transaction and restore product stock."""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")

    for item in transaction.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            product.stock += item.quantity

    db.delete(transaction)
    db.commit()
    return {"message": f"Transaksi TRX-{transaction_id:04d} berhasil dihapus"}
