-- ============================================================
-- VYRO POS — Payment Approval System
-- Managers request renewals, Super Admin approves
-- ============================================================

-- Step 1: Add payment configuration table
CREATE TABLE IF NOT EXISTS public.payment_config (
  id            uuid primary key default uuid_generate_v4(),
  mpesa_type    text default 'paybill', -- 'paybill' | 'till'
  mpesa_number  text not null,           -- Paybill/Till number
  account_number text,                   -- Account number (for paybill)
  business_name text,
  instructions  text,
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Only one config row ever needed (no unique index required)
DROP INDEX IF EXISTS public.payment_config_active_idx;

-- Enable RLS
ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

-- Everyone can view payment config (needed for managers)
DROP POLICY IF EXISTS "payment_config_select" ON public.payment_config;
CREATE POLICY "payment_config_select" ON public.payment_config FOR SELECT
  USING (is_active = true);

-- Only superadmin can modify
DROP POLICY IF EXISTS "payment_config_modify" ON public.payment_config;
CREATE POLICY "payment_config_modify" ON public.payment_config FOR ALL
  USING (current_user_role() = 'superadmin');

-- Step 2: Add status field to subscription_payments
ALTER TABLE public.subscription_payments 
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

COMMENT ON COLUMN public.subscription_payments.status IS 'pending | approved | rejected';

ALTER TABLE public.subscription_payments 
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.pos_users(id),
  ADD COLUMN IF NOT EXISTS requested_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.pos_users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Step 3: Update RLS policies for subscription_payments
DROP POLICY IF EXISTS "payments_insert" ON public.subscription_payments;
DROP POLICY IF EXISTS "payments_select" ON public.subscription_payments;
DROP POLICY IF EXISTS "payments_update" ON public.subscription_payments;
DROP POLICY IF EXISTS "payments_insert_manager" ON public.subscription_payments;
DROP POLICY IF EXISTS "payments_select_manager" ON public.subscription_payments;

-- Managers can create payment requests for their own store
CREATE POLICY "payments_insert_manager" ON public.subscription_payments FOR INSERT
  WITH CHECK (
    store_id = current_store_id() 
    OR current_user_role() = 'superadmin'
  );

-- Managers can view their store's payment requests
CREATE POLICY "payments_select_manager" ON public.subscription_payments FOR SELECT
  USING (
    store_id = current_store_id() 
    OR current_user_role() = 'superadmin'
  );

-- Only superadmin can update (approve/reject)
CREATE POLICY "payments_update" ON public.subscription_payments FOR UPDATE
  USING (current_user_role() = 'superadmin');

-- Step 4: Function to request subscription renewal (for managers)
CREATE OR REPLACE FUNCTION public.request_subscription_renewal(
  p_store_id uuid,
  p_plan text,
  p_amount numeric,
  p_mpesa_code text,
  p_user_id uuid
)
RETURNS json AS $$
DECLARE
  v_payment_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_current_ends_at timestamptz;
  v_cashier_limit integer;
BEGIN
  -- Get current subscription end date
  SELECT subscription_ends_at INTO v_current_ends_at
  FROM public.stores
  WHERE id = p_store_id;
  
  -- Calculate start/end dates
  IF v_current_ends_at IS NOT NULL AND v_current_ends_at > now() THEN
    v_starts_at := v_current_ends_at;
  ELSE
    v_starts_at := now();
  END IF;
  
  -- Calculate end date based on plan
  CASE p_plan
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
  
  -- Create payment request (status = pending)
  INSERT INTO public.subscription_payments (
    store_id, plan, amount, payment_method, mpesa_code, 
    starts_at, ends_at, status, requested_by, requested_at
  ) VALUES (
    p_store_id, p_plan, p_amount, 'M-Pesa', p_mpesa_code,
    v_starts_at, v_ends_at, 'pending', p_user_id, now()
  )
  RETURNING id INTO v_payment_id;
  
  RETURN json_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'status', 'pending',
    'message', 'Payment request submitted. Awaiting admin approval.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Function to approve payment (for superadmin)
CREATE OR REPLACE FUNCTION public.approve_subscription_payment(
  p_payment_id uuid,
  p_approved_by uuid
)
RETURNS json AS $$
DECLARE
  v_store_id uuid;
  v_plan text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_cashier_limit integer;
BEGIN
  -- Get payment details
  SELECT store_id, plan, starts_at, ends_at 
  INTO v_store_id, v_plan, v_starts_at, v_ends_at
  FROM public.subscription_payments
  WHERE id = p_payment_id AND status = 'pending';
  
  IF v_store_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Payment not found or already processed'
    );
  END IF;
  
  -- Determine cashier limit
  v_cashier_limit := CASE 
    WHEN v_plan IN ('monthly_basic', 'yearly_basic') THEN 3
    WHEN v_plan IN ('monthly_premium', 'yearly_premium') THEN 5
    ELSE 3
  END;
  
  -- Update payment status
  UPDATE public.subscription_payments
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = now()
  WHERE id = p_payment_id;
  
  -- Update store subscription
  UPDATE public.stores
  SET subscription_plan = v_plan,
      subscription_status = 'active',
      cashier_limit = v_cashier_limit,
      subscription_starts_at = v_starts_at,
      subscription_ends_at = v_ends_at,
      status = 'active'
  WHERE id = v_store_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Payment approved and subscription activated'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Function to reject payment (for superadmin)
