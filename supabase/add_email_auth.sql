-- ============================================================
-- MIGRATE FROM PIN TO EMAIL + PASSWORD AUTH
-- Run this in Supabase SQL Editor
-- ============================================================

-- 0. Drop old functions that have conflicting signatures
drop function if exists public.pos_login(text);
drop function if exists public.admin_create_user(uuid, text, text, text);
drop function if exists public.admin_get_users_with_pins();
drop function if exists public.admin_reset_pin(uuid, text);
drop function if exists public.admin_reset_password(uuid, text);

-- 1. Add email and password_hash columns to pos_users
alter table public.pos_users
  add column if not exists email text,
  add column if not exists password_hash text;

-- 2. Add unique constraint on email (allow nulls for existing rows)
create unique index if not exists pos_users_email_unique
  on public.pos_users (email)
  where email is not null;

-- 3. Simple password hashing using pgcrypto (bcrypt)
create extension if not exists pgcrypto;

-- 4. Replace pos_login function with email+password version
create or replace function public.pos_login(p_email text, p_password text)
returns table (
  id                   uuid,
  store_id             uuid,
  name                 text,
  role                 text,
  active               boolean,
  last_login           timestamptz,
  store_name           text,
  store_address        text,
  store_phone          text,
  store_currency       text,
  store_tax_rate       numeric,
  store_loyalty_rate   numeric,
  store_loyalty_redeem numeric,
  store_status         text,
  subscription_plan    text,
  subscription_status  text,
  subscription_ends_at timestamptz,
  cashier_limit        integer,
  days_remaining       integer
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
    where
      lower(u.email) = lower(p_email)
      and u.password_hash is not null
      and crypt(p_password, u.password_hash) = u.password_hash
    limit 1;
end;
$$ language plpgsql security definer;

-- 5. Update admin_create_user to accept email + password
create or replace function public.admin_create_user(
  p_store_id uuid,
  p_name     text,
  p_email    text,
  p_password text,
  p_role     text default 'cashier'
)
returns uuid as $$
declare
  v_id uuid;
begin
  insert into public.pos_users (store_id, name, email, password_hash, pin, role, active)
  values (
    p_store_id,
    p_name,
    lower(p_email),
    crypt(p_password, gen_salt('bf', 10)),
    -- Keep pin column for backward compat (set to empty)
    '',
    p_role,
    true
  )
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer;

-- 6. Password reset function
create or replace function public.admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
returns void as $$
begin
  update public.pos_users
  set password_hash = crypt(p_new_password, gen_salt('bf', 10))
  where id = p_user_id;
end;
$$ language plpgsql security definer;

-- 7. Update admin_get_users_with_pins to return email instead
create or replace function public.admin_get_users_with_pins()
returns table (
  id          uuid,
  store_id    uuid,
  name        text,
  email       text,
  role        text,
  active      boolean,
  last_login  timestamptz,
  created_at  timestamptz,
  store_name  text,
  pin         text  -- kept for backward compat (returns empty string)
) as $$
begin
  return query
    select
      u.id, u.store_id, u.name,
      coalesce(u.email, ''),
      u.role, u.active, u.last_login, u.created_at,
      coalesce(s.name, 'Unassigned'),
      ''::text as pin
    from public.pos_users u
    left join public.stores s on s.id = u.store_id
    where u.role != 'superadmin'
    order by s.name, u.name;
end;
$$ language plpgsql security definer;

-- 8. Migrate existing superadmin — set a default email/password
-- IMPORTANT: Change these credentials after running!
update public.pos_users
set
  email         = 'admin@vyrosocial.com',
  password_hash = crypt('Hussein@4', gen_salt('bf', 10))
where role = 'superadmin'
  and (email is null or email = '');

-- 9. Verify migration
select id, name, email, role, active,
  case when password_hash is not null then '✓ has password' else '✗ no password' end as pw_status
from public.pos_users
order by role, name;

-- ============================================================
-- FIX: Delete user function (bypasses RLS via security definer)
-- ============================================================
create or replace function public.admin_delete_user(p_user_id uuid)
returns void as $$
begin
  delete from public.pos_users where id = p_user_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Update user email (security definer to bypass RLS)
-- ============================================================
create or replace function public.admin_update_user_email(
  p_user_id uuid,
  p_email   text
)
returns void as $$
begin
  update public.pos_users
  set email = lower(trim(p_email))
  where id = p_user_id;
end;
$$ language plpgsql security definer;

-- Update own email + password (called by the user themselves)
create or replace function public.user_update_credentials(
  p_user_id    uuid,
  p_email      text  default null,
  p_password   text  default null
)
returns void as $$
begin
  update public.pos_users
  set
    email         = coalesce(lower(trim(p_email)),   email),
    password_hash = case
                      when p_password is not null and p_password != ''
                      then crypt(p_password, gen_salt('bf', 10))
                      else password_hash
                    end
  where id = p_user_id;
end;
$$ language plpgsql security definer;
