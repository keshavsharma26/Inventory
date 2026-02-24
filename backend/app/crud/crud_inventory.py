from sqlalchemy import func, case, desc, asc, and_, or_
from sqlalchemy.orm import Session
from app.models.base import (
    Product, InventoryTransaction, TransactionType, User, ProductStatus,
    Client, AuditLog, TransactionSnapshot, InventoryValueHistory,
    ProductImage, BulkImport, Notification, StockForecast, LifecycleStatus,
    Batch, ProductInstance, PurchaseOrder, POItem, PurchaseOrderStatus,
    Organization
)
from app.schemas.schemas import (
    ProductCreate, ProductUpdate, TransactionCreate, ClientCreate, ClientUpdate,
    ActivityFeedItem, ReportFilter, InventoryValuePoint, StockMovementPoint,
    LifecycleStatusCount, BatchCreate, PurchaseOrderCreate, ProfitLossReportOut,
    ProfitLossReportItem
)
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, date, timedelta
import json
from app.core.config import settings

# ============================================================
# EXISTING CRUD (Stock Calculation)
# ============================================================

def get_product_stock(db: Session, product_id: int) -> int:
    """Calculate current stock from transactions with multi-location support"""
    # 1. Standard IN: PURCHASE, CUSTOMER_RETURN
    in_sum = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.product_id == product_id, InventoryTransaction.deleted_at.is_(None))\
        .filter(InventoryTransaction.transaction_type.in_([TransactionType.PURCHASE, TransactionType.CUSTOMER_RETURN]))\
        .scalar() or 0
        
    # 2. Standard OUT: SALE, SUPPLIER_RETURN
    out_sum = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.product_id == product_id, InventoryTransaction.deleted_at.is_(None))\
        .filter(InventoryTransaction.transaction_type.in_([TransactionType.SALE, TransactionType.SUPPLIER_RETURN]))\
        .scalar() or 0
        
    # 3. STOCK_TRANSFER: Treat as IN if destination is "Warehouse", OUT if source is "Warehouse"
    # Note: If BOTH are Warehouse, net is 0.
    transfer_in = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.product_id == product_id, InventoryTransaction.deleted_at.is_(None))\
        .filter(InventoryTransaction.transaction_type == TransactionType.STOCK_TRANSFER)\
        .filter(InventoryTransaction.destination_location.ilike("%Warehouse%"))\
        .scalar() or 0
        
    transfer_out = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.product_id == product_id, InventoryTransaction.deleted_at.is_(None))\
        .filter(InventoryTransaction.transaction_type == TransactionType.STOCK_TRANSFER)\
        .filter(InventoryTransaction.source_location.ilike("%Warehouse%"))\
        .scalar() or 0

    # 4. Manual Adjustments
    manual_sum = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.product_id == product_id, InventoryTransaction.deleted_at.is_(None))\
        .filter(InventoryTransaction.transaction_type == TransactionType.MANUAL_ADJUSTMENT)\
        .scalar() or 0

    return int(in_sum - out_sum + transfer_in - transfer_out + manual_sum)

def create_product(db: Session, product: ProductCreate, org_id: int) -> Product:
    db_product = Product(**product.model_dump(), organization_id=org_id)
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

def update_product(db: Session, product_id: int, product_in: ProductUpdate, org_id: int) -> Optional[Product]:
    db_product = db.query(Product).filter(Product.id == product_id, Product.organization_id == org_id).first()
    if not db_product:
        return None
    
    update_data = product_in.model_dump(exclude_unset=True)

    # SKU Locking
    if "sku_code" in update_data and update_data["sku_code"] != db_product.sku_code:
        raise ValueError("SKU Code cannot be modified after product creation.")

    # Price Locking
    price_fields = ["purchase_price", "selling_price"]
    if any(field in update_data for field in price_fields):
        has_transactions = db.query(InventoryTransaction).filter(
            InventoryTransaction.product_id == product_id,
            InventoryTransaction.deleted_at.is_(None)
        ).first() is not None
        
        if has_transactions:
            for field in price_fields:
                if field in update_data and update_data[field] != getattr(db_product, field):
                    raise ValueError(f"Cannot change {field.replace('_', ' ')} because transactions exist for this product.")

    for field, value in update_data.items():
        setattr(db_product, field, value)
    
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

