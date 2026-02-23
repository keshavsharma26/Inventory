import pandas as pd
from typing import Any
from datetime import datetime, date
import pytz
import io
import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case, desc
from app.api import deps
from app.db.session import get_db
from app.models.base import (
    User, Product, InventoryTransaction, TransactionType,
    Client, BulkImport, LifecycleStatus
)
from app.crud import crud_inventory
from app.schemas.schemas import ProductCreate, TransactionCreate, ReportFilter, ProfitLossReportOut
from reportlab.lib.pagesizes import letter, A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

import qrcode
from io import BytesIO
import os

router = APIRouter()
IST = pytz.timezone('Asia/Kolkata')

@router.post("/import")
async def import_excel(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))
    success_count = 0
    errors = []
    for index, row in df.iterrows():
        try:
            product = db.query(Product).filter(Product.sku_code == str(row['sku']).strip()).first()
            if not product:
                product = crud_inventory.create_product(db, ProductCreate(product_name=str(row['product_name']), sku_code=str(row['sku']).strip(), purchase_price=float(row['price']), selling_price=float(row['price']) * 1.2))
            crud_inventory.create_transaction(db, TransactionCreate(product_id=product.id, transaction_type=TransactionType.PURCHASE, quantity=int(row['quantity']), notes="Imported"), current_user.id)
            success_count += 1
        except Exception as e: errors.append(f"Row {index+2}: {str(e)}")
    crud_inventory.create_bulk_import(db, file.filename, len(df), success_count, len(errors), "PARTIAL" if errors else "SUCCESS", errors, current_user.id)
    return {"message": "Import completed", "success": success_count, "failed": len(errors)}

@router.get("/export/inventory")
def export_inventory(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    products = db.query(Product).filter(Product.is_active == 1).all()
    data = [{"Product Name": p.product_name, "SKU": p.sku_code, "Stock": crud_inventory.get_product_stock(db, p.id), "Value": crud_inventory.get_product_stock(db, p.id) * p.purchase_price} for p in products]
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer: df.to_excel(writer, index=False)
    output.seek(0)
    return StreamingResponse(output, headers={'Content-Disposition': f'attachment; filename="inventory_{date.today()}.xlsx"'}, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

# ============================================================
# ENTERPRISE V2: FINANCIAL REPORTS
# ============================================================

@router.post("/profit-loss", response_model=ProfitLossReportOut)
def get_profit_loss_report(*, db: Session = Depends(get_db), filters: ReportFilter, current_user: User = Depends(deps.get_current_active_user)) -> Any:
    if not filters.start_date or not filters.end_date:
        raise HTTPException(status_code=400, detail="Start and End dates are required")
    return crud_inventory.get_profit_loss_report(db, filters.start_date, filters.end_date)

@router.get("/sales/pdf")
def export_sales_pdf(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_active_user)):
    transactions = db.query(InventoryTransaction, Product.product_name).join(Product).filter(InventoryTransaction.transaction_type == TransactionType.SALE).all()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = [Paragraph("Sales Report", getSampleStyleSheet()['Title'])]
    data = [["Product", "Qty", "Date"]] + [[p_name, str(t.quantity), t.created_at.strftime('%Y-%m-%d')] for t, p_name in transactions]
    table = Table(data)
    table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.grey), ('GRID', (0, 0), (-1, -1), 1, colors.black)]))
    elements.append(table)
    doc.build(elements)
    buffer.seek(0)
    return StreamingResponse(buffer, headers={'Content-Disposition': f'attachment; filename="sales_{date.today()}.pdf"'}, media_type='application/pdf')