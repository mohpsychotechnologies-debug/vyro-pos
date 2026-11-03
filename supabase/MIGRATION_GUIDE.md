# Subscription System Migration Guide

## For Existing Vyro POS Installations

If you already have Vyro POS deployed with the old schema, follow these steps to add subscription functionality:

## Step 1: Backup Your Data

```sql
-- Create backup of your existing data
CREATE TABLE stores_backup AS SELECT * FROM stores;
CREATE TABLE pos_users_backup AS SELECT * FROM pos_users;
CREATE TABLE products_backup AS SELECT * FROM products;
-- ... backup other tables as needed
```

## Step 2: Add Subscription Columns to `stores` Table

```sql
-- Add new subscription columns
ALTER TABLE public.stores 
  ADD COLUMN IF NOT EXISTS subscription_plan text DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cashier_limit integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

-- Update status column to allow 'expired' value
COMMENT ON COLUMN public.stores.status IS 'active | suspended | expired';

-- Initialize existing stores with trial subscriptions
UPDATE public.stores
SET 
  subscription_plan = 'trial',
  subscription_status = 'active',
  cashier_limit = 3,
  trial_ends_at = now() + interval '7 days',
  subscription_starts_at = now(),
  subscription_ends_at = now() + interval '7 days'
WHERE subscription_plan IS NULL;
```

## Step 3: Create `subscription_payments` Table

```sql
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade not null,
  plan          text not null,
  amount        numeric not null default 0,
  payment_method text,
  mpesa_code    text,
  status        text default 'completed',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  created_at    timestamptz default now()
);

-- Enable RLS
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "payments_select" ON public.subscription_payments FOR SELECT
  USING (store_id = current_store_id() OR current_user_role() = 'superadmin');

CREATE POLICY "payments_insert" ON public.subscription_payments FOR INSERT
  WITH CHECK (current_user_role() = 'superadmin');
```

## Step 4: Update `pos_login` Function

```sql
-- Drop old version
DROP FUNCTION IF EXISTS public.pos_login(text);

-- Create new version with subscription fields
CREATE OR REPLACE FUNCTION public.pos_login(user_pin text)
RETURNS TABLE (
  id          uuid,
  store_id    uuid,
  name        text,
  role        text,
  active      boolean,
  last_login  timestamptz,
  store_name  text,
  store_address text,
  store_phone text,
  store_currency text,
  store_tax_rate numeric,
  store_loyalty_rate numeric,
  store_loyalty_redeem numeric,
  store_status text,
  subscription_plan text,
  subscription_status text,
  subscription_ends_at timestamptz,
  cashier_limit integer,
  days_remaining integer
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      u.id, u.store_id, u.name, u.role, u.active, u.last_login,
      s.name, s.address, s.phone, s.currency, s.tax_rate,
      s.loyalty_rate, s.loyalty_redeem, s.status,
      s.subscription_plan, s.subscription_status, s.subscription_ends_at,
      s.cashier_limit,
      CASE 
        WHEN s.subscription_ends_at IS NULL THEN NULL
        ELSE EXTRACT(day FROM s.subscription_ends_at - now())::integer
      END as days_remaining
    FROM public.pos_users u
    LEFT JOIN public.stores s ON s.id = u.store_id
    WHERE u.pin = user_pin
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Step 5: Add Subscription Management Functions

```sql
-- Run the entire contents of supabase/admin_functions.sql
-- (Copy and paste the full file into SQL Editor)
```

## Step 6: Add Trigger for Auto-Trial

```sql
-- Function to activate trial on new stores
CREATE OR REPLACE FUNCTION public.activate_trial_subscription()
RETURNS TRIGGER AS $$
BEGIN
  NEW.subscription_plan := 'trial';
  NEW.subscription_status := 'active';
  NEW.cashier_limit := 3;
  NEW.trial_ends_at := now() + interval '7 days';
  NEW.subscription_starts_at := now();
  NEW.subscription_ends_at := now() + interval '7 days';
  NEW.status := 'active';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_activate_trial ON public.stores;
CREATE TRIGGER trigger_activate_trial
  BEFORE INSERT ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_trial_subscription();
