# -*- coding: utf-8 -*-
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print('ERROR: DATABASE_URL not found in .env')
    exit(1)

print('Connecting to Neon...')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    with open('migration_upgrade_v2.sql', 'r') as f:
        migration_sql = f.read()
    
    statements = migration_sql.split(';')
    count = 0
    
    for statement in statements:
        statement = statement.strip()
        if statement:
            try:
                cursor.execute(statement)
                count += 1
            except Exception as e:
                print(f'Skipped: {str(e)[:80]}')
    
    conn.commit()
    print(f'Migration complete! {count} statements executed.')
    
    cursor.close()
    conn.close()

except Exception as e:
    print(f'Error: {e}')
    exit(1)
