from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import and_
from sqlalchemy.orm import Session
from app.api import deps
from app.db.session import get_db
from app.models.base import User, Product, InventoryTransaction
from app.schemas.schemas import (
    ProductOut, ProductCreate, ProductUpdate, TransactionOut, TransactionCreate,
    DashboardStats, ClientCreate, ClientUpdate, ClientOut, AssetLocationOut,
    AssetTimelineOut, TransactionEdit, ReportFilter, DashboardAnalyticsOut,
    InventoryValuePoint, StockMovementPoint, LifecycleStatusCount, 
    ActivityFeedOut, ActivityFeedItem, NotificationOut,
    BatchCreate, BatchOut, PurchaseOrderCreate, PurchaseOrderOut, ProductInstanceOut
)
from app.crud import crud_inventory
from app.core.config import settings
from datetime import datetime, timedelta
import os

router = APIRouter()

# ============================================================
# CORE ENDPOINTS
# ============================================================

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)) -> Any:
    return crud_inventory.get_dashboard_stats(db)

@router.get("/dashboard/analytics", response_model=DashboardAnalyticsOut)
def get_dashboard_analytics(days: int = Query(30), db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)) -> Any:
    return crud_inventory.get_dashboard_analytics(db, days=days)

@router.get("/products", response_model=List[ProductOut])
def list_products(db: Session = Depends(get_db), skip: int = Query(0), limit: int = Query(100), current_user: User = Depends(deps.get_current_active_user)) -> Any:
    products = crud_inventory.get_products(db, skip=skip, limit=limit)
    p_ids = [p.id for p in products]
    stock_map = {}
    if p_ids:
        from sqlalchemy import func, case
        stock_map_raw = db.query(InventoryTransaction.product_id, func.coalesce(func.sum(case((InventoryTransaction.transaction_type.in_(["PURCHASE", "CUSTOMER_RETURN"]), InventoryTransaction.quantity), (InventoryTransaction.transaction_type.in_(["SALE", "SUPPLIER_RETURN"]), -InventoryTransaction.quantity), (InventoryTransaction.transaction_type == "MANUAL_ADJUSTMENT", InventoryTransaction.quantity), else_=0)), 0)).filter(InventoryTransaction.product_id.in_(p_ids), InventoryTransaction.deleted_at.is_(None)).group_by(InventoryTransaction.product_id).all()
        stock_map = {row[0]: int(row[1] or 0) for row in stock_map_raw}
    results = []
    from sqlalchemy import exists
    for p in products:
        p_out = ProductOut.model_validate(p)
        p_out.current_stock = stock_map.get(p.id, 0)
        p_out.has_transactions = db.query(exists().where(and_(InventoryTransaction.product_id == p.id, InventoryTransaction.deleted_at.is_(None)))).scalar()
        results.append(p_out)
    return results

@router.post("/products", response_model=ProductOut)
def add_product(*, db: Session = Depends(get_db), product_in: ProductCreate, current_user: User = Depends(deps.get_current_active_user)) -> Any:
    if crud_inventory.get_product_by_sku(db, product_in.sku_code): raise HTTPException(status_code=400, detail="SKU already exists")
    return crud_inventory.create_product(db, product_in)

@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(*, db: Session = Depends(get_db), product_id: int, product_in: ProductUpdate, current_user: User = Depends(deps.get_current_active_user)) -> Any:
    product = crud_inventory.update_product(db, product_id, product_in)
    if not product: raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.post("/transactions", response_model=TransactionOut)
def add_transaction(*, db: Session = Depends(get_db), transaction_in: TransactionCreate, current_user: User = Depends(deps.get_current_active_user)) -> Any:
    try: return crud_inventory.create_transaction(db, transaction_in, current_user.id)
    except ValueError as e: raise HTTPException(status_code=400, detail=str(e))

