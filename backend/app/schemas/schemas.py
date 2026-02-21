from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from app.models.base import UserRole, TransactionType, ProductStatus

# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole = UserRole.STAFF

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    password: Optional[str] = None

class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[int] = None

# Product Schemas
class ProductBase(BaseModel):
    product_name: str
    sku_code: str
    category: Optional[str] = None
    purchase_price: float = 0.0
    selling_price: float = 0.0
    low_stock_limit: int = 5

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    sku_code: Optional[str] = None
    category: Optional[str] = None
    purchase_price: Optional[float] = None
    selling_price: Optional[float] = None
    low_stock_limit: Optional[int] = None
    is_active: Optional[int] = None

class ProductOut(ProductBase):
    id: int
    current_stock: int = 0
    is_active: int = 1
    created_at: datetime

    class Config:
        from_attributes = True

# Transaction Schemas
class TransactionBase(BaseModel):
    product_id: int
    transaction_type: TransactionType
    quantity: int
    issued_to_company: Optional[str] = None
    issued_location: Optional[str] = None
    issued_to_person: Optional[str] = None
    status: Optional[ProductStatus] = ProductStatus.AVAILABLE
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class TransactionCreate(TransactionBase):
    pass

class TransactionOut(TransactionBase):
    transaction_id: int
    created_by: int
    created_at: datetime
    product_name: Optional[str] = None

    class Config:
        from_attributes = True

# Dashboard Stats
class DashboardStats(BaseModel):
    total_products: int
    total_inventory: int
    low_stock_count: int
    inventory_value: float
    installed_count: int = 0
    returned_count: int = 0
    damaged_count: int = 0
    recent_transactions: List[TransactionOut]
