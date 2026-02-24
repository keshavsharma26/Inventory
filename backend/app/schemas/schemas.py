from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal

# ============================================================
# EXISTING SCHEMAS (Keep unchanged for backward compatibility)
# ============================================================

class ProductCreate(BaseModel):
    product_name: str
    sku_code: str
    category: Optional[str] = None
    purchase_price: float
    selling_price: float
    low_stock_limit: int = 5
    is_serialized: bool = False
    is_batch_tracked: bool = False

class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    category: Optional[str] = None
    purchase_price: Optional[float] = None
    selling_price: Optional[float] = None
    low_stock_limit: Optional[int] = None
    is_active: Optional[int] = None
    is_serialized: Optional[bool] = None
    is_batch_tracked: Optional[bool] = None

class ProductOut(BaseModel):
    id: int
    product_name: str
    sku_code: str
    category: Optional[str] = None
    purchase_price: float
    selling_price: float
    low_stock_limit: int
    is_active: int
    is_serialized: bool = False
    is_batch_tracked: bool = False
    current_stock: int = 0
    has_transactions: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

class TransactionCreate(BaseModel):
    product_id: int
    transaction_type: str
    quantity: int
    status: Optional[str] = "AVAILABLE"
    issued_to_company: Optional[str] = None
    issued_location: Optional[str] = None
    issued_to_person: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    batch_id: Optional[int] = None
    unit_price: Optional[float] = None # NEW: Optional price tracking
    serial_numbers: Optional[List[str]] = None
    source_location: Optional[str] = None
    destination_location: Optional[str] = None

class TransactionOut(BaseModel):
    transaction_id: int
    product_id: int
    product_name: Optional[str] = None
    transaction_type: str
    quantity: int
    status: Optional[str] = None
    issued_to_company: Optional[str] = None
    issued_location: Optional[str] = None
    issued_to_person: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    lifecycle_status: Optional[str] = None
    is_locked: bool = False
    batch_id: Optional[int] = None
    serial_numbers: Optional[List[str]] = None
    source_location: Optional[str] = None
    destination_location: Optional[str] = None
    created_by: Optional[int] = None
    unit_price: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================================
# ENTERPRISE FEATURES (V2)
# ============================================================

class BatchCreate(BaseModel):
    product_id: int
    batch_number: str
    mfg_date: Optional[date] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None

class BatchOut(BaseModel):
    id: int
    product_id: int
    batch_number: str
    mfg_date: Optional[date] = None
    expiry_date: Optional[date] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ProductInstanceOut(BaseModel):
    id: int
    product_id: int
    serial_number: str
    status: str
    batch_id: Optional[int] = None
    last_transaction_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

class POItemCreate(BaseModel):
    product_id: int
    quantity: int
    unit_price: float