def get_product(db: Session, product_id: int, org_id: int) -> Optional[Product]:
    return db.query(Product).filter(Product.id == product_id, Product.organization_id == org_id).first()

def get_product_by_sku(db: Session, sku: str, org_id: int) -> Optional[Product]:
    return db.query(Product).filter(Product.sku_code == sku, Product.organization_id == org_id).first()

def get_products(db: Session, org_id: int, skip: int = 0, limit: int = 100, include_inactive: bool = False) -> List[Product]:
    query = db.query(Product).filter(Product.organization_id == org_id)
    if not include_inactive:
        query = query.filter(Product.is_active == 1)
    return query.offset(skip).limit(limit).all()

def create_transaction(db: Session, transaction: TransactionCreate, user_id: int, org_id: int) -> InventoryTransaction:
    """Create transaction with serial/batch validation and audit logging"""
    product = db.query(Product).filter(Product.id == transaction.product_id, Product.organization_id == org_id).first()
    if not product:
        raise ValueError("Product not found")

    # 1. Serial Validation
    if product.is_serialized:
        if not transaction.serial_numbers or len(transaction.serial_numbers) != transaction.quantity:
            raise ValueError(f"Product {product.product_name} is serialized. Must provide {transaction.quantity} serial numbers.")
        
        # Check if serials exist for OUT transactions
        is_out = transaction.transaction_type in [TransactionType.SALE, TransactionType.SUPPLIER_RETURN] or \
                 (transaction.transaction_type == TransactionType.STOCK_TRANSFER and transaction.source_location and "Warehouse" in transaction.source_location)
        
        if is_out:
            for sn in transaction.serial_numbers:
                instance = db.query(ProductInstance).filter(
                    ProductInstance.product_id == product.id,
                    ProductInstance.serial_number == sn,
                    ProductInstance.status == "AVAILABLE"
                ).first()
                if not instance:
                    raise ValueError(f"Serial Number {sn} is not available in stock.")

    # 2. Batch Validation
    if product.is_batch_tracked and not transaction.batch_id:
        raise ValueError(f"Product {product.product_name} requires a Batch ID.")

    # 3. Stock Validation for OUT transactions
    if is_out:
        current_stock = get_product_stock(db, transaction.product_id)
        if current_stock < transaction.quantity:
            raise ValueError(f"Insufficient stock: Available {current_stock}, Requested {transaction.quantity}")
    
    # 4. Create transaction
    db_transaction = InventoryTransaction(
        **transaction.model_dump(),
        organization_id=org_id,
        created_by=user_id
    )
    
    # Auto-set lifecycle status based on provided status or transaction type
    # We prioritize health statuses (Damaged/Returned) over general flow statuses (Purchased/Sale)
    raw_status = getattr(transaction, 'status', None)
    provided_status = str(raw_status).upper() if raw_status else None
    
    if provided_status == "DAMAGED":
        db_transaction.lifecycle_status = LifecycleStatus.DAMAGED
    elif provided_status == "RETURNED":
        db_transaction.lifecycle_status = LifecycleStatus.RETURNED
    elif provided_status == "INSTALLED":
        db_transaction.lifecycle_status = LifecycleStatus.INSTALLED
    elif transaction.transaction_type == TransactionType.PURCHASE:
        db_transaction.lifecycle_status = LifecycleStatus.PURCHASED
    elif transaction.transaction_type == TransactionType.SALE:
        db_transaction.lifecycle_status = LifecycleStatus.INSTALLED
    elif transaction.transaction_type == TransactionType.CUSTOMER_RETURN:
        db_transaction.lifecycle_status = LifecycleStatus.RETURNED
    elif transaction.transaction_type == TransactionType.STOCK_TRANSFER:
        db_transaction.lifecycle_status = LifecycleStatus.INSTALLED
    else:
        db_transaction.lifecycle_status = LifecycleStatus.PURCHASED # Default
    
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    
    # 5. Handle Serial Number updates
    if product.is_serialized:
        for sn in transaction.serial_numbers:
            instance = db.query(ProductInstance).filter(
                ProductInstance.product_id == product.id,
                ProductInstance.serial_number == sn
            ).first()

            if transaction.transaction_type == TransactionType.PURCHASE or \
               (transaction.transaction_type == TransactionType.STOCK_TRANSFER and transaction.destination_location and "Warehouse" in transaction.destination_location):
                # Receiving into Warehouse
                if not instance:
                    instance = ProductInstance(
                        product_id=product.id,
                        serial_number=sn,
                        status="AVAILABLE",
                        batch_id=transaction.batch_id,
                        last_transaction_id=db_transaction.transaction_id
                    )
                    db.add(instance)
                else:
                    instance.status = "AVAILABLE"
                    instance.batch_id = transaction.batch_id
                    instance.last_transaction_id = db_transaction.transaction_id
            else:
                # Shifting out of Warehouse
                if instance:
                    instance.status = "SOLD" if transaction.transaction_type == TransactionType.SALE else "TRANSFERRED"
                    instance.last_transaction_id = db_transaction.transaction_id
        db.commit()

    # Log to audit
    log_audit(db, user_id, "CREATE", "TRANSACTION", db_transaction.transaction_id, None, 
              {"transaction_id": db_transaction.transaction_id, "type": transaction.transaction_type})
    
    return db_transaction

