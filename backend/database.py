"""
Database configuration and session management.
Supports PostgreSQL via DATABASE_URL, with SQLite fallback.
"""

import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database file path - stored in data/ directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_SQLITE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'pos.db')}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine_kwargs = {"echo": False}
if IS_SQLITE:
    engine_kwargs["connect_args"] = {"check_same_thread": False}  # Required for SQLite

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables in the database."""
    from models import Product, Transaction, TransactionItem  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _apply_safe_migrations()


def _apply_safe_migrations():
    """Apply lightweight ALTER TABLE migrations for existing SQLite databases."""
    if not IS_SQLITE:
        return

    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    if "transactions" in table_names:
        tx_columns = {col["name"] for col in inspector.get_columns("transactions")}
        if "branch" not in tx_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN branch VARCHAR(100) NOT NULL DEFAULT 'Pusat'"))