@router.get("/transactions", response_model=List[TransactionOut])
def list_transactions(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user), status: Optional[str] = Query(None), transaction_type: Optional[str] = Query(None), skip: int = Query(0), limit: int = Query(200), include_deleted: bool = Query(False)) -> Any:
    from sqlalchemy import desc
    query = db.query(InventoryTransaction, Product.product_name, Product.sku_code).join(Product)
    if not include_deleted: query = query.filter(InventoryTransaction.deleted_at.is_(None))
    if status: query = query.filter(InventoryTransaction.status == status)
    if transaction_type: query = query.filter(InventoryTransaction.transaction_type == transaction_type)
    rows = query.order_by(desc(InventoryTransaction.created_at)).offset(skip).limit(limit).all()
    return [TransactionOut(transaction_id=t.transaction_id, product_id=t.product_id, product_name=p_name, transaction_type=t.transaction_type, quantity=t.quantity, status=t.status, issued_to_company=t.issued_to_company, issued_location=t.issued_location, issued_to_person=t.issued_to_person, reference_number=t.reference_number, notes=t.notes, lifecycle_status=t.lifecycle_status, created_by=t.created_by, created_at=t.created_at, sku_code=sku) for t, p_name, sku in rows]

# ============================================================
# CLIENTS & ASSETS
# ============================================================

@router.post("/clients", response_model=ClientOut)
def create_client(*, db: Session = Depends(get_db), client_in: ClientCreate, current_user: User = Depends(deps.get_current_active_user)):
    return crud_inventory.create_client(db, client_in)

@router.get("/clients", response_model=List[ClientOut])
def list_clients(db: Session = Depends(get_db), skip: int = Query(0), limit: int = Query(100), current_user: User = Depends(deps.get_current_active_user)):
    return crud_inventory.get_clients(db, skip=skip, limit=limit)

@router.get("/assets/{sku}/location", response_model=AssetLocationOut)
def get_asset_location(sku: str, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    loc = crud_inventory.get_asset_location(db, sku)
    if not loc: raise HTTPException(status_code=404, detail="Asset not found")
    return loc

# ============================================================
# AUDIT & EDIT
# ============================================================

@router.put("/transactions/{transaction_id}", response_model=TransactionOut)
def edit_transaction(transaction_id: int, edit_in: TransactionEdit, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    try:
        edit_data = edit_in.model_dump(exclude={'edit_reason'}, exclude_none=True)
        return crud_inventory.edit_transaction(db, transaction_id, edit_data, current_user.id, edit_in.edit_reason)
    except ValueError as e: raise HTTPException(status_code=400, detail=str(e))

@router.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, reason: str = Query(...), db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    return crud_inventory.soft_delete_transaction(db, transaction_id, reason, current_user.id)

@router.get("/activity-feed", response_model=ActivityFeedOut)
def get_activity_feed(db: Session = Depends(get_db), skip: int = Query(0), limit: int = Query(20), current_user: User = Depends(deps.get_current_active_user)):
    items, total = crud_inventory.get_activity_feed(db, skip=skip, limit=limit)
    return ActivityFeedOut(items=items, total_count=total, limit=limit, offset=skip)

# ============================================================
# BATCH & SERIAL
# ============================================================

@router.post("/batches", response_model=BatchOut)
def create_batch(batch_in: BatchCreate, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    return crud_inventory.create_batch(db, batch_in)

@router.get("/batches", response_model=List[BatchOut])
def list_batches(product_id: Optional[int] = Query(None), db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    return crud_inventory.get_batches(db, product_id=product_id)

@router.get("/products/{product_id}/instances", response_model=List[ProductInstanceOut])
def list_instances(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    return crud_inventory.get_product_instances(db, product_id)

# ============================================================
# PURCHASE ORDERS
# ============================================================

@router.post("/purchase-orders", response_model=PurchaseOrderOut)
def create_po(po_in: PurchaseOrderCreate, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    return crud_inventory.create_purchase_order(db, po_in, current_user.id)

@router.get("/purchase-orders", response_model=List[PurchaseOrderOut])
def list_pos(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    return crud_inventory.list_purchase_orders(db)

@router.post("/purchase-orders/{po_id}/receive", response_model=PurchaseOrderOut)
def receive_po(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    try: return crud_inventory.receive_purchase_order(db, po_id, current_user.id)
    except ValueError as e: raise HTTPException(status_code=400, detail=str(e))

# ============================================================
# NOTIFICATIONS & OTHERS
# ============================================================

@router.get("/notifications", response_model=List[NotificationOut])
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    notifs, _ = crud_inventory.get_user_notifications(db, current_user.id)
    return notifs

@router.put("/notifications/read")
def read_notifications(notification_ids: List[int], db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    crud_inventory.mark_notifications_read(db, notification_ids, current_user.id)
    return {"status": "ok"}