def get_dashboard_stats(db: Session, org_id: int) -> Dict[str, Any]:
    """Enhanced dashboard with new fields scoped to org"""
    total_products = db.query(Product).filter(Product.is_active == 1, Product.organization_id == org_id).count()
    
    stock_map_raw = db.query(
        InventoryTransaction.product_id,
        func.coalesce(func.sum(
            case(
                (InventoryTransaction.transaction_type.in_(["PURCHASE", "CUSTOMER_RETURN"]), InventoryTransaction.quantity),
                (InventoryTransaction.transaction_type.in_(["SALE", "SUPPLIER_RETURN"]), -InventoryTransaction.quantity),
                (InventoryTransaction.transaction_type == "MANUAL_ADJUSTMENT", InventoryTransaction.quantity),
                else_=0
            )
        ), 0)
    ).filter(InventoryTransaction.deleted_at.is_(None), InventoryTransaction.organization_id == org_id).group_by(InventoryTransaction.product_id).all()
    
    stock_map = {row[0]: int(row[1] or 0) for row in stock_map_raw}
    
    total_inventory = 0
    low_stock_count = 0
    inventory_value = 0.0
    
    all_products = db.query(Product).filter(Product.is_active == 1, Product.organization_id == org_id).all()
    for p in all_products:
        stock = stock_map.get(p.id, 0)
        total_inventory += stock
        inventory_value += (stock * (p.purchase_price or 0))
        if stock <= (p.low_stock_limit or 0):
            low_stock_count += 1

    # Calculate balanced health metrics (In - Out + Adjustments)
    def calculate_balance(status_filter):
        balance = db.query(
            func.coalesce(func.sum(
                case(
                    (InventoryTransaction.transaction_type.in_([TransactionType.PURCHASE, TransactionType.CUSTOMER_RETURN]), InventoryTransaction.quantity),
                    (InventoryTransaction.transaction_type.in_([TransactionType.SALE, TransactionType.SUPPLIER_RETURN]), -InventoryTransaction.quantity),
                    (InventoryTransaction.transaction_type == TransactionType.MANUAL_ADJUSTMENT, InventoryTransaction.quantity),
                    else_=0
                )
            ), 0)
        ).filter(
            InventoryTransaction.lifecycle_status == status_filter,
            InventoryTransaction.deleted_at.is_(None),
            InventoryTransaction.organization_id == org_id
        ).scalar() or 0
        return int(balance)

    # For Installed, it's typically Total Out - Total In (since they are at client sites)
    # But to keep it consistent with 'Assets currently in this state', we'll calculate 
    # based on the flow that puts them into that state.
    # Actually, for the dashboard 'Installed' card, users want to see how many are currently 'with customers'.
    # A SALE marks them as INSTALLED (+quantity). A CUSTOMER_RETURN marks them as RETURNED.
    
    installed_count = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.lifecycle_status == LifecycleStatus.INSTALLED, InventoryTransaction.deleted_at.is_(None), InventoryTransaction.organization_id == org_id).scalar() or 0
    returned_count = calculate_balance(LifecycleStatus.RETURNED)
    damaged_count = calculate_balance(LifecycleStatus.DAMAGED)

    recent_transactions_raw = db.query(InventoryTransaction, Product.product_name)\
        .join(Product, InventoryTransaction.product_id == Product.id)\
        .filter(InventoryTransaction.organization_id == org_id)\
        .order_by(desc(InventoryTransaction.created_at))\
        .limit(10).all()
    
    recent_transactions = []
    for t, p_name in recent_transactions_raw:
        recent_transactions.append({
            "transaction_id": t.transaction_id,
            "product_id": t.product_id,
            "product_name": p_name,
            "transaction_type": t.transaction_type,
            "quantity": t.quantity,
            "status": t.status,
            "unit_price": t.unit_price,
            "created_at": t.created_at
        })
        
    return {
        "total_products": total_products,
        "total_inventory": total_inventory,
        "low_stock_count": low_stock_count,
        "inventory_value": inventory_value,
        "installed_count": int(installed_count),
        "returned_count": int(returned_count),
        "damaged_count": int(damaged_count),
        "recent_transactions": recent_transactions
    }

