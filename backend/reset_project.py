import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not found in .env file")
    sys.exit(1)

# Connect to database
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def cleanup_project():
    db = SessionLocal()
    try:
        print("Starting Deep Cleanup of Inventory Pro...")
        
        # Tables to truncate/clean (Order is important due to Foreign Keys)
        # We delete in reverse order of dependencies
        tables = [
            "notifications",
            "stock_forecasts",
            "bulk_imports",
            "product_images",
            "inventory_value_history",
            "transaction_snapshots",
            "audit_logs",
            "purchase_order_items",
            "purchase_orders",
            "inventory_transactions",
            "product_instances",
            "batches",
            "products",
            "clients"
        ]
        
        # Disable foreign key checks for the session if possible, or just delete in order
        # For PostgreSQL, we can use TRUNCATE with CASCADE
        for table in tables:
            print(f"Cleaning table: {table}...")
            # Use TRUNCATE CASCADE to handle any missed dependencies and reset identity counters
            db.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE"))
        
        db.commit()
        print("\nSUCCESS: All inventory data, history, charts, and logs have been wiped.")
        print("Your Admin User account is still active.")
        print("The project is now 'Like New'.")
        
    except Exception as e:
        db.rollback()
        print(f"\nERROR during cleanup: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    confirm = input("WARNING: This will delete ALL data (Products, History, Charts, Logs) except your User account. \nAre you sure? (type 'yes' to proceed): ")
    if confirm.lower() == 'yes':
        cleanup_project()
    else:
        print("Cleanup cancelled.")
