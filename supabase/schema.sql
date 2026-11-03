-- ============================================================
-- VYRO POS — Multi-tenant Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Stores (one per manager/tenant) ────────────────────────
create table public.stores (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  address       text,
  phone         text,
  currency      text default 'KSh',
  tax_rate      numeric default 16,
  loyalty_rate  numeric default 1,
  loyalty_redeem numeric default 1000,
  status        text default 'active', -- 'active' | 'suspended' | 'expired'
  -- Subscription fields
  subscription_plan     text default 'trial',  -- 'trial' | 'monthly_basic' | 'monthly_premium' | 'yearly_basic' | 'yearly_premium'
  subscription_status   text default 'active', -- 'active' | 'expired' | 'cancelled'
  cashier_limit         integer default 3,      -- 3 for basic plans, 5 for premium plans
  trial_ends_at         timestamptz,
  subscription_starts_at timestamptz,
  subscription_ends_at  timestamptz,
  created_at    timestamptz default now()
);

-- ── Users ───────────────────────────────────────────────────
create table public.pos_users (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  name          text not null,
  pin           text not null,                -- 4-digit PIN (store hashed in prod)
  role          text not null default 'cashier', -- 'superadmin' | 'manager' | 'cashier'
  active        boolean default true,
  last_login    timestamptz,
  created_at    timestamptz default now()
);

-- ── Products ────────────────────────────────────────────────
create table public.products (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  name          text not null,
  brand         text,
  category      text,
  price         numeric not null default 0,
  barcode       text,
  icon          text default '🏷️',
  stock         integer default 0,
  low_stock     integer default 5,
  created_at    timestamptz default now()
);

-- ── Categories ──────────────────────────────────────────────
create table public.categories (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  name          text not null,
  created_at    timestamptz default now(),
  unique(store_id, name)
);

-- ── Sales ───────────────────────────────────────────────────
create table public.sales (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  cashier_id    uuid references public.pos_users(id),
  cashier_name  text,
  customer_name text default 'Walk-in customer',
  customer_id   uuid,
  method        text default 'M-Pesa',
  subtotal      numeric default 0,
  discount      numeric default 0,
  tax           numeric default 0,
  total         numeric not null,
  items         jsonb,
  loyalty_earned integer default 0,
  sale_date     date default current_date,
  created_at    timestamptz default now()
);

-- ── Customers ───────────────────────────────────────────────
create table public.customers (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  name          text not null,
  phone         text,
  email         text,
  points        integer default 0,
  created_at    timestamptz default now()
);

-- ── Suppliers ───────────────────────────────────────────────
create table public.suppliers (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  name          text not null,
  company       text,
  phone         text,
  email         text,
  created_at    timestamptz default now()
);

-- ── Purchases ───────────────────────────────────────────────
create table public.purchases (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  supplier_name text,
  product_id    uuid references public.products(id),
  product_name  text,
  qty           integer default 0,
  cost          numeric default 0,
  note          text,
  purchase_date date default current_date,
  created_at    timestamptz default now()
);

-- ── Expenses ────────────────────────────────────────────────
create table public.expenses (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  category      text,
  note          text,
  amount        numeric default 0,
  expense_date  date default current_date,
  created_at    timestamptz default now()
);

-- ── Activity log (logins, actions) ──────────────────────────
create table public.activity_log (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade,
  user_id       uuid references public.pos_users(id),
  user_name     text,
  role          text,
  action        text,   -- 'login' | 'logout' | 'sale' | 'product_add' etc.
  detail        text,
  created_at    timestamptz default now()
);

