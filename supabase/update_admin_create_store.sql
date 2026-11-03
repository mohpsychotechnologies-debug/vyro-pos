-- ============================================================
-- UPDATE ADMIN_CREATE_STORE FUNCTION
-- Add business_type parameter to store creation
-- ============================================================

-- First, drop the existing function (specify all possible signatures)
drop function if exists public.admin_create_store(text, text, text, text, numeric);
drop function if exists public.admin_create_store(text, text, text, text, numeric, text);

-- Now create the updated function
create or replace function public.admin_create_store(
  p_name text,
  p_address text default null,
  p_phone text default null,
  p_currency text default 'KSh',
  p_tax_rate numeric default 16,
  p_business_type text default 'retail'
)
returns uuid as $$
declare
  v_store_id uuid;
begin
  -- Insert new store
  insert into public.stores (
    name, 
    address, 
    phone, 
    currency, 
    tax_rate, 
    business_type,
    status,
    subscription_plan,
    subscription_status
  )
  values (
    p_name,
    p_address,
    p_phone,
    p_currency,
    p_tax_rate,
    p_business_type,
    'active',
    'trial',
    'trial'
  )
  returning id into v_store_id;
  
  return v_store_id;
end;
$$ language plpgsql security definer;

-- Grant execute permission
grant execute on function public.admin_create_store to authenticated;