CREATE OR REPLACE FUNCTION public.reject_subscription_payment(
  p_payment_id uuid,
  p_approved_by uuid,
  p_reason text
)
RETURNS json AS $$
BEGIN
  UPDATE public.subscription_payments
  SET status = 'rejected',
      approved_by = p_approved_by,
      approved_at = now(),
      rejection_reason = p_reason
  WHERE id = p_payment_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Payment not found or already processed'
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Payment rejected'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Function to get pending payments (for superadmin)
CREATE OR REPLACE FUNCTION public.get_pending_payments()
RETURNS TABLE (
  id uuid,
  store_id uuid,
  store_name text,
  plan text,
  amount numeric,
  mpesa_code text,
  requested_by_name text,
  requested_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
    SELECT 
      sp.id,
      sp.store_id,
      s.name as store_name,
      sp.plan,
      sp.amount,
      sp.mpesa_code,
      u.name as requested_by_name,
      sp.requested_at,
      sp.starts_at,
      sp.ends_at
    FROM public.subscription_payments sp
    JOIN public.stores s ON s.id = sp.store_id
    LEFT JOIN public.pos_users u ON u.id = sp.requested_by
    WHERE sp.status = 'pending'
    ORDER BY sp.requested_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Function to get payment config
CREATE OR REPLACE FUNCTION public.get_payment_config()
RETURNS json AS $$
DECLARE
  v_config json;
BEGIN
  SELECT json_build_object(
    'id', id,
    'mpesa_type', mpesa_type,
    'mpesa_number', mpesa_number,
    'account_number', account_number,
    'business_name', business_name,
    'instructions', instructions
  ) INTO v_config
  FROM public.payment_config
  WHERE is_active = true
  LIMIT 1;
  
  RETURN v_config;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Function to update payment config (superadmin only)
CREATE OR REPLACE FUNCTION public.update_payment_config(
  p_mpesa_type text,
  p_mpesa_number text,
  p_account_number text DEFAULT NULL,
  p_business_name text DEFAULT NULL,
  p_instructions text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  -- Check if any config already exists
  SELECT id INTO v_existing_id
  FROM public.payment_config
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update the existing row in-place (no unique constraint issue)
    UPDATE public.payment_config
    SET mpesa_type     = p_mpesa_type,
        mpesa_number   = p_mpesa_number,
        account_number = p_account_number,
        business_name  = p_business_name,
        instructions   = p_instructions,
        is_active      = true,
        updated_at     = now()
    WHERE id = v_existing_id;
  ELSE
    -- First time: insert fresh row
    INSERT INTO public.payment_config (
      mpesa_type, mpesa_number, account_number, business_name, instructions, is_active
    ) VALUES (
      p_mpesa_type, p_mpesa_number, p_account_number, p_business_name, p_instructions, true
    );
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Update get_all_payments to include approval info
DROP FUNCTION IF EXISTS public.get_all_payments();
CREATE OR REPLACE FUNCTION public.get_all_payments()
RETURNS TABLE (
  id uuid,
  store_id uuid,
  store_name text,
  plan text,
  amount numeric,
  payment_method text,
  mpesa_code text,
  status text,
  requested_by_name text,
  requested_at timestamptz,
  approved_by_name text,
  approved_at timestamptz,
  rejection_reason text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
    SELECT 
      sp.id,
      sp.store_id,
      s.name as store_name,
      sp.plan,
      sp.amount,
      sp.payment_method,
      sp.mpesa_code,
      sp.status,
      u1.name as requested_by_name,
      sp.requested_at,
      u2.name as approved_by_name,
      sp.approved_at,
      sp.rejection_reason,
      sp.starts_at,
      sp.ends_at,
      sp.created_at
    FROM public.subscription_payments sp
    JOIN public.stores s ON s.id = sp.store_id
    LEFT JOIN public.pos_users u1 ON u1.id = sp.requested_by
    LEFT JOIN public.pos_users u2 ON u2.id = sp.approved_by
    ORDER BY sp.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SUCCESS! Payment approval system added.
-- Managers can request renewals, Admins approve them.
-- ============================================================