-- ── Subscription payments ───────────────────────────────────
create table public.subscription_payments (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid references public.stores(id) on delete cascade not null,
  plan          text not null, -- 'trial' | 'monthly_basic' | 'monthly_premium' | 'yearly_basic' | 'yearly_premium'
  amount        numeric not null default 0,
  payment_method text,         -- 'M-Pesa' | 'Cash' | 'Card' | 'Free Trial'
  mpesa_code    text,          -- M-Pesa transaction code
  status        text default 'completed', -- 'completed' | 'pending' | 'failed'
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  created_at    timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.stores       enable row level security;
alter table public.pos_users    enable row level security;
alter table public.products     enable row level security;
alter table public.categories   enable row level security;
alter table public.sales        enable row level security;
alter table public.customers    enable row level security;
alter table public.suppliers    enable row level security;
alter table public.purchases    enable row level security;
alter table public.expenses     enable row level security;
alter table public.activity_log enable row level security;
alter table public.subscription_payments enable row level security;

-- ── RLS helper: get current store from session claim ────────
-- We pass store_id as a JWT claim via the app, not Supabase Auth.
-- For simplicity we use a Postgres function seeded by the app session.
-- The app sets app.current_store and app.current_role via set_config.

create or replace function public.current_store_id() returns uuid as $$
  select nullif(current_setting('app.current_store', true), '')::uuid;
$$ language sql stable;

create or replace function public.current_user_role() returns text as $$
  select nullif(current_setting('app.current_role', true), '');
$$ language sql stable;

-- Called by the app after login to set RLS context for the session
create or replace function public.set_session_context(store text, role text)
returns void as $$
begin
  perform set_config('app.current_store', store, false);
  perform set_config('app.current_role',  role,  false);
end;
$$ language plpgsql security definer;

-- ── Policies: superadmin sees everything ────────────────────
-- For anon/service role we rely on the service_role key from the backend.
-- App uses anon key with RLS. Superadmin bypasses via service_role.

-- stores: managers see only their own store
create policy "store_select" on public.stores for select
  using (id = current_store_id() or current_user_role() = 'superadmin');

create policy "store_update" on public.stores for update
  using (id = current_store_id() or current_user_role() = 'superadmin');

-- pos_users: managers see users in their store; superadmin sees all
create policy "users_select" on public.pos_users for select
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

create policy "users_insert" on public.pos_users for insert
  with check (store_id = current_store_id() or current_user_role() = 'superadmin');

create policy "users_update" on public.pos_users for update
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

create policy "users_delete" on public.pos_users for delete
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- products
create policy "products_all" on public.products for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- categories
create policy "categories_all" on public.categories for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- sales
create policy "sales_all" on public.sales for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- customers
create policy "customers_all" on public.customers for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- suppliers
create policy "suppliers_all" on public.suppliers for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- purchases
create policy "purchases_all" on public.purchases for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- expenses
create policy "expenses_all" on public.expenses for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- activity_log
create policy "log_all" on public.activity_log for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- subscription_payments: managers can see their own, superadmin sees all
create policy "payments_select" on public.subscription_payments for select
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

create policy "payments_insert" on public.subscription_payments for insert
  with check (current_user_role() = 'superadmin');

-- ============================================================
-- SECURE LOGIN FUNCTION (bypasses RLS for authentication)
-- ============================================================
create or replace function public.pos_login(user_pin text)
returns table (
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
) as $$
begin
  return query
    select
      u.id, u.store_id, u.name, u.role, u.active, u.last_login,
      s.name, s.address, s.phone, s.currency, s.tax_rate,
      s.loyalty_rate, s.loyalty_redeem, s.status,
      s.subscription_plan, s.subscription_status, s.subscription_ends_at,
      s.cashier_limit,
      case 
        when s.subscription_ends_at is null then null
        else extract(day from s.subscription_ends_at - now())::integer
      end as days_remaining
    from public.pos_users u
    left join public.stores s on s.id = u.store_id
    where u.pin = user_pin
    limit 1;
end;
$$ language plpgsql security definer;

-- ============================================================
-- SUBSCRIPTION MANAGEMENT FUNCTIONS
-- ============================================================

-- Check if store has exceeded cashier limit
create or replace function public.check_cashier_limit(p_store_id uuid)
returns boolean as $$
declare
  v_cashier_count integer;
  v_limit integer;
begin
  -- Get current cashier count (exclude managers)
  select count(*) into v_cashier_count
  from public.pos_users
  where store_id = p_store_id 
    and role = 'cashier' 
    and active = true;
  
  -- Get limit from store
  select cashier_limit into v_limit
  from public.stores
  where id = p_store_id;
  
  return v_cashier_count < v_limit;
end;
$$ language plpgsql security definer;

-- Update subscription when payment received
create or replace function public.update_subscription(
  p_store_id uuid,
  p_plan text,
  p_amount numeric,
  p_payment_method text,
  p_mpesa_code text default null
)
returns json as $$
declare
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_cashier_limit integer;
  v_current_ends_at timestamptz;
begin
  -- Get current subscription end date
  select subscription_ends_at into v_current_ends_at
  from public.stores
  where id = p_store_id;
  
  -- If there's an active subscription, extend from that date, otherwise from now
  if v_current_ends_at is not null and v_current_ends_at > now() then
    v_starts_at := v_current_ends_at;
  else
    v_starts_at := now();
  end if;
  
  -- Calculate end date and cashier limit based on plan
  case p_plan
    when 'trial' then
      v_ends_at := now() + interval '7 days';
      v_cashier_limit := 3;
    when 'monthly_basic' then
      v_ends_at := v_starts_at + interval '1 month';
      v_cashier_limit := 3;
    when 'monthly_premium' then
      v_ends_at := v_starts_at + interval '1 month';
      v_cashier_limit := 5;
    when 'yearly_basic' then
      v_ends_at := v_starts_at + interval '1 year';
      v_cashier_limit := 3;
    when 'yearly_premium' then
      v_ends_at := v_starts_at + interval '1 year';
      v_cashier_limit := 5;
    else
      raise exception 'Invalid plan: %', p_plan;
  end case;
  
  -- Update store subscription
  update public.stores
  set subscription_plan = p_plan,
      subscription_status = 'active',
      cashier_limit = v_cashier_limit,
      subscription_starts_at = v_starts_at,
      subscription_ends_at = v_ends_at,
      status = 'active'
  where id = p_store_id;
  
  -- Record payment
  insert into public.subscription_payments (
    store_id, plan, amount, payment_method, mpesa_code, 
    starts_at, ends_at, status
  ) values (
    p_store_id, p_plan, p_amount, p_payment_method, p_mpesa_code,
    v_starts_at, v_ends_at, 'completed'
  );
  
  return json_build_object(
    'success', true,
    'starts_at', v_starts_at,
    'ends_at', v_ends_at,
    'cashier_limit', v_cashier_limit
  );
end;
$$ language plpgsql security definer;

-- Check and mark expired subscriptions (run daily via cron or trigger)
create or replace function public.check_expired_subscriptions()
returns void as $$
begin
  update public.stores
  set subscription_status = 'expired',
      status = 'suspended'
  where subscription_ends_at < now()
    and subscription_status = 'active';
end;
$$ language plpgsql security definer;

-- Get subscription stats for admin dashboard
create or replace function public.get_subscription_stats()
returns json as $$
declare
  v_stats json;
begin
  select json_build_object(
    'total_stores', count(*),
    'active_subscriptions', count(*) filter (where subscription_status = 'active'),
    'expired_subscriptions', count(*) filter (where subscription_status = 'expired'),
    'trial_stores', count(*) filter (where subscription_plan = 'trial'),
    'monthly_revenue', coalesce(sum(
      case 
        when subscription_plan in ('monthly_basic', 'monthly_premium') 
             and subscription_status = 'active'
        then 
          case subscription_plan
            when 'monthly_basic' then 850
            when 'monthly_premium' then 1500
            else 0
          end
        else 0
      end
    ), 0),
    'yearly_revenue_potential', coalesce(sum(
      case 
        when subscription_plan in ('yearly_basic', 'yearly_premium') 
             and subscription_status = 'active'
        then 
          case subscription_plan
            when 'yearly_basic' then 8500
            when 'yearly_premium' then 15000
            else 0
          end
        else 0
      end
    ), 0)
  ) into v_stats
  from public.stores
  where status != 'suspended';
  
  return v_stats;
end;
$$ language plpgsql security definer;

-- ============================================================
-- SEED SUPERADMIN
-- ============================================================
-- This creates YOU as the platform superadmin (no store_id).
-- Change the PIN before deploying!
insert into public.pos_users (id, store_id, name, pin, role, active)
values (uuid_generate_v4(), null, 'Super Admin', '9999', 'superadmin', true)
on conflict do nothing;

-- ============================================================
-- TRIGGER: Auto-activate trial when store is created
-- ============================================================
create or replace function public.activate_trial_subscription()
returns trigger as $$
begin
  -- Set trial subscription defaults
  NEW.subscription_plan := 'trial';
  NEW.subscription_status := 'active';
  NEW.cashier_limit := 3;
  NEW.trial_ends_at := now() + interval '7 days';
  NEW.subscription_starts_at := now();
  NEW.subscription_ends_at := now() + interval '7 days';
  NEW.status := 'active';
  
  return NEW;
end;
$$ language plpgsql;

create trigger trigger_activate_trial
  before insert on public.stores
  for each row
  execute function public.activate_trial_subscription();
