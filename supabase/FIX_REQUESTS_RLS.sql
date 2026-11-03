-- ============================================================
-- FIX: Allow public viewing of subscription requests
-- Run this if requests aren't showing in admin dashboard
-- ============================================================

-- Drop the restrictive policy
drop policy if exists "Superadmin can view all requests" on public.subscription_requests;

-- Create a public read policy (RLS is still enabled, but allows reads)
create policy "Anyone can view subscription requests"
  on public.subscription_requests
  for select
  using (true);

-- Verify policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual 
from pg_policies 
where tablename = 'subscription_requests';
