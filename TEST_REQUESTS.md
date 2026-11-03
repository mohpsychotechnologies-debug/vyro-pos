# Testing Subscription Requests - Step by Step

## Before You Start

1. Make sure your dev server is running: `npm run dev`
2. Open browser console (F12) to see debug logs
3. Have Supabase SQL Editor open in another tab

## Step 1: Run SQL Migration

**In Supabase SQL Editor**, run this complete script:

```sql
-- ============================================================
-- SUBSCRIPTION REQUESTS TABLE
-- ============================================================

-- Create table
create table if not exists public.subscription_requests (
  id              uuid primary key default uuid_generate_v4(),
  business_name   text not null,
  owner_name      text not null,
  phone           text not null,
  email           text,
  address         text,
  plan            text not null,
  status          text default 'pending',
  notes           text,
  admin_notes     text,
  approved_by     uuid references public.pos_users(id),
  approved_at     timestamptz,
  store_id        uuid references public.stores(id),
  created_at      timestamptz default now()
);

-- Enable RLS
alter table public.subscription_requests enable row level security;

-- Drop any existing policies
drop policy if exists "Anyone can submit subscription request" on public.subscription_requests;
drop policy if exists "Superadmin can view all requests" on public.subscription_requests;
drop policy if exists "Anyone can view subscription requests" on public.subscription_requests;
drop policy if exists "Superadmin can update requests" on public.subscription_requests;

-- Create new policies
create policy "Anyone can insert requests"
  on public.subscription_requests
  for insert
  with check (true);

create policy "Anyone can view requests"
  on public.subscription_requests
  for select
  using (true);

create policy "Anyone can update requests"
  on public.subscription_requests
  for update
  using (true);

-- Indexes
create index if not exists idx_subscription_requests_status on public.subscription_requests(status);
create index if not exists idx_subscription_requests_created on public.subscription_requests(created_at desc);

-- Test: Insert sample data
INSERT INTO public.subscription_requests 
  (business_name, owner_name, phone, email, plan, notes)
VALUES 
  ('Sample Shop', 'John Doe', '0712345678', 'john@example.com', 'trial', 'This is a test request'),
  ('Another Store', 'Jane Smith', '0722334455', null, 'monthly_basic', null)
RETURNING *;

-- Verify data exists
SELECT id, business_name, owner_name, plan, status, created_at 
FROM public.subscription_requests 
ORDER BY created_at DESC;
```

**Expected output:** You should see 2 rows inserted.

## Step 2: Test Form Submission

1. **Go to:** http://localhost:5173
2. **You should see:** Landing page with logo, nav, hero section
3. **Click:** "Start free trial" button (in hero section)
4. **A modal should appear** with form fields

5. **Fill in the form:**
   - Business Name: `Test Store`
   - Owner Name: `Test Owner`
   - Phone: `0712345678`
   - Email: (optional)
   - Address: (optional)
   - Notes: `Testing subscription request`

6. **Click:** "Submit Request →"

7. **Check browser console** - You should see:
   ```
   📝 Submitting subscription request: { business_name: "Test Store", plan: "trial" }
   ✅ Request submitted successfully
   ```

8. **You should see:** Success modal with green checkmark

## Step 3: Verify in Database

**In Supabase SQL Editor**, run:
```sql
SELECT * FROM public.subscription_requests 
WHERE business_name = 'Test Store';
```

**Expected:** You should see your test request.

## Step 4: Check Admin Dashboard

1. **Logout** if logged in
2. **Click:** Login → (from landing page nav)
3. **Enter PIN:** `0000` (your super admin PIN)
4. **Click:** "Requests" tab in sidebar

5. **Check browser console** - You should see:
   ```
   ✅ Fetched subscription requests: 3
   ```
   (2 sample + 1 your test = 3 total)

6. **You should see:** 
   - Table with 3 requests
   - "Pending (3)" badge on Requests tab
   - Your "Test Store" request
   - Approve/Reject buttons

## Step 5: Test Approval

1. **Click:** "✓ Approve" on your test request
2. **Confirm** the alert
3. **You should see:**
   - Success message with generated PIN
   - Request status changes to "Approved"
   - New store appears in "Stores" tab

4. **Copy the PIN** from the alert message

## Step 6: Test New Store Login

1. **Logout**
2. **Enter the generated PIN**
3. **You should see:** Manager dashboard for "Test Store"
4. **Success!** ✅

## Troubleshooting

### ❌ Form submission fails
**Console shows:** `relation "subscription_requests" does not exist`
**Fix:** Run Step 1 SQL migration again

### ❌ "Permission denied for table subscription_requests"
**Fix:** Run this in Supabase:
```sql
drop policy if exists "Anyone can view subscription requests" on public.subscription_requests;
create policy "Public read access"
  on public.subscription_requests
  for select
  using (true);
```

### ❌ Requests tab shows empty
**Console shows:** Error fetching requests
**Fix:** 
1. Check browser console for exact error
2. Verify SQL migration ran: `SELECT count(*) FROM public.subscription_requests;`
3. Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'subscription_requests';`

### ❌ Can't submit form - Supabase not configured
**Fix:** Check `.env` file has:
```
VITE_SUPABASE_URL=your_url_here
VITE_SUPABASE_ANON_KEY=your_key_here
```

## Success Checklist

- [  ] SQL migration ran without errors
- [ ] Sample data visible in database
- [ ] Form opens when clicking pricing buttons
- [ ] Form submits successfully
- [ ] Success message appears
- [ ] Request visible in database
- [ ] Requests tab shows count badge
- [ ] Table shows all requests
- [ ] Approve button works
- [ ] New store created
- [ ] Can login with generated PIN

## Need More Help?

Check the following files:
- `DEBUG_REQUESTS.md` - Detailed debugging guide
- Browser console - Look for red errors
- Supabase Logs - Check for RLS violations
- Network tab - Check API calls to Supabase
