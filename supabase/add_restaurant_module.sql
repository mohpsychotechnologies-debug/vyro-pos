-- ============================================================================
-- RESTAURANT MODULE - Tables, Orders, Kitchen Management
-- ============================================================================
-- This adds restaurant/hotel food order management to Vyro POS
-- Features: Table management, Dine-in orders, Kitchen display, Waiter workflow
--
-- PREREQUISITES:
-- You must have these tables: stores, users (optional), products
-- 
-- If you get errors, you can run this with minimal dependencies
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  table_name TEXT,
  capacity INTEGER DEFAULT 4,
  section TEXT DEFAULT 'main', -- 'main', 'outdoor', 'vip', 'bar'
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'dirty')),
  position_x INTEGER DEFAULT 0, -- for visual layout
  position_y INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, table_number)
);

CREATE INDEX idx_tables_store ON tables(store_id);
CREATE INDEX idx_tables_status ON tables(status);

-- ============================================================================
-- 2. RESTAURANT ORDERS (Dine-in)
-- ============================================================================
CREATE TABLE IF NOT EXISTS restaurant_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  waiter_id UUID, -- Made optional - can reference users(id) if exists
  guest_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'completed', 'cancelled')),
  subtotal NUMERIC(10,2) DEFAULT 0,
  tax NUMERIC(10,2) DEFAULT 0,
  service_charge NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  payment_method TEXT,
  paid BOOLEAN DEFAULT FALSE,
  notes TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  sent_to_kitchen_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_restaurant_orders_store ON restaurant_orders(store_id);
CREATE INDEX idx_restaurant_orders_table ON restaurant_orders(table_id);
CREATE INDEX idx_restaurant_orders_status ON restaurant_orders(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_waiter ON restaurant_orders(waiter_id);

-- ============================================================================
-- 3. RESTAURANT ORDER ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS restaurant_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES restaurant_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'preparing', 'ready', 'served', 'cancelled')),
  notes TEXT, -- special requests like "No onions", "Extra spicy"
  course TEXT, -- 'appetizer', 'main', 'dessert', 'drink'
  sent_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_restaurant_order_items_order ON restaurant_order_items(order_id);
CREATE INDEX idx_restaurant_order_items_product ON restaurant_order_items(product_id);
CREATE INDEX idx_restaurant_order_items_status ON restaurant_order_items(status);

-- ============================================================================
-- 4. FUNCTIONS
-- ============================================================================

-- Generate unique order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  prefix TEXT := 'ORD';
  timestamp_part TEXT;
  random_part TEXT;
BEGIN
  timestamp_part := TO_CHAR(NOW(), 'YYYYMMDD');
  random_part := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  new_number := prefix || timestamp_part || random_part;
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create restaurant order
CREATE OR REPLACE FUNCTION create_restaurant_order(
  p_store_id UUID,
  p_table_id UUID,
  p_waiter_id UUID,
  p_guest_count INTEGER DEFAULT 1
)
RETURNS UUID
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
BEGIN
  -- Generate order number
  v_order_number := generate_order_number();
  
  -- Create order
  INSERT INTO restaurant_orders (
    store_id, table_id, waiter_id, order_number, guest_count, status
  ) VALUES (
    p_store_id, p_table_id, p_waiter_id, v_order_number, p_guest_count, 'open'
  ) RETURNING id INTO v_order_id;
  
  -- Update table status to occupied
  IF p_table_id IS NOT NULL THEN
    UPDATE tables SET status = 'occupied', updated_at = NOW() WHERE id = p_table_id;
  END IF;
  
  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- Add item to restaurant order
