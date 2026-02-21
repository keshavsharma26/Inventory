from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum as SQLSQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
import enum

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    STAFF = "STAFF"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default=UserRole.STAFF)
    is_active = Column(Integer, default=1) # 1 for True, 0 for False (Oracle compatibility)
    created_at = Column(DateTime, default=datetime.utcnow)

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String(100), nullable=False)
    sku_code = Column(String(50), unique=True, index=True, nullable=False)
    category = Column(String(50))
    purchase_price = Column(Float, default=0.0)
    selling_price = Column(Float, default=0.0)
    low_stock_limit = Column(Integer, default=5)
    is_active = Column(Integer, default=1)  # 1 for True, 0 for False (Standardize for Postgres/Oracle)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    transactions = relationship("InventoryTransaction", back_populates="product", cascade="all, delete-orphan")

class TransactionType(str, enum.Enum):
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    CUSTOMER_RETURN = "CUSTOMER_RETURN"
    SUPPLIER_RETURN = "SUPPLIER_RETURN"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"

class ProductStatus(str, enum.Enum):
    INSTALLED = "INSTALLED"
    RETURNED = "RETURNED"
    DAMAGED = "DAMAGED"
    AVAILABLE = "AVAILABLE"

class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"
    transaction_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    transaction_type = Column(String(30), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    
    # New Tracker Fields
    issued_to_company = Column(String(100))
    issued_location = Column(String(100))
    issued_to_person = Column(String(100))
    status = Column(String(20), default=ProductStatus.AVAILABLE)
    
    reference_number = Column(String(50))
    notes = Column(String(255))
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    product = relationship("Product", back_populates="transactions")
