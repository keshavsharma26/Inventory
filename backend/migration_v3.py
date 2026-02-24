import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("No DATABASE_URL found.")
    exit(1)

engine = create_engine(DATABASE_URL)

def run_migration():
    with engine.connect() as con:
        print("Modifying schema for Transaction Pricing...")
        con.execute(text("ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS unit_price FLOAT"))
        con.commit()
        print("SUCCESS: 'unit_price' field added to inventory_transactions.")

if __name__ == "__main__":
    run_migration()