CREATE OR REPLACE FUNCTION add_restaurant_order_item(
  p_order_id UUID,
  p_product_id UUID,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL,
  p_course TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
AS $$
DECLARE
  v_item_id UUID;
  v_product RECORD;
  v_subtotal NUMERIC;
BEGIN
  -- Get product details
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  v_subtotal := v_product.price * p_quantity;
  
  -- Insert order item
  INSERT INTO restaurant_order_items (
    order_id, product_id, item_name, quantity, price, subtotal, notes, course
  ) VALUES (
    p_order_id, p_product_id, v_product.name, p_quantity, v_product.price, v_subtotal, p_notes, p_course
  ) RETURNING id INTO v_item_id;
  
  -- Update order totals
  PERFORM update_restaurant_order_totals(p_order_id);
  
  RETURN v_item_id;
END;
$$ LANGUAGE plpgsql;

-- Update order totals
CREATE OR REPLACE FUNCTION update_restaurant_order_totals(p_order_id UUID)
RETURNS VOID
SECURITY DEFINER
AS $$
DECLARE
  v_subtotal NUMERIC;
  v_tax NUMERIC;
  v_service_charge NUMERIC;
  v_discount NUMERIC;
  v_total NUMERIC;
  v_tax_rate NUMERIC := 16; -- 16% VAT
  v_service_rate NUMERIC := 0; -- 0% service charge by default
BEGIN
  -- Calculate subtotal from items
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM restaurant_order_items
  WHERE order_id = p_order_id AND status != 'cancelled';
  
  -- Get discount from order
  SELECT COALESCE(discount, 0) INTO v_discount FROM restaurant_orders WHERE id = p_order_id;
  
  -- Calculate tax and service charge
  v_tax := (v_subtotal - v_discount) * v_tax_rate / 100;
  v_service_charge := (v_subtotal - v_discount) * v_service_rate / 100;
  v_total := v_subtotal - v_discount + v_tax + v_service_charge;
  
  -- Update order
  UPDATE restaurant_orders
  SET subtotal = v_subtotal,
      tax = v_tax,
      service_charge = v_service_charge,
      total = v_total,
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- Send order to kitchen
CREATE OR REPLACE FUNCTION send_order_to_kitchen(p_order_id UUID)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  -- Update order status
  UPDATE restaurant_orders
  SET status = 'sent_to_kitchen',
      sent_to_kitchen_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;
  
  -- Update all pending items to sent
  UPDATE restaurant_order_items
  SET status = 'sent',
      sent_at = NOW(),
      updated_at = NOW()
  WHERE order_id = p_order_id AND status = 'pending';
END;
$$ LANGUAGE plpgsql;

-- Complete order and close table
CREATE OR REPLACE FUNCTION complete_restaurant_order(
  p_order_id UUID,
  p_payment_method TEXT
)
RETURNS VOID
SECURITY DEFINER
AS $$
DECLARE
  v_table_id UUID;
BEGIN
  -- Get table ID
  SELECT table_id INTO v_table_id FROM restaurant_orders WHERE id = p_order_id;
  
  -- Update order
  UPDATE restaurant_orders
  SET status = 'completed',
      paid = TRUE,
      payment_method = p_payment_method,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;
  
  -- Free up the table
  IF v_table_id IS NOT NULL THEN
    UPDATE tables SET status = 'dirty', updated_at = NOW() WHERE id = v_table_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update item status (for kitchen)
CREATE OR REPLACE FUNCTION update_order_item_status(
  p_item_id UUID,
  p_status TEXT
)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  UPDATE restaurant_order_items
  SET status = p_status,
      ready_at = CASE WHEN p_status = 'ready' THEN NOW() ELSE ready_at END,
      updated_at = NOW()
  WHERE id = p_item_id;
  
  -- Update order status based on items
  UPDATE restaurant_orders ro
  SET status = CASE
    WHEN EXISTS (SELECT 1 FROM restaurant_order_items WHERE order_id = ro.id AND status IN ('preparing', 'sent')) THEN 'preparing'
    WHEN NOT EXISTS (SELECT 1 FROM restaurant_order_items WHERE order_id = ro.id AND status != 'ready' AND status != 'served') THEN 'ready'
    ELSE ro.status
  END,
  updated_at = NOW()
  WHERE id = (SELECT order_id FROM restaurant_order_items WHERE id = p_item_id);
END;
$$ LANGUAGE plpgsql;

-- Get active orders for kitchen display
CREATE OR REPLACE FUNCTION get_kitchen_orders(p_store_id UUID)
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  table_number TEXT,
  item_id UUID,
  item_name TEXT,
  quantity INTEGER,
  notes TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ,
  time_elapsed INTEGER
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ro.id,
    ro.order_number,
    COALESCE(t.table_number, 'Takeaway') as table_number,
    roi.id,
    roi.item_name,
    roi.quantity,
    roi.notes,
    roi.status,
    roi.sent_at,
    EXTRACT(EPOCH FROM (NOW() - roi.sent_at))::INTEGER as time_elapsed
  FROM restaurant_order_items roi
  JOIN restaurant_orders ro ON roi.order_id = ro.id
  LEFT JOIN tables t ON ro.table_id = t.id
  WHERE ro.store_id = p_store_id
    AND roi.status IN ('sent', 'preparing')
    AND ro.status != 'cancelled'
  ORDER BY roi.sent_at ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_order_items ENABLE ROW LEVEL SECURITY;

-- Simple policies that allow access based on store_id
-- If you have auth.uid() configured, these will work
-- If not, you can disable RLS temporarily for testing

-- Tables policies (allow all for now - tighten in production)
CREATE POLICY "Allow all operations on tables"
  ON tables FOR ALL
  USING (true)
  WITH CHECK (true);

-- Restaurant orders policies (allow all for now - tighten in production)
CREATE POLICY "Allow all operations on restaurant_orders"
  ON restaurant_orders FOR ALL
  USING (true)
  WITH CHECK (true);

-- Restaurant order items policies (allow all for now - tighten in production)
CREATE POLICY "Allow all operations on restaurant_order_items"
  ON restaurant_order_items FOR ALL
  USING (true)
  WITH CHECK (true);

-- NOTE: In production, replace these permissive policies with proper auth:
-- Example with users table:
-- CREATE POLICY "Users can view tables in their store"
--   ON tables FOR SELECT
--   USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));
--
-- For now, these allow development and testing without users table

