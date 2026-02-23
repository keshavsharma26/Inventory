-- Enterprise V2 Schema Migration

-- 1. Enhance Products Table
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_batch_tracked BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deletion_reason VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS qr_code_path VARCHAR(255);

-- 2. Enhance Transactions Table
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS batch_id INTEGER;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS serial_numbers JSONB;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS source_location VARCHAR(100);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS destination_location VARCHAR(100);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS editing_reason VARCHAR(255);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS edited_by INTEGER;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- 3. Create Manufacturing Batches
CREATE TABLE IF NOT EXISTS batches (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    batch_number VARCHAR(50) NOT NULL,
    mfg_date DATE,
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_number ON batches(batch_number);

-- 4. Create Product Instances (Serialized)
CREATE TABLE IF NOT EXISTS product_instances (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    serial_number VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'AVAILABLE',
    batch_id INTEGER REFERENCES batches(id),
    last_transaction_id INTEGER REFERENCES inventory_transactions(transaction_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_serial UNIQUE (product_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_instances_product ON product_instances(product_id);
CREATE INDEX IF NOT EXISTS idx_instances_serial ON product_instances(serial_number);

-- 5. Create Purchase Order System
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) NOT NULL UNIQUE,
    supplier_name VARCHAR(150) NOT NULL,
    status VARCHAR(30) DEFAULT 'DRAFT',
    total_amount FLOAT DEFAULT 0.0,
    expected_delivery_date DATE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price FLOAT NOT NULL,
    received_quantity INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product ON purchase_order_items(product_id);

-- 6. Notifications Table (Phase F)
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    message TEXT,
    notification_type VARCHAR(50),
    related_entity_type VARCHAR(50),
    related_entity_id INTEGER,
    is_read INTEGER DEFAULT 0,
    action_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
