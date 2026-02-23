import os
import subprocess
from datetime import datetime

# Your Neon connection string
DATABASE_URL = "postgresql://neondb_owner:npg_iDokb6X7EvrA@ep-dry-cake-a11wldpu-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Create backup filename
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_file = f"backup_{timestamp}.sql"

print(f"🔄 Creating backup from Neon Cloud...")
print(f"📁 Backup file: {backup_file}")

try:
    # Use subprocess to call pg_dump
    # If pg_dump not available, we'll try alternative
    with open(backup_file, 'w') as f:
        result = subprocess.run(
            ['pg_dump', DATABASE_URL],
            stdout=f,
            stderr=subprocess.PIPE,
            text=True
        )
    
    if result.returncode == 0:
        file_size = os.path.getsize(backup_file) / 1024 / 1024  # Size in MB
        print(f"✅ Backup created successfully!")
        print(f"📊 File size: {file_size:.2f} MB")
    else:
        print(f"❌ Error: {result.stderr}")
except FileNotFoundError:
    print("❌ pg_dump not found. Installing alternative method...")
    # Use psycopg2 to backup
    import psycopg2
    import json
    
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("""
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
    """)
    tables = [row[0] for row in cursor.fetchall()]
    
    with open(backup_file, 'w') as f:
        for table in tables:
            cursor.execute(f"SELECT * FROM {table}")
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            
            f.write(f"-- Table: {table}\n")
            f.write(f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n")
            for row in rows:
                f.write(f"  {row},\n")
            f.write(";\n\n")
    
    conn.close()
    print(f"✅ Backup created using alternative method!")