from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum as SQLSQLEnum, Text, JSON, Boolean, Date, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
import pytz
from app.db.session import Base
import enum

IST = pytz.timezone('Asia/Kolkata')

def now_ist():
    return datetime.now(IST).replace(tzinfo=None)

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    STAFF = "STAFF"

class Organization(Base):
    """THE ROOT OF MULTI-TENANCY: Every business is an organization."""
    __tablename__ = "organizations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=now_ist)
    
    users = relationship("User", back_populates="organization")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True) # Null for super-admins if any
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default=UserRole.STAFF)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=now_ist)

    organization = relationship("Organization", back_populates="users")

class Client(Base):
    """PHASE A: Client/Company tracking for asset lifecycle"""
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    company_name = Column(String(150), nullable=False, index=True)
    location = Column(String(150), index=True)
    contact_person = Column(String(100))
    email = Column(String(100))
    phone = Column(String(20))
    notes = Column(Text)
    is_active = Column(Integer, default=1, index=True)
    created_at = Column(DateTime, default=now_ist)
    
    __table_args__ = (UniqueConstraint('organization_id', 'company_name', 'location', name='uq_org_client_loc'),)
    
    transactions = relationship("InventoryTransaction", back_populates="client")

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    product_name = Column(String(100), nullable=False)
    sku_code = Column(String(50), index=True, nullable=False)
    category = Column(String(50))
    purchase_price = Column(Float, default=0.0)
    selling_price = Column(Float, default=0.0)
    low_stock_limit = Column(Integer, default=5)
    is_active = Column(Integer, default=1, index=True)

    __table_args__ = (UniqueConstraint('organization_id', 'sku_code', name='uq_org_sku'),)
    
    # NEW: Advanced Tracking Flags
    is_serialized = Column(Boolean, default=False)
    is_batch_tracked = Column(Boolean, default=False)
    
    # PHASE B: Soft delete
    deleted_at = Column(DateTime)
    deletion_reason = Column(String(255))
    
    # PHASE E: Barcode & QR
    barcode = Column(String(100), unique=True, index=True)
    qr_code_path = Column(String(255))
    
    created_at = Column(DateTime, default=now_ist)
    
    transactions = relationship("InventoryTransaction", back_populates="product", cascade="all, delete-orphan")
    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")
    instances = relationship("ProductInstance", back_populates="product", cascade="all, delete-orphan")
    batches = relationship("Batch", back_populates="product", cascade="all, delete-orphan")

class Batch(Base):
    """Batch tracking for manufacturing groups"""
    __tablename__ = "batches"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    batch_number = Column(String(50), nullable=False, index=True)
    mfg_date = Column(Date)
    expiry_date = Column(Date)
    notes = Column(Text)
    created_at = Column(DateTime, default=now_ist)
    
    product = relationship("Product", back_populates="batches")
    transactions = relationship("InventoryTransaction", back_populates="batch")
    
    __table_args__ = (UniqueConstraint('product_id', 'batch_number', name='uq_product_batch'),)

class ProductInstance(Base):
    """Serialized Inventory: Individual units with SN/IMEI"""
    __tablename__ = "product_instances"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    serial_number = Column(String(100), nullable=False, index=True)
    status = Column(String(50), default="AVAILABLE") # AVAILABLE, SOLD, DAMAGED, TRANSFERRED
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)
    last_transaction_id = Column(Integer, ForeignKey("inventory_transactions.transaction_id"), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    
    product = relationship("Product", back_populates="instances")
    
    __table_args__ = (UniqueConstraint('product_id', 'serial_number', name='uq_product_serial'),)

class TransactionType(str, enum.Enum):
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    CUSTOMER_RETURN = "CUSTOMER_RETURN"
    SUPPLIER_RETURN = "SUPPLIER_RETURN"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
    STOCK_TRANSFER = "STOCK_TRANSFER" # NEW

class ProductStatus(str, enum.Enum):
    INSTALLED = "INSTALLED"
    RETURNED = "RETURNED"
    DAMAGED = "DAMAGED"
    AVAILABLE = "AVAILABLE"

class LifecycleStatus(str, enum.Enum):
    """PHASE A: Asset lifecycle states"""
    PURCHASED = "PURCHASED"
    INSTALLED = "INSTALLED"
    RETURNED = "RETURNED"
    DAMAGED = "DAMAGED"

class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"
    transaction_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    transaction_type = Column(String(30), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=True) # Optional price field
    
    issued_to_company = Column(String(100))
    issued_location = Column(String(100))
    issued_to_person = Column(String(100))
    status = Column(String(20), default=ProductStatus.AVAILABLE)
    
    # NEW: Serial & Batch Tracking links
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)
    serial_numbers = Column(JSONB) # To store list of serial numbers involved in this transaction
    
    # PHASE A: Asset lifecycle tracking
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True)
    lifecycle_status = Column(String(50), default=LifecycleStatus.PURCHASED, index=True)
    
    reference_number = Column(String(50))
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=now_ist, index=True)
    
    # NEW: Tracking transfer locations
    source_location = Column(String(100))
    destination_location = Column(String(100))

    # PHASE B: Edit tracking & audit
    edited_at = Column(DateTime)
    edited_by = Column(Integer, ForeignKey("users.id"))
    edit_reason = Column(String(255))

    deleted_at = Column(DateTime, nullable=True, index=True)  # or just DateTime()
    
    product = relationship("Product", back_populates="transactions")
    client = relationship("Client", back_populates="transactions")
    batch = relationship("Batch", back_populates="transactions")

class PurchaseOrderStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    OPEN = "OPEN"
    RECEIVED = "RECEIVED"
    CANCELLED = "CANCELLED"

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    po_number = Column(String(50), index=True, nullable=False)
    supplier_name = Column(String(150), nullable=False)
    
    __table_args__ = (UniqueConstraint('organization_id', 'po_number', name='uq_org_po'),)
    status = Column(String(30), default=PurchaseOrderStatus.DRAFT, index=True)
    total_amount = Column(Float, default=0.0)
    expected_delivery_date = Column(Date)
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=now_ist)
    
    items = relationship("POItem", back_populates="purchase_order", cascade="all, delete-orphan")

class POItem(Base):
    __tablename__ = "purchase_order_items"
    id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    received_quantity = Column(Integer, default=0)
    
    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product")

class AuditLog(Base):
    """PHASE B: Comprehensive audit trail"""
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    action_type = Column(String(50), nullable=False, index=True)  # CREATE, UPDATE, DELETE, EDIT
    entity_type = Column(String(50), nullable=False, index=True)  # PRODUCT, TRANSACTION, CLIENT
    entity_id = Column(Integer, nullable=False, index=True)
    old_data = Column(JSONB)
    new_data = Column(JSONB)
    reason = Column(String(255))
    ip_address = Column(String(45))
    created_at = Column(DateTime, default=now_ist, index=True)

class TransactionSnapshot(Base):
    """PHASE C: Historical snapshots for trending"""
    __tablename__ = "transaction_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    total_units_in = Column(Integer, default=0)
    total_units_out = Column(Integer, default=0)
    net_stock = Column(Integer, default=0)
    inventory_value = Column(Numeric(15, 2), default=0.00)
    created_at = Column(DateTime, default=now_ist)
    
    __table_args__ = (UniqueConstraint('snapshot_date', 'product_id', name='uq_snapshot_date_product'),)

class InventoryValueHistory(Base):
    """PHASE C: Daily inventory value tracking"""
    __tablename__ = "inventory_value_history"
    id = Column(Integer, primary_key=True, index=True)
    history_date = Column(Date, nullable=False, index=True, unique=True)
    total_value = Column(Numeric(15, 2), nullable=False)
    total_units = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=now_ist)

class ProductImage(Base):
    """PHASE E: Product images & media"""
    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    file_path = Column(String(255), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(50))
    is_primary = Column(Integer, default=0, index=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=now_ist)

    # ✅ ADD THIS LINE
    product = relationship("Product", back_populates="images")

    
class BulkImport(Base):
    """PHASE E: Track bulk import operations"""
    __tablename__ = "bulk_imports"
    id = Column(Integer, primary_key=True, index=True)
    import_file_name = Column(String(255), nullable=False)
    total_rows = Column(Integer)
    successful_rows = Column(Integer)
    failed_rows = Column(Integer)
    status = Column(String(50))  # PENDING, SUCCESS, PARTIAL, FAILED
    error_details = Column(JSONB)
    imported_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=now_ist, index=True)

class Notification(Base):
    """PHASE F: User notifications"""
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text)
    notification_type = Column(String(50))  # LOW_STOCK, ASSET_MOVED, SYSTEM_ALERT
    related_entity_type = Column(String(50))
    related_entity_id = Column(Integer)
    is_read = Column(Integer, default=0, index=True)
    action_url = Column(String(255))
    created_at = Column(DateTime, default=now_ist, index=True)
    read_at = Column(DateTime)

class StockForecast(Base):
    """PHASE G: AI-powered stock prediction"""
    __tablename__ = "stock_forecasts"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    forecast_date = Column(Date, nullable=False)
    predicted_stock = Column(Integer)
    confidence_score = Column(Numeric(5, 2))
    forecast_method = Column(String(50))  # SIMPLE_AVERAGE, LINEAR_REGRESSION
    created_at = Column(DateTime, default=now_ist)
    
    __table_args__ = (UniqueConstraint('product_id', 'forecast_date', name='uq_forecast_product_date'),)

class PWASetting(Base):
    """PHASE G: PWA configuration"""
    __tablename__ = "pwa_settings"
    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String(100), unique=True, nullable=False)
    setting_value = Column(Text)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)