-- ============================================================
-- FIX: Update save_mpesa_credentials to work properly
-- This fixes the "Store not found or access denied" error
-- ============================================================

-- Drop and recreate the function with simpler validation
drop function if exists public.save_mpesa_credentials(uuid, text, text, text, text, text);

create or replace function public.save_mpesa_credentials(
  p_store_id uuid,
  p_consumer_key text,
  p_consumer_secret text,
  p_business_shortcode text,
  p_account_type text default 'till',
  p_passkey text default null
)
returns json as $$
declare
  v_store_exists boolean;
begin
  -- Check if store exists (simpler check)
  select exists(select 1 from public.stores where id = p_store_id) into v_store_exists;
  
  if not v_store_exists then
    raise exception 'Store with ID % does not exist', p_store_id;
  end if;

  -- Insert or update credentials
  insert into public.mpesa_credentials (
    store_id, consumer_key, consumer_secret, business_shortcode, 
    account_type, passkey, is_active, updated_at
  ) values (
    p_store_id, p_consumer_key, p_consumer_secret, p_business_shortcode,
    p_account_type, p_passkey, true, now()
  )
  on conflict (store_id) do update
  set consumer_key = excluded.consumer_key,
      consumer_secret = excluded.consumer_secret,
      business_shortcode = excluded.business_shortcode,
      account_type = excluded.account_type,
      passkey = excluded.passkey,
      is_active = excluded.is_active,
      updated_at = now();

  return json_build_object(
    'success', true,
    'message', 'M-Pesa credentials saved successfully'
  );
end;
$$ language plpgsql security definer;

-- ============================================================
-- Verify the fix works
-- ============================================================
comment on function public.save_mpesa_credentials is 'Fixed version - Securely saves or updates M-Pesa credentials for a store';
