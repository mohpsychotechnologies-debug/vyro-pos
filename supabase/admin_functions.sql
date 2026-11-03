-- ============================================================
-- VYRO POS — Admin & Subscription Functions
-- Additional helper functions for the admin panel
-- ============================================================

-- Get all stores with subscription details
create or replace function public.get_all_stores_with_subscriptions()
returns table (
  id uuid,
  name text,
  address text,
  phone text,
  currency text,
  status text,
  subscription_plan text,
  subscription_status text,
  subscription_ends_at timestamptz,
  cashier_limit integer,
  cashier_count bigint,
  days_remaining integer,
  manager_name text,
  manager_id uuid,
  created_at timestamptz
) as $$
begin
  return query
    select 
      s.id,
      s.name,
      s.address,
      s.phone,
      s.currency,
      s.status,
      s.subscription_plan,
      s.subscription_status,
      s.subscription_ends_at,
      s.cashier_limit,
      count(u.id) filter (where u.role = 'cashier' and u.active = true) as cashier_count,
      case 
        when s.subscription_ends_at is null then null
        else extract(day from s.subscription_ends_at - now())::integer
      end as days_remaining,
      m.name as manager_name,
      m.id as manager_id,
      s.created_at
    from public.stores s
    left join public.pos_users u on u.store_id = s.id
    left join public.pos_users m on m.store_id = s.id and m.role = 'manager' and m.active = true
    group by s.id, s.name, s.address, s.phone, s.currency, s.status, 
             s.subscription_plan, s.subscription_status, s.subscription_ends_at,
             s.cashier_limit, m.name, m.id, s.created_at
    order by s.created_at desc;
end;
$$ language plpgsql security definer;

-- Get subscription payment history for a store
create or replace function public.get_store_payment_history(p_store_id uuid)
returns table (
  id uuid,
  plan text,
  amount numeric,
  payment_method text,
  mpesa_code text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz
) as $$
begin
  return query
    select 
      sp.id,
      sp.plan,
      sp.amount,
      sp.payment_method,
      sp.mpesa_code,
      sp.status,
      sp.starts_at,
      sp.ends_at,
      sp.created_at
    from public.subscription_payments sp
    where sp.store_id = p_store_id
    order by sp.created_at desc;
end;
$$ language plpgsql security definer;

-- Get all payment transactions (for super admin)
create or replace function public.get_all_payments()
returns table (
  id uuid,
  store_id uuid,
  store_name text,
  plan text,
  amount numeric,
  payment_method text,
  mpesa_code text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz
) as $$
begin
  return query
    select 
      sp.id,
      sp.store_id,
      s.name as store_name,
      sp.plan,
      sp.amount,
      sp.payment_method,
      sp.mpesa_code,
      sp.status,
      sp.starts_at,
      sp.ends_at,
      sp.created_at
    from public.subscription_payments sp
    join public.stores s on s.id = sp.store_id
    order by sp.created_at desc;
end;
$$ language plpgsql security definer;

-- Upgrade/downgrade subscription plan
create or replace function public.change_subscription_plan(
  p_store_id uuid,
  p_new_plan text
)
returns json as $$
declare
  v_current_plan text;
  v_current_ends_at timestamptz;
  v_cashier_limit integer;
  v_cashier_count integer;
begin
  -- Get current subscription details
  select subscription_plan, subscription_ends_at into v_current_plan, v_current_ends_at
  from public.stores
  where id = p_store_id;
  
  -- Determine new cashier limit
  v_cashier_limit := case 
    when p_new_plan in ('trial', 'monthly_basic', 'yearly_basic') then 3
    when p_new_plan in ('monthly_premium', 'yearly_premium') then 5
    else 3
  end;
  
  -- Check current cashier count
  select count(*) into v_cashier_count
  from public.pos_users
  where store_id = p_store_id 
    and role = 'cashier' 
    and active = true;
  
  -- Prevent downgrade if it would exceed new limit
  if v_cashier_count > v_cashier_limit then
    return json_build_object(
      'success', false,
      'error', 'Cannot downgrade: store has ' || v_cashier_count || ' active cashiers but new plan allows only ' || v_cashier_limit
    );
  end if;
  
  -- Update plan (keeps same end date, changes limits)
  update public.stores
  set subscription_plan = p_new_plan,
      cashier_limit = v_cashier_limit
  where id = p_store_id;
  
  return json_build_object(
    'success', true,
    'new_plan', p_new_plan,
    'cashier_limit', v_cashier_limit
  );
end;
$$ language plpgsql security definer;

-- Cancel subscription (marks as cancelled but lets it run until expiry)
create or replace function public.cancel_subscription(p_store_id uuid)
returns json as $$
begin
  update public.stores
  set subscription_status = 'cancelled'
  where id = p_store_id;
  
  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- Reactivate cancelled subscription
create or replace function public.reactivate_subscription(p_store_id uuid)
returns json as $$
begin
  update public.stores
  set subscription_status = 'active',
      status = 'active'
  where id = p_store_id
    and subscription_ends_at > now();
  
  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- Get subscription plans with pricing
create or replace function public.get_subscription_plans()
returns json as $$
begin
  return json_build_object(
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
end;
$$ language plpgsql;
