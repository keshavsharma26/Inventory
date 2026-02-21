import pandas as pd
import io
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.api import deps
from app.db.session import get_db
from app.models.base import User, Product, InventoryTransaction, TransactionType
from app.crud import crud_inventory
from app.schemas.schemas import ProductCreate, TransactionCreate
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

router = APIRouter()

@router.post("/import")
async def import_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))
    
    # Required columns: product_name, sku, quantity, price
    required = ['product_name', 'sku', 'quantity', 'price']
    if not all(col in df.columns for col in required):
        raise HTTPException(status_code=400, detail=f"Missing columns. Required: {required}")
    
    success_count = 0
    errors = []
    
    for index, row in df.iterrows():
        try:
            # 1. Find or create product
            product = db.query(Product).filter(Product.sku_code == str(row['sku'])).first()
            if not product:
                product_in = ProductCreate(
                    product_name=row['product_name'],
                    sku_code=str(row['sku']),
                    purchase_price=float(row['price']),
                    selling_price=float(row['price']) * 1.2 # Default markup
                )
                product = crud_inventory.create_product(db, product_in)
            
            # 2. Add transaction (Assuming PURCHASE for import)
            trans_in = TransactionCreate(
                product_id=product.id,
                transaction_type=TransactionType.PURCHASE,
                quantity=int(row['quantity']),
                notes="Imported from Excel"
            )
            crud_inventory.create_transaction(db, trans_in, current_user.id)
            success_count += 1
        except ValueError as e:
            msg = str(e)
            if "invalid literal for int()" in msg:
                errors.append(f"Row {index+2}: Quantity must be a number.")
            elif "could not convert string to float" in msg:
                errors.append(f"Row {index+2}: Price must be a number.")
            else:
                errors.append(f"Row {index+2}: {msg}")
        except Exception as e:
            errors.append(f"Row {index+2}: Unexpected data format.")
            
    return {"message": "Import completed", "success": success_count, "errors": errors}

@router.get("/export/inventory")
def export_inventory(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    products = db.query(Product).all()
    data = []
    for p in products:
        stock = crud_inventory.get_product_stock(db, p.id)
        data.append({
            "Product Name": p.product_name,
            "SKU": p.sku_code,
            "Category": p.category,
            "Purchase Price": p.purchase_price,
            "Selling Price": p.selling_price,
            "Current Stock": stock,
            "Inventory Value": stock * p.purchase_price
        })
    
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Inventory')
    
    output.seek(0)
    headers = {
        'Content-Disposition': 'attachment; filename="inventory_report.xlsx"'
    }
    return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@router.get("/sales/pdf")
def export_sales_pdf(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    # Fetch transactions (sales/installed)
    transactions = db.query(InventoryTransaction, Product.product_name)\
        .join(Product, InventoryTransaction.product_id == Product.id)\
        .filter(InventoryTransaction.transaction_type == TransactionType.SALE)\
        .all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    
    styles = getSampleStyleSheet()
    title_style = styles['Title']
    subheading_style = styles['Heading3']
    normal_style = styles['Normal']

    # Header
    elements.append(Paragraph("Inventory Pro - Sales Report", title_style))
    elements.append(Paragraph(f"Generated Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", normal_style))
    elements.append(Paragraph(f"Generated By: {current_user.username}", normal_style))
    elements.append(Spacer(1, 20))

    # Table Header
    data = [["Product", "Company", "Location", "Qty", "Date"]]
    
    total_qty = 0
    for t, p_name in transactions:
        data.append([
            p_name,
            t.issued_to_company or "-",
            t.issued_location or "-",
            str(t.quantity),
            t.created_at.strftime('%Y-%m-%d')
        ])
        total_qty += t.quantity

    # Create Table
    table = Table(data, colWidths=[150, 100, 100, 50, 80])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    
    elements.append(table)
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(f"Total Sales Quantity: {total_qty}", subheading_style))

    doc.build(elements)
    buffer.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="sales_report.pdf"'
    }
    return StreamingResponse(buffer, headers=headers, media_type='application/pdf')
