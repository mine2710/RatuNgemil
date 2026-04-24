"""
SQLAlchemy models for the POS system.
Defines Product, Transaction, and TransactionItem tables.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.database import Base


class Product(Base):
    """Product model - items available for sale."""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False, default="Umum")
    price = Column(Float, nullable=False)
    stock = Column(Integer, nullable=False, default=0)
    image_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    transaction_items = relationship("TransactionItem", back_populates="product")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "price": self.price,
            "stock": self.stock,
            "image_url": self.image_url,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Transaction(Base):
    """Transaction model - records of completed sales."""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    subtotal = Column(Float, nullable=False)
    tax = Column(Float, nullable=False, default=0)
    total = Column(Float, nullable=False)
    payment = Column(Float, nullable=False)
    change_amount = Column(Float, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    branch = Column(String(100), nullable=False, default="Pusat")

    # Relationship
    items = relationship("TransactionItem", back_populates="transaction", cascade="all, delete-orphan")

    def to_dict(self, include_items=False):
        data = {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "subtotal": self.subtotal,
            "tax": self.tax,
            "total": self.total,
            "payment": self.payment,
            "change_amount": self.change_amount,
            "notes": self.notes,
            "branch": self.branch,
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class TransactionItem(Base):
    """TransactionItem model - individual items within a transaction."""
    __tablename__ = "transaction_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name = Column(String(100), nullable=False)  # Snapshot of product name at time of sale
    quantity = Column(Integer, nullable=False)
    price_each = Column(Float, nullable=False)
    subtotal = Column(Float, nullable=False)

    # Relationships
    transaction = relationship("Transaction", back_populates="items")
    product = relationship("Product", back_populates="transaction_items")

    def to_dict(self):
        return {
            "id": self.id,
            "transaction_id": self.transaction_id,
            "product_id": self.product_id,
            "product_name": self.product_name,
            "quantity": self.quantity,
            "price_each": self.price_each,
            "subtotal": self.subtotal
        }
