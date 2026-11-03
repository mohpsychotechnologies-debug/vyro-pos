-- ============================================================================
-- ADD SAMPLE TABLES FOR RESTAURANT
-- ============================================================================
-- This script adds 10 sample tables to your restaurant
-- Run this in Supabase SQL Editor if tables aren't showing in the app

-- First, let's check if you have a store
-- If you see results, copy the store_id for the next step
SELECT id, name FROM stores LIMIT 5;

-- ============================================================================
-- ADD TABLES (Replace 'YOUR_STORE_ID' with actual store ID from above)
-- ============================================================================

-- OPTION 1: If you see a store ID above, uncomment and replace the ID below:
/*
DO $$
DECLARE
  v_store_id UUID := 'YOUR_STORE_ID'; -- Replace with your actual store ID
BEGIN
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
  
  RAISE NOTICE '10 tables added successfully!';
END $$;
*/

-- ============================================================================
-- OPTION 2: Automatic - Uses first store found
-- ============================================================================
-- Uncomment this block if you want to automatically use the first store:

DO $$
DECLARE
  v_store_id UUID;
BEGIN
  -- Get first store ID
  SELECT id INTO v_store_id FROM stores ORDER BY created_at LIMIT 1;
  
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'No stores found! Please create a store first.';
  END IF;
  
  RAISE NOTICE 'Using store ID: %', v_store_id;
  
  -- Delete existing tables for this store (if any)
  DELETE FROM tables WHERE store_id = v_store_id;
  
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
  
  RAISE NOTICE '✅ 10 tables added successfully for store: %', v_store_id;
END $$;

-- ============================================================================
-- VERIFY TABLES WERE ADDED
-- ============================================================================
-- Run this to see all tables
SELECT 
  t.table_number,
  t.table_name,
  t.capacity,
  t.section,
  t.status,
  s.name as store_name
FROM tables t
LEFT JOIN stores s ON t.store_id = s.id
ORDER BY t.section, t.table_number;

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================

-- Check if stores table exists and has data
-- SELECT COUNT(*) as store_count FROM stores;

-- Check if tables table exists
-- SELECT COUNT(*) as table_count FROM tables;

-- Check RLS policies (might be blocking access)
-- SELECT * FROM pg_policies WHERE tablename = 'tables';

-- Temporarily disable RLS for testing (if needed)
-- ALTER TABLE tables DISABLE ROW LEVEL SECURITY;