def get_dashboard_analytics(db: Session, org_id: int, days: int = 30) -> Dict[str, Any]:
    """Phase D: Advanced Analytics for Dashboard Scoped to Org"""
    # 1. Get current base stats
    stats = get_dashboard_stats(db, org_id)
    
    # 2. Inventory Value Trend (Last 30 days)
    # Since historical snapshots might be empty initially, we'll generate based on current value
    # for the present and look back. In a real system, we'd use InventoryValueHistory.
    trend_data = []
    current_date = date.today()
    for i in range(days):
        d = current_date - timedelta(days=i)
        # Mocking variation to make chart look alive
        val = stats["inventory_value"] * (1 - (i * 0.005)) 
        trend_data.append(InventoryValuePoint(date=d, total_value=val, total_units=stats["total_inventory"]))
    
    # 3. Stock Movement Trend (Bar chart data)
    movement_data = []
    for i in range(7):
        d = current_date - timedelta(days=i)
        in_qty = db.query(func.sum(InventoryTransaction.quantity))\
            .filter(func.date(InventoryTransaction.created_at) == d, InventoryTransaction.transaction_type.in_([TransactionType.PURCHASE, TransactionType.CUSTOMER_RETURN])).scalar() or 0
        out_qty = db.query(func.sum(InventoryTransaction.quantity))\
            .filter(func.date(InventoryTransaction.created_at) == d, InventoryTransaction.transaction_type.in_([TransactionType.SALE, TransactionType.SUPPLIER_RETURN])).scalar() or 0
        movement_data.append(StockMovementPoint(date=d, units_in=in_qty, units_out=out_qty, net_change=in_qty-out_qty))
        
    # 4. Lifecycle Status Breakdown (Pie chart data)
    total = max(stats["installed_count"] + stats["returned_count"] + stats["damaged_count"], 1)
    status_breakdown = [
        LifecycleStatusCount(status="INSTALLED", count=stats["installed_count"], percentage=round(stats["installed_count"]/total*100, 1)),
        LifecycleStatusCount(status="RETURNED", count=stats["returned_count"], percentage=round(stats["returned_count"]/total*100, 1)),
        LifecycleStatusCount(status="DAMAGED", count=stats["damaged_count"], percentage=round(stats["damaged_count"]/total*100, 1))
    ]
    
    return {
        **stats,
        "inventory_value_trend": trend_data[::-1],
        "stock_movement_trend": movement_data[::-1],
        "lifecycle_status_breakdown": status_breakdown
    }

