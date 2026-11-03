-- ============================================================
-- FIX STORES TABLE RLS
-- Allow users to read their own store information
-- ============================================================

-- Check current policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'stores';

-- Drop overly restrictive policies
DROP POLICY IF EXISTS "Users cannot view stores" ON stores;
DROP POLICY IF EXISTS "Restrict store access" ON stores;

-- Allow users to read their own store
CREATE POLICY "Users can view own store"
  ON stores
  FOR SELECT
  USING (id = current_store_id() OR current_user_role() = 'superadmin');

-- Allow superadmin to update any store
CREATE POLICY "Superadmin can update stores"
  ON stores
  FOR UPDATE
  USING (current_user_role() = 'superadmin')
  WITH CHECK (current_user_role() = 'superadmin');

-- Ensure RLS is enabled
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- Test the policy
SELECT 'Testing store access policy' as test;
SELECT id, name, business_type FROM stores LIMIT 5;

-- Verify policies
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'stores';
