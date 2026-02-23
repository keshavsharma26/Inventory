-- Table: users
INSERT INTO users (id, username, email, hashed_password, role, is_active, created_at) VALUES
  (1, 'admin', 'admin@inventorypro.com', '$2b$12$eq0aqUjTihPIcby2VFfzeeTr583H2bTrK2pQV5ue.DbgS8V7YPu1C', 'ADMIN', 1, datetime.datetime(2026, 2, 20, 17, 2, 51, 876652)),
;

-- Table: products
INSERT INTO products (id, product_name, sku_code, category, purchase_price, selling_price, low_stock_limit, created_at, is_active) VALUES
  (9, 'Router', 'RTR01', None, 2000.0, 2400.0, 5, datetime.datetime(2026, 2, 20, 17, 34, 23, 361108), 1),
  (1, 'Vibo', '122', 'sensor', 510.0, 600.0, 10, datetime.datetime(2026, 2, 20, 17, 20, 9, 256606), 1),
  (2, 'Vibo', '1223', 'sensor', 300.0, 500.0, 5, datetime.datetime(2026, 2, 20, 17, 21, 12, 717317), 0),
  (8, 'GPS Sensor', 'GPS01', None, 1200.0, 1440.0, 5, datetime.datetime(2026, 2, 20, 17, 34, 22, 272785), 0),
  (7, 'Vibo', '1225', 'sensor', 400.0, 800.0, 5, datetime.datetime(2026, 2, 20, 17, 26, 2, 789090), 0),
;

-- Table: inventory_transactions
INSERT INTO inventory_transactions (transaction_id, product_id, transaction_type, quantity, reference_number, notes, created_by, created_at, issued_to_company, issued_location, issued_to_person, status) VALUES
  (1, 1, 'PURCHASE', 30, 'Inv-002', '', 1, datetime.datetime(2026, 2, 20, 17, 27, 10, 320103), None, None, None, 'AVAILABLE'),
  (2, 1, 'SALE', 10, '', '', 1, datetime.datetime(2026, 2, 20, 17, 31, 36, 252172), None, None, None, 'AVAILABLE'),
  (3, 8, 'PURCHASE', 20, None, 'Imported from Excel', 1, datetime.datetime(2026, 2, 20, 17, 34, 22, 848757), None, None, None, 'AVAILABLE'),
  (4, 9, 'PURCHASE', 10, None, 'Imported from Excel', 1, datetime.datetime(2026, 2, 20, 17, 34, 23, 806776), None, None, None, 'AVAILABLE'),
  (5, 8, 'PURCHASE', 20, None, 'Imported from Excel', 1, datetime.datetime(2026, 2, 20, 17, 35, 35, 971742), None, None, None, 'AVAILABLE'),
  (6, 9, 'PURCHASE', 10, None, 'Imported from Excel', 1, datetime.datetime(2026, 2, 20, 17, 35, 36, 482872), None, None, None, 'AVAILABLE'),
  (7, 1, 'SALE', 11, '', '', 1, datetime.datetime(2026, 2, 20, 17, 50, 54, 439443), None, None, None, 'AVAILABLE'),
  (8, 9, 'SALE', 10, '', '', 1, datetime.datetime(2026, 2, 21, 6, 20, 5, 843095), 'Logitech', 'Delhi', None, 'INSTALLED'),
  (9, 9, 'SALE', 5, '', '', 1, datetime.datetime(2026, 2, 21, 6, 22, 34, 143643), 'Ultratech', 'Delhi', None, 'INSTALLED'),
  (10, 9, 'PURCHASE', 6, '007', 'Hii!', 1, datetime.datetime(2026, 2, 21, 12, 8, 49, 282516), '', '', None, 'RETURNED'),
;