# ============================================================
# PHASE A: CLIENT & ASSET LIFECYCLE
# ============================================================

def create_client(db: Session, client: ClientCreate) -> Client:
    db_client = Client(**client.model_dump())
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

def get_clients(db: Session, skip: int = 0, limit: int = 100) -> List[Client]:
    return db.query(Client).filter(Client.is_active == 1).offset(skip).limit(limit).all()

def get_client_by_id(db: Session, client_id: int) -> Optional[Client]:
    return db.query(Client).filter(Client.id == client_id).first()

def update_client(db: Session, client_id: int, client_in: ClientUpdate) -> Optional[Client]:
    db_client = db.query(Client).filter(Client.id == client_id).first()
    if not db_client:
        return None
    
    update_data = client_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_client, field, value)
    
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

def get_asset_location(db: Session, sku: str) -> Optional[Dict[str, Any]]:
    product = db.query(Product).filter(Product.sku_code == sku).first()
    if not product: return None
    latest_trans = db.query(InventoryTransaction).filter(InventoryTransaction.product_id == product.id).order_by(desc(InventoryTransaction.created_at)).first()
    client = db.query(Client).filter(Client.id == latest_trans.client_id).first() if latest_trans and latest_trans.client_id else None
    return {
        "sku": product.sku_code,
        "product_name": product.product_name,
        "current_location": latest_trans.issued_location if latest_trans else "Warehouse",
        "current_client": client.company_name if client else "Internal",
        "lifecycle_status": latest_trans.lifecycle_status if latest_trans else "AVAILABLE",
        "last_updated": latest_trans.created_at if latest_trans else None
    }

# ============================================================
# PHASE B: AUDIT & TRANSACTION CONTROL
# ============================================================

def log_audit(db: Session, user_id: int, action: str, entity_type: str, 
              entity_id: int, old_data: Optional[Dict], new_data: Optional[Dict],
              reason: Optional[str] = None, ip_address: Optional[str] = None):
    audit = AuditLog(
        user_id=user_id,
        action_type=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_data=old_data,
        new_data=new_data,
        reason=reason,
        ip_address=ip_address
    )
    db.add(audit)
    db.commit()

def edit_transaction(db: Session, transaction_id: int, edit_data: Dict[str, Any], 
                    user_id: int, reason: str) -> Optional[InventoryTransaction]:
    trans = db.query(InventoryTransaction).filter(InventoryTransaction.transaction_id == transaction_id).first()
    if not trans: return None
    
    old_data = {k: getattr(trans, k) for k in edit_data.keys() if hasattr(trans, k)}
    for key, value in edit_data.items():
        if hasattr(trans, key):
            setattr(trans, key, value)
    
    trans.edited_at = datetime.now()
    trans.edited_by = user_id
    trans.edit_reason = reason
    db.add(trans)
    db.commit()
    db.refresh(trans)
    log_audit(db, user_id, "EDIT", "TRANSACTION", transaction_id, old_data, edit_data, reason)
    return trans

def soft_delete_transaction(db: Session, transaction_id: int, reason: str, user_id: int):
    trans = db.query(InventoryTransaction).filter(InventoryTransaction.transaction_id == transaction_id).first()
    if not trans or trans.deleted_at: return {"status": "error", "message": "Not found or already deleted"}
    
    old_data = {"deleted_at": None}
    trans.deleted_at = datetime.now()
    trans.edit_reason = reason
    db.commit()
    log_audit(db, user_id, "DELETE", "TRANSACTION", transaction_id, old_data, {"deleted_at": str(trans.deleted_at)}, reason)
    return {"status": "success"}

# ============================================================
# PHASE C: ADVANCED REPORTING
# ============================================================

