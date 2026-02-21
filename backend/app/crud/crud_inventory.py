from sqlalchemy import func, case
from sqlalchemy.orm import Session
from app.models.base import Product, InventoryTransaction, TransactionType, User, ProductStatus
from app.schemas.schemas import ProductCreate, ProductUpdate, TransactionCreate
from typing import List, Optional

def get_product_stock(db: Session, product_id: int) -> int:
    # Logic: Stock = (PURCHASE + CUSTOMER_RETURN) - (SALE + SUPPLIER_RETURN) + MANUAL_ADJUSTMENT
    # Let's simplify: Store quantity in DB with correct sign based on type?
    # Or calculate it here.
    
    # In-types: PURCHASE, CUSTOMER_RETURN
    # Out-types: SALE, SUPPLIER_RETURN
    # MANUAL: can be +/-
    
    in_sum = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.product_id == product_id)\
        .filter(InventoryTransaction.transaction_type.in_([TransactionType.PURCHASE, TransactionType.CUSTOMER_RETURN]))\
        .scalar() or 0
        
    out_sum = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.product_id == product_id)\
        .filter(InventoryTransaction.transaction_type.in_([TransactionType.SALE, TransactionType.SUPPLIER_RETURN]))\
        .scalar() or 0
        
    manual_sum = db.query(func.sum(InventoryTransaction.quantity))\
        .filter(InventoryTransaction.product_id == product_id)\
        .filter(InventoryTransaction.transaction_type == TransactionType.MANUAL_ADJUSTMENT)\
        .scalar() or 0
        
    return int(in_sum - out_sum + manual_sum)

def create_product(db: Session, product: ProductCreate) -> Product:
    db_product = Product(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

def update_product(db: Session, product_id: int, product_in: ProductUpdate) -> Optional[Product]:
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        return None
    
    update_data = product_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_product, field, value)
    
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

def get_product_by_sku(db: Session, sku: str) -> Optional[Product]:
    return db.query(Product).filter(Product.sku_code == sku).first()

def get_products(db: Session, skip: int = 0, limit: int = 100, include_inactive: bool = False) -> List[Product]:
    query = db.query(Product)
    if not include_inactive:
        query = query.filter(Product.is_active == 1)
    return query.offset(skip).limit(limit).all()

def create_transaction(db: Session, transaction: TransactionCreate, user_id: int) -> InventoryTransaction:
    # Check for negative stock if it's an OUT transaction
    if transaction.transaction_type in [TransactionType.SALE, TransactionType.SUPPLIER_RETURN]:
        current_stock = get_product_stock(db, transaction.product_id)
        if current_stock < transaction.quantity:
            raise ValueError("Insufficient stock for this transaction")
            
    db_transaction = InventoryTransaction(
        **transaction.model_dump(),
        created_by=user_id
    )
    
    # Auto-adjust status based on type if not manually overridden (still AVAILABLE)
    if transaction.transaction_type == TransactionType.SALE and db_transaction.status == ProductStatus.AVAILABLE:
        db_transaction.status = ProductStatus.INSTALLED
    elif transaction.transaction_type == TransactionType.CUSTOMER_RETURN and db_transaction.status == ProductStatus.AVAILABLE:
        db_transaction.status = ProductStatus.RETURNED

    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

def get_dashboard_stats(db: Session):
    total_products = db.query(Product).filter(Product.is_active == 1).count()
    
    # To avoid N+1, aggregate stock by product in one query
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
    ).group_by(InventoryTransaction.product_id).all()
    
    stock_map = {row[0]: (row[1] or 0) for row in stock_map_raw}
    
    total_inventory = 0
    low_stock_count = 0
    inventory_value = 0.0
    
    all_products = db.query(Product).filter(Product.is_active == 1).all()
    for p in all_products:
        # Get stock from map, default to 0 if no transactions exist
        stock = int(stock_map.get(p.id, 0))
        total_inventory += stock
        inventory_value += (stock * (p.purchase_price or 0))
        if stock <= (p.low_stock_limit or 0):
            low_stock_count += 1

    # Status Counts
    installed_count = db.query(func.sum(InventoryTransaction.quantity)).filter(InventoryTransaction.status == "INSTALLED").scalar() or 0
    returned_count = db.query(func.sum(InventoryTransaction.quantity)).filter(InventoryTransaction.status == "RETURNED").scalar() or 0
    damaged_count = db.query(func.sum(InventoryTransaction.quantity)).filter(InventoryTransaction.status == "DAMAGED").scalar() or 0

    recent_transactions_raw = db.query(InventoryTransaction, Product.product_name)\
        .join(Product, InventoryTransaction.product_id == Product.id)\
        .order_by(InventoryTransaction.created_at.desc())\
        .limit(10).all()
    
    recent_transactions = []
    for t, p_name in recent_transactions_raw:
        t_dict = {
            "transaction_id": t.transaction_id,
            "product_id": t.product_id,
            "product_name": p_name,
            "transaction_type": t.transaction_type,
            "quantity": t.quantity,
            "status": t.status,
            "issued_to_company": t.issued_to_company,
            "issued_location": t.issued_location,
            "reference_number": t.reference_number,
            "notes": t.notes,
            "created_by": t.created_by,
            "created_at": t.created_at
        }
        recent_transactions.append(t_dict)
        
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
