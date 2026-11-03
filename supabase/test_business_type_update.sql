-- ============================================================
-- TEST BUSINESS TYPE UPDATE
-- Test if we can update business_type column
-- ============================================================

-- 1. Check if column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'stores' AND column_name = 'business_type';

-- 2. See current stores
SELECT id, name, business_type FROM stores;

-- 3. Test update (replace with your actual store ID from step 2)
-- UPDATE stores SET business_type = 'hotel' WHERE id = 'YOUR-STORE-ID-HERE';

-- 4. Check RLS policies on stores table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'stores';

-- 5. Check if there are any triggers blocking updates
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'stores';