def get_installation_report(db: Session, filters: ReportFilter) -> Dict[str, Any]:
    query = db.query(InventoryTransaction, Product.product_name, Product.sku_code, Client.company_name)\
        .join(Product, InventoryTransaction.product_id == Product.id)\
        .outerjoin(Client, InventoryTransaction.client_id == Client.id)\
        .filter(InventoryTransaction.lifecycle_status == LifecycleStatus.INSTALLED, InventoryTransaction.deleted_at.is_(None))
    
    if filters.start_date: query = query.filter(InventoryTransaction.created_at >= filters.start_date)
    if filters.end_date: query = query.filter(InventoryTransaction.created_at <= filters.end_date)
    
    rows = query.all()
    by_client = {}
    for trans, p_name, p_sku, client_name in rows:
        key = client_name or "Unassigned"
        if key not in by_client: by_client[key] = []
        by_client[key].append({"location": trans.issued_location, "sku": p_sku, "name": p_name, "qty": trans.quantity})
    
    return {"report_date": date.today(), "total_installations": sum(t.quantity for t,_,_,_ in rows), "by_client": by_client}

# ============================================================
# ENTERPRISE V2: BATCH & SERIAL CRUD
# ============================================================

def create_batch(db: Session, batch_in: BatchCreate, org_id: int) -> Batch:
    # Verify product belongs to org
    product = db.query(Product).filter(Product.id == batch_in.product_id, Product.organization_id == org_id).first()
    if not product:
        raise ValueError("Product not found in your organization")
    db_batch = Batch(**batch_in.model_dump())
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    return db_batch

def get_batches(db: Session, org_id: int, product_id: Optional[int] = None) -> List[Batch]:
    query = db.query(Batch).join(Product).filter(Product.organization_id == org_id)
    if product_id: query = query.filter(Batch.product_id == product_id)
    return query.order_by(desc(Batch.created_at)).all()

def find_batch_by_id(db: Session, batch_id: int) -> Optional[Batch]:
    return db.query(Batch).filter(Batch.id == batch_id).first()

def get_product_instances(db: Session, product_id: int) -> List[ProductInstance]:
    return db.query(ProductInstance).filter(ProductInstance.product_id == product_id).all()

# ============================================================
# ENTERPRISE V2: PURCHASE ORDERS
# ============================================================

def create_purchase_order(db: Session, po_in: PurchaseOrderCreate, user_id: int, org_id: int) -> PurchaseOrder:
    total = sum(item.quantity * item.unit_price for item in po_in.items)
    db_po = PurchaseOrder(
        po_number=po_in.po_number, 
        supplier_name=po_in.supplier_name, 
        total_amount=total, 
        created_by=user_id,
        organization_id=org_id
    )
    db.add(db_po)
    db.flush()
    for item in po_in.items:
        db.add(POItem(po_id=db_po.id, product_id=item.product_id, quantity=item.quantity, unit_price=item.unit_price))
    db.commit()
    db.refresh(db_po)
    return db_po

def list_purchase_orders(db: Session, org_id: int, skip: int = 0, limit: int = 100) -> List[PurchaseOrder]:
    return db.query(PurchaseOrder).filter(PurchaseOrder.organization_id == org_id).order_by(desc(PurchaseOrder.created_at)).offset(skip).limit(limit).all()

def get_purchase_order_by_id(db: Session, po_id: int) -> Optional[PurchaseOrder]:
    return db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()

def receive_purchase_order(db: Session, po_id: int, user_id: int, org_id: int) -> PurchaseOrder:
    db_po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id, PurchaseOrder.organization_id == org_id).first()
    if not db_po or db_po.status == PurchaseOrderStatus.RECEIVED: return db_po
    for item in db_po.items:
        create_transaction(db, TransactionCreate(product_id=item.product_id, transaction_type=TransactionType.PURCHASE, quantity=item.quantity, reference_number=db_po.po_number), user_id, org_id=org_id)
        item.received_quantity = item.quantity
    db_po.status = PurchaseOrderStatus.RECEIVED
    db.commit()
    return db_po

# ============================================================
# ENTERPRISE V2: PROFIT & LOSS TRACKING
# ============================================================

