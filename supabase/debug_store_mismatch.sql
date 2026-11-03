-- ============================================================================
-- DEBUG: Store ID Mismatch Check
-- ============================================================================
-- This checks if tables exist but have wrong store_id

-- Your store ID from the app: fb19df2f-060d-42a9-9ed4-6bde6636984e

-- 1. Check what stores exist
SELECT 'STORES IN DATABASE:' as info;
SELECT id, name FROM stores;

-- 2. Check what tables exist and their store_ids
SELECT 'TABLES IN DATABASE:' as info;
SELECT 
  table_number,
  store_id,
  section,
  status
FROM tables;

-- 3. Check if store IDs match
SELECT 'STORE ID MATCH CHECK:' as info;
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM tables WHERE store_id = 'fb19df2f-060d-42a9-9ed4-6bde6636984e') 
    THEN '✅ Tables exist for this store'
    ELSE '❌ No tables for this store - MISMATCH!'
  END as result;

-- 4. If mismatch, show the difference
SELECT 'MISMATCH DETAILS:' as info;
SELECT 
  'Tables have store_id:' as info,
  DISTINCT store_id 
FROM tables;

SELECT 
  'App is looking for:' as info,
  'fb19df2f-060d-42a9-9ed4-6bde6636984e' as store_id;

-- ============================================================================
-- FIX: Update tables to match your store
-- ============================================================================
-- Uncomment and run this if there's a mismatch:

/*
UPDATE tables 
SET store_id = 'fb19df2f-060d-42a9-9ed4-6bde6636984e'
WHERE store_id != 'fb19df2f-060d-42a9-9ed4-6bde6636984e';

SELECT 'FIXED!' as result, COUNT(*) as tables_updated FROM tables;
*/

-- ============================================================================
-- VERIFY AFTER FIX
-- ============================================================================
SELECT 'FINAL CHECK:' as info;
SELECT 
  table_number,
  capacity,
  section,
  status,
  store_id
FROM tables
WHERE store_id = 'fb19df2f-060d-42a9-9ed4-6bde6636984e';
