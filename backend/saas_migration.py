import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("No DATABASE_URL found.")
    exit(1)

engine = create_engine(DATABASE_URL)

def migrate_to_saas():
    tables = [
        "notifications", "stock_forecasts", "bulk_imports", "pwa_settings", 
        "product_images", "inventory_value_history", "transaction_snapshots", 
        "audit_logs", "purchase_order_items", "purchase_orders", 
        "inventory_transactions", "product_instances", "batches", 
        "products", "clients", "users", "organizations"
    ]
    
    with engine.connect() as con:
        print("Cleaning up shared database for Multi-Tenant isolation...")
        # Drop with CASCADE to be sure
        for table in tables:
            con.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
        con.commit()
        print("SUCCESS: Database is ready for new SaaS Signups.")

if __name__ == "__main__":
    migrate_to_saas()