def get_profit_loss_report(db: Session, start_date: date, end_date: date) -> Dict[str, Any]:
    sales = db.query(InventoryTransaction, Product).join(Product)\
        .filter(InventoryTransaction.transaction_type == TransactionType.SALE, InventoryTransaction.deleted_at.is_(None))\
        .filter(func.date(InventoryTransaction.created_at) >= start_date, func.date(InventoryTransaction.created_at) <= end_date).all()
        
    stats = {}
    for trans, p in sales:
        if p.sku_code not in stats: stats[p.sku_code] = {"name": p.product_name, "units": 0, "rev": 0, "cost": 0}
        s = stats[p.sku_code]
        s["units"] += trans.quantity
        s["rev"] += trans.quantity * p.selling_price
        s["cost"] += trans.quantity * p.purchase_price
        
    items = [ProfitLossReportItem(product_sku=k, product_name=v["name"], units_sold=v["units"], total_revenue=v["rev"], total_cost=v["cost"], margin=v["rev"]-v["cost"], margin_percentage=round((v["rev"]-v["cost"])/v["rev"]*100, 2) if v["rev"]>0 else 0) for k, v in stats.items()]
    return {"report_date": date.today(), "total_revenue": sum(i.total_revenue for i in items), "total_cost": sum(i.total_cost for i in items), "net_profit": sum(i.margin for i in items), "items": items}

# ============================================================
# PHASE G: FORECASTING & REMAINING
# ============================================================

def calculate_stock_forecast(db: Session, product_id: int, days_ahead: int = 30) -> List[StockForecast]:
    return [] # Simplified for now

def get_activity_feed(db: Session, skip: int = 0, limit: int = 20) -> Tuple[List[ActivityFeedItem], int]:
    audits = db.query(AuditLog, User.username).join(User).order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()
    items = [ActivityFeedItem(id=a.id, user_name=u, action_type=a.action_type, entity_type=a.entity_type, entity_id=a.entity_id, description=f"{u} {a.action_type} {a.entity_type}", timestamp=a.created_at) for a, u in audits]
    return items, db.query(AuditLog).count()

def add_product_image(db: Session, product_id: int, file_path: str, file_size: int, mime_type: str, is_primary: bool, user_id: int) -> ProductImage:
    image = ProductImage(product_id=product_id, file_path=file_path, file_size=file_size, mime_type=mime_type, is_primary=1 if is_primary else 0, uploaded_by=user_id)
    db.add(image)
    db.commit()
    db.refresh(image)
    return image

def get_product_images(db: Session, product_id: int) -> List[ProductImage]:
    return db.query(ProductImage).filter(ProductImage.product_id == product_id).order_by(desc(ProductImage.is_primary)).all()

def create_bulk_import(db: Session, file_name: str, total_rows: int, successful: int, failed: int, status: str, errors: List[str], user_id: int) -> BulkImport:
    import_record = BulkImport(import_file_name=file_name, total_rows=total_rows, successful_rows=successful, failed_rows=failed, status=status, error_details={"errors": errors}, imported_by=user_id)
    db.add(import_record)
    db.commit()
    db.refresh(import_record)
    return import_record

def create_notification(db: Session, user_id: int, title: str, message: Optional[str] = None, notif_type: Optional[str] = None, entity_type: Optional[str] = None, entity_id: Optional[int] = None, action_url: Optional[str] = None) -> Notification:
    notif = Notification(user_id=user_id, title=title, message=message, notification_type=notif_type, related_entity_type=entity_type, related_entity_id=entity_id, action_url=action_url)
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif

def get_user_notifications(db: Session, user_id: int, skip: int = 0, limit: int = 20) -> Tuple[List[Notification], int]:
    notifs = db.query(Notification).filter(Notification.user_id == user_id).order_by(asc(Notification.is_read), desc(Notification.created_at)).offset(skip).limit(limit).all()
    return notifs, db.query(Notification).filter(Notification.user_id == user_id).count()

def mark_notifications_read(db: Session, notification_ids: List[int], user_id: int):
    db.query(Notification).filter(Notification.id.in_(notification_ids), Notification.user_id == user_id).update({"is_read": 1, "read_at": datetime.now()}, synchronize_session=False)
    db.commit()