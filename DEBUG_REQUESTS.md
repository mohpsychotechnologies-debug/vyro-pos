# Debugging Subscription Requests Not Showing

## Problem
Requests submitted from landing page aren't appearing in admin dashboard.

## Root Cause
RLS (Row Level Security) policy is blocking SELECT queries. The original policy checked for `auth.uid()` but:
- Public form submissions don't have `auth.uid()`
- Admin dashboard fetches might not have proper session context set

## Solution Options

### Option 1: Public Read Access (Recommended for Testing)
Run `supabase/FIX_REQUESTS_RLS.sql`:
```sql
-- Drop the restrictive policy
drop policy if exists "Superadmin can view all requests" on public.subscription_requests;

-- Allow anyone to read (still requires auth to UPDATE)
create policy "Anyone can view subscription requests"
  on public.subscription_requests
  for select
  using (true);
```

### Option 2: Check if Table Exists
Open Supabase → Table Editor → Check if `subscription_requests` table exists.

If not, run: `supabase/add_subscription_requests.sql`

### Option 3: Manual Test
Run this in Supabase SQL Editor:
```sql
-- Insert test request
INSERT INTO public.subscription_requests 
  (business_name, owner_name, phone, plan)
VALUES 
  ('Test Business', 'Test Owner', '0712345678', 'trial');

-- Check if data exists
SELECT * FROM public.subscription_requests;
```

If you see an error, the table doesn't exist or RLS is blocking.

## Debugging Steps

### 1. Check Browser Console (Landing Page)
When submitting form, you should see:
```
📝 Submitting subscription request: {...}
✅ Request submitted successfully
```

If you see an error, note the message.

### 2. Check Browser Console (Admin Dashboard)
When loading Requests tab, you should see:
```
✅ Fetched subscription requests: N
```

If you see an error like "permission denied" or "relation does not exist":
- **Permission denied** → RLS policy issue (run FIX_REQUESTS_RLS.sql)
- **Relation does not exist** → Table not created (run add_subscription_requests.sql)

### 3. Check Supabase Logs
Supabase Dashboard → Logs → Check for:
- INSERT errors from public submissions
- SELECT errors from admin fetches
- RLS policy violations

### 4. Verify Table & Policies
```sql
-- Check table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'subscription_requests'
);

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'subscription_requests';

-- Check policies
SELECT * FROM pg_policies 
WHERE tablename = 'subscription_requests';
```

## Quick Fix Workflow

1. **Run the SQL migration:**
   ```sql
   -- In Supabase SQL Editor, run:
   supabase/add_subscription_requests.sql
   ```

2. **If still not working, run the fix:**
   ```sql
   supabase/FIX_REQUESTS_RLS.sql
   ```

3. **Test form submission:**
   - Go to landing page
   - Click "Start free trial"
   - Fill form and submit
   - Check browser console for success message

4. **Test admin fetch:**
   - Login as admin
   - Go to "Requests" tab
   - Check browser console
   - Should see requests count

5. **If still failing:**
   - Check Supabase logs
   - Verify environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
   - Hard refresh browser (Ctrl+Shift+R)
   - Rebuild app: `npm run build`

## Expected Behavior

### Successful Form Submission:
```
Console:
📝 Submitting subscription request: { business_name: "...", plan: "trial" }
✅ Request submitted successfully

UI:
- Success modal with checkmark
- "Request Submitted!" message
```

### Successful Admin Fetch:
```
Console:
✅ Fetched subscription requests: 1

UI:
- "Requests (1)" in sidebar
- Table showing the request
- Approve/Reject buttons visible
```

## Still Not Working?

Contact support with:
1. Browser console screenshots (from both landing page and admin)
2. Supabase error logs
3. Result of running: `SELECT * FROM public.subscription_requests;`
