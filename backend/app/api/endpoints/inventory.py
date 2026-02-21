from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session
from app.api import deps
from app.db.session import get_db
from app.models.base import User, Product, InventoryTransaction, TransactionType, ProductStatus
from app.schemas.schemas import ProductOut, ProductCreate, ProductUpdate, TransactionOut, TransactionCreate, DashboardStats
from app.crud import crud_inventory

router = APIRouter()

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    return crud_inventory.get_dashboard_stats(db)

@router.get("/products", response_model=List[ProductOut])
def list_products(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    products = crud_inventory.get_products(db, skip=skip, limit=limit)
    
    # Bulk get stock to avoid N+1 queries
    p_ids = [p.id for p in products]
    stock_map = {}
    if p_ids:
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
        ).filter(InventoryTransaction.product_id.in_(p_ids)).group_by(InventoryTransaction.product_id).all()
        stock_map = {row[0]: (row[1] or 0) for row in stock_map_raw}

    results = []
    for p in products:
        p_out = ProductOut.model_validate(p)
        p_out.current_stock = int(stock_map.get(p.id, 0))
        results.append(p_out)
    return results

@router.post("/products", response_model=ProductOut)
def add_product(
    *,
    db: Session = Depends(get_db),
    product_in: ProductCreate,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    # Check if SKU already exists
    existing = crud_inventory.get_product_by_sku(db, product_in.sku_code)
    if existing:
        raise HTTPException(status_code=400, detail=f"A product with SKU '{product_in.sku_code}' already exists.")
    return crud_inventory.create_product(db, product_in)

@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(
    *,
    db: Session = Depends(get_db),
    product_id: int,
    product_in: ProductUpdate,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    product = crud_inventory.update_product(db, product_id, product_in)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.post("/transactions", response_model=TransactionOut)
def add_transaction(
    *,
    db: Session = Depends(get_db),
    transaction_in: TransactionCreate,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    try:
        return crud_inventory.create_transaction(db, transaction_in, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
