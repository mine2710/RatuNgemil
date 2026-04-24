"""
Product CRUD API routes.
"""

import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models import Product
from auth import require_auth

router = APIRouter(prefix="/api/products", tags=["products"], dependencies=[Depends(require_auth)])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PRODUCT_IMAGE_DIR = os.path.join(BASE_DIR, "frontend", "assets", "products")
os.makedirs(PRODUCT_IMAGE_DIR, exist_ok=True)


# --- Pydantic Schemas ---

class ProductCreate(BaseModel):
    name: str
    category: str = "Umum"
    price: float
    stock: int = 0
    image_url: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    image_url: Optional[str] = None


# --- Routes ---

@router.get("")
def list_products(category: Optional[str] = None, search: Optional[str] = None, db: Session = Depends(get_db)):
    """Get all products, optionally filtered by category or search term."""
    query = db.query(Product)
    if category and category != "Semua":
        query = query.filter(Product.category == category)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    products = query.order_by(Product.name).all()
    return [p.to_dict() for p in products]


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    """Get all unique product categories."""
    categories = db.query(Product.category).distinct().order_by(Product.category).all()
    return ["Semua"] + [c[0] for c in categories]


@router.get("/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    """Get a single product by ID."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    return product.to_dict()


@router.post("/upload-image")
async def upload_product_image(file: UploadFile = File(...)):
    """Upload product image and return static path."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File harus berupa gambar")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(status_code=400, detail="Format gambar harus png, jpg, jpeg, atau webp")

    filename = f"{uuid.uuid4().hex}{ext}"
    destination = os.path.join(PRODUCT_IMAGE_DIR, filename)

    content = await file.read()
    with open(destination, "wb") as f:
        f.write(content)

    return {"image_url": f"/static/assets/products/{filename}"}


@router.post("")
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """Create a new product."""
    db_product = Product(
        name=product.name,
        category=product.category,
        price=product.price,
        stock=product.stock,
        image_url=product.image_url
    )
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product.to_dict()


@router.put("/{product_id}")
def update_product(product_id: int, product: ProductUpdate, db: Session = Depends(get_db)):
    """Update an existing product."""
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    
    update_data = product.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_product, key, value)
    
    db.commit()
    db.refresh(db_product)
    return db_product.to_dict()


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Delete a product."""
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    
    db.delete(db_product)
    db.commit()
    return {"message": f"Produk '{db_product.name}' berhasil dihapus"}
