-- ============================================================
-- VYRO POS — ADD SUBSCRIPTION FEATURES TO EXISTING DATABASE
-- Run this instead of schema.sql if tables already exist
-- ============================================================

-- Step 1: Add subscription columns to existing stores table
ALTER TABLE public.stores 
  ADD COLUMN IF NOT EXISTS subscription_plan text DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cashier_limit integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

-- Step 2: Update existing stores with trial subscription
UPDATE public.stores
SET 
  subscription_plan = 'trial',
  subscription_status = 'active',
  cashier_limit = 3,
  trial_ends_at = now() + interval '30 days',  -- Give existing stores 30 days instead of 7
  subscription_starts_at = now(),
  subscription_ends_at = now() + interval '30 days'
WHERE subscription_plan IS NULL;

-- Step 3: Create subscription_payments table
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

-- Step 4: Enable RLS on subscription_payments
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Step 5: Add RLS policies for subscription_payments
CREATE POLICY "payments_select" ON public.subscription_payments FOR SELECT
  USING (store_id = current_store_id() OR current_user_role() = 'superadmin');

CREATE POLICY "payments_insert" ON public.subscription_payments FOR INSERT
  WITH CHECK (current_user_role() = 'superadmin');

-- Step 6: Drop old pos_login function (if exists)
DROP FUNCTION IF EXISTS public.pos_login(text);

-- Step 7: Create new pos_login function with subscription fields
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

-- Step 8: Create subscription management functions
CREATE OR REPLACE FUNCTION public.check_cashier_limit(p_store_id uuid)
RETURNS boolean AS $$
DECLARE
  v_cashier_count integer;
  v_limit integer;
