-- ============================================================
-- FIX RLS POLICIES AND BUSINESS TYPE ISSUES
-- ============================================================

-- 1. Check current issues
SELECT 'Current Subscription Requests' as info;
SELECT business_name, business_type, status FROM subscription_requests ORDER BY created_at DESC LIMIT 5;

SELECT 'Current Stores' as info;
SELECT name, business_type FROM stores;

-- 2. Fix RLS on products table (IMPORTANT SECURITY FIX)
-- Drop existing policies that might be too permissive
DROP POLICY IF EXISTS "Users can view all products" ON products;
DROP POLICY IF EXISTS "Anyone can view products" ON products;

-- Create proper RLS policy for products (only see your store's products)
CREATE POLICY "Users can view own store products"
  ON products
  FOR SELECT
  USING (store_id = current_store_id());

CREATE POLICY "Users can insert own store products"
  ON products
  FOR INSERT
  WITH CHECK (store_id = current_store_id());

CREATE POLICY "Users can update own store products"
  ON products
  FOR UPDATE
  USING (store_id = current_store_id())
  WITH CHECK (store_id = current_store_id());

CREATE POLICY "Users can delete own store products"
  ON products
  FOR DELETE
  USING (store_id = current_store_id());

-- 3. Fix RLS on other important tables
-- Sales
DROP POLICY IF EXISTS "Users can view all sales" ON sales;

CREATE POLICY "Users can view own store sales"
  ON sales
  FOR SELECT
  USING (store_id = current_store_id());

CREATE POLICY "Users can insert own store sales"
  ON sales
  FOR INSERT
  WITH CHECK (store_id = current_store_id());

-- Customers
DROP POLICY IF EXISTS "Users can view all customers" ON customers;

CREATE POLICY "Users can view own store customers"
  ON customers
  FOR SELECT
  USING (store_id = current_store_id());

CREATE POLICY "Users can insert own store customers"
  ON customers
  FOR INSERT
  WITH CHECK (store_id = current_store_id());

CREATE POLICY "Users can update own store customers"
  ON customers
  FOR UPDATE
  USING (store_id = current_store_id());

-- 4. Verify RLS is enabled
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- 5. Check final state
SELECT 'Products RLS Policies' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'products';

SELECT 'Sales RLS Policies' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'sales';