class POItemOut(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: int
    unit_price: float
    received_quantity: int

    class Config:
        from_attributes = True

class PurchaseOrderCreate(BaseModel):
    po_number: str
    supplier_name: str
    expected_delivery_date: Optional[date] = None
    notes: Optional[str] = None
    items: List[POItemCreate]

class PurchaseOrderOut(BaseModel):
    id: int
    po_number: str
    supplier_name: str
    status: str
    total_amount: float
    expected_delivery_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    items: List[POItemOut] = []

    class Config:
        from_attributes = True

class ProfitLossReportItem(BaseModel):
    product_sku: str
    product_name: str
    units_sold: int
    total_revenue: float
    total_cost: float
    margin: float
    margin_percentage: float

class ProfitLossReportOut(BaseModel):
    report_date: date
    total_revenue: float
    total_cost: float
    net_profit: float
    items: List[ProfitLossReportItem]

class DashboardStats(BaseModel):
    total_products: int
    total_inventory: int
    low_stock_count: int
    inventory_value: float
    installed_count: int
    returned_count: int
    damaged_count: int
    recent_transactions: List[Dict[str, Any]]

# ============================================================
# PHASE A: ASSET LIFECYCLE SCHEMAS
# ============================================================

class ClientCreate(BaseModel):
    company_name: str
    location: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None

class ClientUpdate(BaseModel):
    company_name: Optional[str] = None
    location: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[int] = None

class ClientOut(BaseModel):
    id: int
    company_name: str
    location: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: int
    created_at: datetime

    class Config:
        from_attributes = True

class AssetLocationOut(BaseModel):
    """Asset location timeline"""
    sku: str
    product_name: str
    current_location: Optional[str] = None
    current_client: Optional[str] = None
    lifecycle_status: str
    last_updated: datetime
    installation_date: Optional[datetime] = None

class AssetTimelineItem(BaseModel):
    """Single item in asset lifecycle timeline"""
    transaction_id: int
    transaction_type: str
    lifecycle_status: str
    client_name: Optional[str] = None
    location: Optional[str] = None
    quantity: int
    timestamp: datetime
    notes: Optional[str] = None

class AssetTimelineOut(BaseModel):
    """Full asset lifecycle timeline"""
    sku: str
    product_name: str
    total_units: int
    timeline: List[AssetTimelineItem]

# ============================================================
# PHASE B: AUDIT & TRANSACTION CONTROL SCHEMAS
# ============================================================

class AuditLogOut(BaseModel):
    id: int
    user_id: int
    action_type: str
    entity_type: str
    entity_id: int
    old_data: Optional[Dict[str, Any]] = None
    new_data: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ActivityFeedItem(BaseModel):
    """Activity feed combining audit logs with user info"""
    id: int
    user_name: str
    action_type: str
    entity_type: str
    entity_id: int
    description: str  # Human-readable summary
    old_data: Optional[Dict[str, Any]] = None
    new_data: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
    timestamp: datetime

class TransactionEdit(BaseModel):
    """Edit an existing transaction"""
    quantity: Optional[int] = None
    status: Optional[str] = None
    issued_to_company: Optional[str] = None
    issued_location: Optional[str] = None
    issued_to_person: Optional[str] = None
    notes: Optional[str] = None
    edit_reason: str  # Required reason for audit

class TransactionSoftDelete(BaseModel):
    """Soft delete a transaction with reason"""
    reason: str

# ============================================================
# PHASE C: ADVANCED REPORTING SCHEMAS
# ============================================================

class InstallationReportItem(BaseModel):
    client_name: str
    location: str
    product_sku: str
    product_name: str
    quantity: int
    installation_date: datetime
    status: str

class InstallationReportOut(BaseModel):
    report_date: date
    total_installations: int
    by_client: Dict[str, List[InstallationReportItem]]

class DamageReportItem(BaseModel):
    product_sku: str
    product_name: str
    quantity_damaged: int
    client_name: Optional[str] = None
    location: Optional[str] = None
    first_damaged_date: datetime
    lifecycle_history: List[str]

class DamageReportOut(BaseModel):
    report_date: date
    total_damaged_units: int
    items: List[DamageReportItem]

class ProductLedgerEntry(BaseModel):
    transaction_id: int
    transaction_type: str
    quantity: int
    client_name: Optional[str] = None
    status: str
    timestamp: datetime
    notes: Optional[str] = None

class ProductLedgerReportOut(BaseModel):
    product_sku: str
    product_name: str
    report_date: date
    entries: List[ProductLedgerEntry]
    opening_stock: int
    closing_stock: int

class ReportFilter(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    client_id: Optional[int] = None
    product_id: Optional[int] = None
    status: Optional[str] = None

# ============================================================
# PHASE D: DASHBOARD ANALYTICS SCHEMAS
# ============================================================

class InventoryValuePoint(BaseModel):
    date: date
    total_value: float
    total_units: int

class StockMovementPoint(BaseModel):
    date: date
    units_in: int
    units_out: int
    net_change: int

class LifecycleStatusCount(BaseModel):
    status: str
    count: int
    percentage: float

class DashboardAnalyticsOut(BaseModel):
    """Enhanced dashboard with time-series data"""
    # Existing stats
    total_products: int
    total_inventory: int
    low_stock_count: int
    inventory_value: float
    installed_count: int
    returned_count: int
    damaged_count: int
    
    # New analytics
    inventory_value_trend: List[InventoryValuePoint]
    stock_movement_trend: List[StockMovementPoint]
    lifecycle_status_breakdown: List[LifecycleStatusCount]
    recent_transactions: List[Dict[str, Any]]

# ============================================================
# PHASE E: OPERATIONAL FEATURES SCHEMAS
# ============================================================

class ProductImageUpload(BaseModel):
    """Image upload metadata"""
    is_primary: bool = False

class ProductImageOut(BaseModel):
    id: int
    product_id: int
    file_path: str
    file_size: int
    mime_type: str
    is_primary: int
    uploaded_by: int
    created_at: datetime

    class Config:
        from_attributes = True

class QRCodeGenerateRequest(BaseModel):
    product_id: int
    size: int = 200  # pixel size

class QRCodeOut(BaseModel):
    product_id: int
    sku: str
    qr_code_path: str
    qr_code_url: str

class BulkImportResult(BaseModel):
    import_id: int
    file_name: str
    total_rows: int
    successful_rows: int
    failed_rows: int
    status: str
    errors: List[str] = []

class ScanProductOut(BaseModel):
    """Response from scanning QR/barcode"""
    id: int
    product_name: str
    sku_code: str
    category: str
    current_stock: int
    purchase_price: float
    selling_price: float
    barcode: Optional[str] = None
    created_at: datetime

# ============================================================
# PHASE F: NOTIFICATIONS & UX SCHEMAS
# ============================================================

class NotificationCreate(BaseModel):
    user_id: int
    title: str
    message: Optional[str] = None
    notification_type: Optional[str] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    action_url: Optional[str] = None

class NotificationOut(BaseModel):
    id: int
    user_id: int
    title: str
    message: Optional[str] = None
    notification_type: Optional[str] = None
    is_read: int
    action_url: Optional[str] = None
    created_at: datetime
    read_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ============================================================
# AUTH & USER SCHEMAS
# ============================================================

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: Optional[int] = None
    exp: Optional[int] = None


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: Optional[str] = "ADMIN"
    full_name: Optional[str] = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    is_active: int
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationMarkRead(BaseModel):
    notification_ids: List[int]

class ActivityFeedOut(BaseModel):
    """Activity feed with pagination"""
    items: List[ActivityFeedItem]
    total_count: int
    limit: int
    offset: int

# ============================================================
# PHASE G: INTELLIGENCE & PWA SCHEMAS
# ============================================================

class StockForecastOut(BaseModel):
    product_id: int
    product_name: str
    forecast_date: date
    predicted_stock: int
    confidence_score: float
    forecast_method: str

class StockForecastBatch(BaseModel):
    """Batch forecast for multiple products"""
    forecasts: List[StockForecastOut]
    generated_at: datetime

class PWAManifest(BaseModel):
    """PWA manifest data"""
    name: str
    short_name: str
    description: str
    start_url: str
    display: str
    theme_color: str
    background_color: str

class PWAServiceWorker(BaseModel):
    """Service worker configuration"""
    version: str
    cache_version: str
    offline_enabled: bool

# ============================================================
# PAGINATION SCHEMA
# ============================================================

class PaginationParams(BaseModel):
    limit: int = Field(10, ge=1, le=100)
    offset: int = Field(0, ge=0)

class PaginatedResponse(BaseModel):
    """Generic paginated response wrapper"""
    data: List[Dict[str, Any]]
    total_count: int
    limit: int
    offset: int
    has_more: bool