BEGIN
  SELECT count(*) INTO v_cashier_count
  FROM public.pos_users
  WHERE store_id = p_store_id 
    AND role = 'cashier' 
    AND active = true;
  
  SELECT cashier_limit INTO v_limit
  FROM public.stores
  WHERE id = p_store_id;
  
  RETURN v_cashier_count < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_subscription(
  p_store_id uuid,
  p_plan text,
  p_amount numeric,
  p_payment_method text,
  p_mpesa_code text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_cashier_limit integer;
  v_current_ends_at timestamptz;
BEGIN
  SELECT subscription_ends_at INTO v_current_ends_at
  FROM public.stores
  WHERE id = p_store_id;
  
  IF v_current_ends_at IS NOT NULL AND v_current_ends_at > now() THEN
    v_starts_at := v_current_ends_at;
  ELSE
    v_starts_at := now();
  END IF;
  
  CASE p_plan
    WHEN 'trial' THEN
      v_ends_at := now() + interval '7 days';
      v_cashier_limit := 3;
    WHEN 'monthly_basic' THEN
      v_ends_at := v_starts_at + interval '1 month';
      v_cashier_limit := 3;
    WHEN 'monthly_premium' THEN
      v_ends_at := v_starts_at + interval '1 month';
      v_cashier_limit := 5;
    WHEN 'yearly_basic' THEN
      v_ends_at := v_starts_at + interval '1 year';
      v_cashier_limit := 3;
    WHEN 'yearly_premium' THEN
      v_ends_at := v_starts_at + interval '1 year';
      v_cashier_limit := 5;
    ELSE
      RAISE EXCEPTION 'Invalid plan: %', p_plan;
  END CASE;
  
  UPDATE public.stores
  SET subscription_plan = p_plan,
      subscription_status = 'active',
      cashier_limit = v_cashier_limit,
      subscription_starts_at = v_starts_at,
      subscription_ends_at = v_ends_at,
      status = 'active'
  WHERE id = p_store_id;
  
  INSERT INTO public.subscription_payments (
    store_id, plan, amount, payment_method, mpesa_code, 
    starts_at, ends_at, status
  ) VALUES (
    p_store_id, p_plan, p_amount, p_payment_method, p_mpesa_code,
    v_starts_at, v_ends_at, 'completed'
  );
  
  RETURN json_build_object(
    'success', true,
    'starts_at', v_starts_at,
    'ends_at', v_ends_at,
    'cashier_limit', v_cashier_limit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_expired_subscriptions()
RETURNS void AS $$
BEGIN
  UPDATE public.stores
  SET subscription_status = 'expired',
      status = 'suspended'
  WHERE subscription_ends_at < now()
    AND subscription_status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_subscription_stats()
RETURNS json AS $$
DECLARE
  v_stats json;
BEGIN
  SELECT json_build_object(
    'total_stores', count(*),
    'active_subscriptions', count(*) FILTER (WHERE subscription_status = 'active'),
    'expired_subscriptions', count(*) FILTER (WHERE subscription_status = 'expired'),
    'trial_stores', count(*) FILTER (WHERE subscription_plan = 'trial'),
    'monthly_revenue', coalesce(sum(
      CASE 
        WHEN subscription_plan IN ('monthly_basic', 'monthly_premium') 
             AND subscription_status = 'active'
        THEN 
          CASE subscription_plan
            WHEN 'monthly_basic' THEN 850
            WHEN 'monthly_premium' THEN 1500
            ELSE 0
          END
        ELSE 0
      END
    ), 0),
    'yearly_revenue_potential', coalesce(sum(
      CASE 
        WHEN subscription_plan IN ('yearly_basic', 'yearly_premium') 
             AND subscription_status = 'active'
        THEN 
          CASE subscription_plan
            WHEN 'yearly_basic' THEN 8500
            WHEN 'yearly_premium' THEN 15000
            ELSE 0
          END
        ELSE 0
      END
    ), 0)
  ) INTO v_stats
  FROM public.stores
  WHERE status != 'suspended';
  
  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_subscription_plans()
RETURNS json AS $$
BEGIN
  RETURN json_build_object(
    'plans', json_build_array(
      json_build_object(
        'id', 'trial',
        'name', '1 Week Free Trial',
        'price', 0,
        'duration', '7 days',
        'cashier_limit', 3,
        'features', json_build_array('Up to 3 cashiers', 'Full POS features', 'Sales reporting', 'Inventory management')
      ),
      json_build_object(
        'id', 'monthly_basic',
        'name', 'Monthly Basic',
        'price', 850,
        'duration', '1 month',
        'cashier_limit', 3,
        'features', json_build_array('Up to 3 cashiers', 'Full POS features', 'Sales reporting', 'Inventory management', 'Customer loyalty', 'Email support')
      ),
      json_build_object(
        'id', 'monthly_premium',
        'name', 'Monthly Premium',
        'price', 1500,
        'duration', '1 month',
        'cashier_limit', 5,
        'features', json_build_array('Up to 5 cashiers', 'Full POS features', 'Sales reporting', 'Inventory management', 'Customer loyalty', 'Priority support', 'Advanced analytics')
      ),
      json_build_object(
        'id', 'yearly_basic',
        'name', 'Yearly Basic',
        'price', 8500,
        'duration', '12 months',
        'cashier_limit', 3,
        'savings', '2 months free',
        'features', json_build_array('Up to 3 cashiers', 'Full POS features', 'Sales reporting', 'Inventory management', 'Customer loyalty', 'Email support', 'Save KSh 1,700/year')
      ),
      json_build_object(
        'id', 'yearly_premium',
        'name', 'Yearly Premium',
        'price', 15000,
        'duration', '12 months',
        'cashier_limit', 5,
        'savings', '3 months free',
        'features', json_build_array('Up to 5 cashiers', 'Full POS features', 'Sales reporting', 'Inventory management', 'Customer loyalty', 'Priority support', 'Advanced analytics', 'Save KSh 3,000/year')
      )
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Step 9: Create trigger for auto-trial on new stores
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

DROP TRIGGER IF EXISTS trigger_activate_trial ON public.stores;
CREATE TRIGGER trigger_activate_trial
  BEFORE INSERT ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_trial_subscription();

-- ============================================================
-- SUCCESS! Your database now has subscription features.
-- Next: Run admin_functions.sql for additional admin features.
-- ============================================================