-- ============================================================================
-- 6. SEED DATA (Optional - for testing)
-- ============================================================================

-- Add sample tables for first store
DO $$
DECLARE
  v_store_id UUID;
BEGIN
  SELECT id INTO v_store_id FROM stores ORDER BY created_at LIMIT 1;
  
  IF v_store_id IS NOT NULL THEN
    -- Main dining area
    INSERT INTO tables (store_id, table_number, table_name, capacity, section, status) VALUES
    (v_store_id, '1', 'Table 1', 4, 'main', 'available'),
    (v_store_id, '2', 'Table 2', 4, 'main', 'available'),
    (v_store_id, '3', 'Table 3', 2, 'main', 'available'),
    (v_store_id, '4', 'Table 4', 6, 'main', 'available'),
    (v_store_id, '5', 'Table 5', 4, 'main', 'available'),
    (v_store_id, '6', 'Table 6', 2, 'main', 'available');
    
    -- Outdoor area
    INSERT INTO tables (store_id, table_number, table_name, capacity, section, status) VALUES
    (v_store_id, 'O1', 'Outdoor 1', 4, 'outdoor', 'available'),
    (v_store_id, 'O2', 'Outdoor 2', 6, 'outdoor', 'available');
    
    -- VIP area
    INSERT INTO tables (store_id, table_number, table_name, capacity, section, status) VALUES
    (v_store_id, 'VIP1', 'VIP Suite', 8, 'vip', 'available');
    
    -- Bar area
    INSERT INTO tables (store_id, table_number, table_name, capacity, section, status) VALUES
    (v_store_id, 'BAR', 'Bar Counter', 10, 'bar', 'available');
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- To apply this migration:
-- 1. Copy this entire file
-- 2. Go to Supabase Dashboard → SQL Editor
-- 3. Paste and run the SQL
-- 4. Verify tables are created in Table Editor
-- ============================================================================