```

## Step 7: Update Frontend Code

### A. Update `src/supabase.js`

Add the subscription functions (see the artifact or copy from updated supabase.js)

### B. Update `src/main.jsx`

1. Add subscription state to SuperAdminApp:
```javascript
const [subscriptionStats, setSubscriptionStats] = useState({});
const [allPayments, setAllPayments] = useState([]);
const [subscriptionPlans, setSubscriptionPlans] = useState([]);
```

2. Load subscription data in the `load()` function:
```javascript
const load = async () => {
  setLoading(true);
  const [s, u, l, sa, stats, payments, plans] = await Promise.all([
    fetchAllStores(), 
    fetchAllUsers(), 
    fetchActivityLog(), 
    fetchAllSales(),
    getSubscriptionStats(),
    getAllPayments(),
    getSubscriptionPlans(),
  ]);
  setStores(s);
  setAllUsers(u);
  setActLog(l);
  setAllSales(sa);
  setSubscriptionStats(stats);
  setAllPayments(payments);
  setSubscriptionPlans(plans);
  setLoading(false);
};
```

3. Add "Subscriptions" tab:
```javascript
const tabs = [
  ['stores',  '🏪', 'Stores'],
  ['users',   '👥', 'Users'],
  ['subscriptions', '💳', 'Subscriptions'], // NEW
  ['activity','📋', 'Activity log'],
  ['revenue', '📊', 'Revenue'],
];
```

4. Add subscription management modal and handlers (see artifact for complete components)

### C. Add Cashier Limit Check

In your Settings page or wherever managers add cashiers:

```javascript
const handleAddCashier = async (cashierData) => {
  // Check if at limit
  const canAdd = await checkCashierLimit(storeId);
  if (!canAdd) {
    notify('Cashier limit reached. Please upgrade your subscription plan to add more cashiers.');
    return;
  }
  
  // Proceed with normal cashier creation
  await createUser({
    store_id: storeId,
    name: cashierData.name,
    pin: cashierData.pin,
    role: 'cashier',
  });
  
  notify('Cashier added successfully');
};
```

## Step 8: Test the Migration

1. **Verify existing stores have subscription data:**
```sql
SELECT 
  name, 
  subscription_plan, 
  subscription_status, 
  cashier_limit,
  subscription_ends_at 
FROM stores;
```

2. **Test login with existing user** - should now include subscription fields

3. **Test creating a new store** - should auto-activate trial

4. **Test payment processing:**
   - Super Admin → Subscriptions tab
   - Manage a store
   - Select Monthly Basic plan
   - Process test payment
   - Verify subscription_ends_at updated

5. **Test cashier limit enforcement:**
   - Store with 3 cashiers on Basic plan
   - Try to add 4th cashier → Should block
   - Upgrade to Premium → Should work

## Step 9: Set Up Scheduled Job (Optional)

To automatically check and expire subscriptions daily:

```sql
-- Create a scheduled job using pg_cron extension (if available in your Supabase project)
-- Or set up a GitHub Action / external cron job to call:

SELECT check_expired_subscriptions();
```

If using external cron:
1. Create API endpoint that calls `checkExpiredSubscriptions()`
2. Schedule daily cron job (e.g., via GitHub Actions)
3. Example GitHub Action (`.github/workflows/check-subscriptions.yml`):

```yaml
name: Check Expired Subscriptions
on:
  schedule:
    - cron: '0 2 * * *'  # Run at 2 AM daily
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: |
          curl -X POST https://your-app.com/api/check-subscriptions \
            -H "Authorization: Bearer ${{ secrets.ADMIN_KEY }}"
```

## Rollback Plan

If something goes wrong, you can roll back:

```sql
-- Restore from backup
DROP TABLE IF EXISTS stores CASCADE;
CREATE TABLE stores AS SELECT * FROM stores_backup;

-- Drop new table
DROP TABLE IF EXISTS subscription_payments CASCADE;

-- Restore old pos_login function
-- (Re-run your original schema.sql)
```

## Migration Checklist

- [ ] Backup all data
- [ ] Add subscription columns to stores table
- [ ] Create subscription_payments table
- [ ] Update pos_login function
- [ ] Add all subscription management functions
- [ ] Add auto-trial trigger
- [ ] Update frontend supabase.js
- [ ] Update frontend main.jsx
- [ ] Add cashier limit enforcement
- [ ] Test existing store logins
- [ ] Test new store creation
- [ ] Test payment processing
- [ ] Test cashier limit enforcement
- [ ] Set up daily expiration check
- [ ] Update documentation for users

## Support

If you encounter issues during migration:
1. Check Supabase SQL Editor logs for errors
2. Verify all functions exist: `\df public.*subscription*`
3. Verify triggers exist: `SELECT * FROM pg_trigger WHERE tgname LIKE '%trial%';`
4. Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'subscription_payments';`

For questions, refer to the main Implementation Guide artifact.
