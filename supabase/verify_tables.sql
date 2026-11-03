-- ============================================================================
-- VERIFY RESTAURANT TABLES
-- ============================================================================
-- Run this to diagnose why tables aren't showing

-- 1. Check if stores table has data
SELECT 'STORES:' as check_type, COUNT(*) as count FROM stores;
SELECT * FROM stores LIMIT 5;

-- 2. Check if tables table exists and has data
SELECT 'TABLES:' as check_type, COUNT(*) as count FROM tables;
SELECT * FROM tables;

-- 3. Check if there's a store_id mismatch
-- Show all store IDs from both tables
SELECT DISTINCT store_id, 'from stores' as source FROM stores
UNION
SELECT DISTINCT store_id, 'from tables' as source FROM tables;

-- 4. Check RLS policies on tables
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('tables', 'restaurant_orders');

-- 5. Try selecting tables with RLS bypassed (as superuser)
SET ROLE postgres;
SELECT * FROM tables;
RESET ROLE;

-- ============================================================================
-- QUICK FIX OPTIONS
-- ============================================================================

-- OPTION A: Disable RLS temporarily to test
-- ALTER TABLE tables DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE restaurant_orders DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE restaurant_order_items DISABLE ROW LEVEL SECURITY;

-- OPTION B: Add tables manually (replace YOUR_STORE_ID)
-- Get your store ID first:
-- SELECT id FROM stores LIMIT 1;

-- Then uncomment and run:
/*
INSERT INTO tables (store_id, table_number, capacity, section, status) VALUES
('YOUR_STORE_ID_HERE', '1', 4, 'main', 'available'),
('YOUR_STORE_ID_HERE', '2', 4, 'main', 'available'),
('YOUR_STORE_ID_HERE', '3', 2, 'main', 'available');
*/
