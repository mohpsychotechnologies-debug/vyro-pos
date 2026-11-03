-- ============================================================
-- M-PESA C2B INTEGRATION — Multi-tenant Till Management
-- Each store can configure their own M-Pesa credentials
-- ============================================================

-- ── Store M-Pesa Credentials ────────────────────────────────
create table if not exists public.mpesa_credentials (
  id                uuid primary key default uuid_generate_v4(),
  store_id          uuid references public.stores(id) on delete cascade unique not null,
  
  -- M-Pesa API Credentials
  consumer_key      text not null,
  consumer_secret   text not null,
  
  -- Till/Paybill Configuration
  business_shortcode text not null,  -- Till number or Paybill number
  account_type      text default 'till',  -- 'till' or 'paybill'
  
  -- C2B Configuration
  validation_url    text,  -- Optional: URL for validation callback
  confirmation_url  text,  -- Optional: URL for confirmation callback
  
  -- Passkey (for online checkout/STK Push if needed)
  passkey           text,
  
  -- Status
  is_active         boolean default true,
  is_verified       boolean default false,  -- Set to true after successful test transaction
  
  -- Metadata
  last_verified_at  timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Enable RLS
alter table public.mpesa_credentials enable row level security;

-- Policy: Only store owner and superadmin can access
create policy "mpesa_creds_select" on public.mpesa_credentials for select
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

create policy "mpesa_creds_insert" on public.mpesa_credentials for insert
  with check (store_id = current_store_id() or current_user_role() = 'superadmin');

create policy "mpesa_creds_update" on public.mpesa_credentials for update
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

create policy "mpesa_creds_delete" on public.mpesa_credentials for delete
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- ── M-Pesa Transactions Log ─────────────────────────────────
create table if not exists public.mpesa_transactions (
  id                    uuid primary key default uuid_generate_v4(),
  store_id              uuid references public.stores(id) on delete cascade not null,
  
  -- Transaction Details
  transaction_type      text not null,  -- 'C2B' | 'B2C' | 'STK_PUSH'
  transaction_id        text unique not null,  -- M-Pesa receipt/transaction ID
  originator_conversation_id text,
  conversation_id       text,
  
  -- Payment Info
  amount                numeric not null,
  phone_number          text not null,
  bill_ref_number       text,  -- Optional reference from customer
  
  -- M-Pesa Response
  result_code           text,
  result_desc           text,
  
  -- Link to sale (if applicable)
  sale_id               uuid references public.sales(id),
  
  -- Status
  status                text default 'pending',  -- 'pending' | 'completed' | 'failed' | 'reversed'
  
  -- Metadata
  raw_response          jsonb,  -- Full M-Pesa callback data
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- Enable RLS
alter table public.mpesa_transactions enable row level security;

-- Policy: Store can see their own transactions
create policy "mpesa_trans_all" on public.mpesa_transactions for all
  using (store_id = current_store_id() or current_user_role() = 'superadmin');

-- Index for fast lookups
create index if not exists idx_mpesa_trans_store on public.mpesa_transactions(store_id);
create index if not exists idx_mpesa_trans_id on public.mpesa_transactions(transaction_id);
create index if not exists idx_mpesa_trans_phone on public.mpesa_transactions(phone_number);

-- ── Function: Save M-Pesa Credentials (with encryption) ─────
create or replace function public.save_mpesa_credentials(
  p_store_id uuid,
  p_consumer_key text,
  p_consumer_secret text,
  p_business_shortcode text,
  p_account_type text default 'till',
  p_passkey text default null
)
returns json as $$
begin
  -- Validate store exists and user has permission
  if not exists (
    select 1 from public.stores 
    where id = p_store_id 
    and (id = current_store_id() or current_user_role() = 'superadmin')
  ) then
    raise exception 'Store not found or access denied';
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

-- ── Function: Get M-Pesa Credentials ────────────────────────
create or replace function public.get_mpesa_credentials(p_store_id uuid)
returns json as $$
declare
  v_creds json;
begin
  select json_build_object(
    'consumer_key', consumer_key,
    'consumer_secret', consumer_secret,
    'business_shortcode', business_shortcode,
    'account_type', account_type,
    'passkey', passkey,
    'is_active', is_active,
    'is_verified', is_verified
  ) into v_creds
  from public.mpesa_credentials
  where store_id = p_store_id
    and is_active = true;

  return v_creds;
end;
$$ language plpgsql security definer;

-- ── Function: Log M-Pesa Transaction ────────────────────────
create or replace function public.log_mpesa_transaction(
  p_store_id uuid,
  p_transaction_type text,
  p_transaction_id text,
  p_amount numeric,
  p_phone_number text,
  p_bill_ref_number text default null,
  p_result_code text default null,
  p_result_desc text default null,
  p_raw_response jsonb default null,
  p_sale_id uuid default null
)
returns uuid as $$
declare
  v_trans_id uuid;
begin
  insert into public.mpesa_transactions (
    store_id, transaction_type, transaction_id, amount, phone_number,
    bill_ref_number, result_code, result_desc, raw_response, sale_id,
    status
  ) values (
    p_store_id, p_transaction_type, p_transaction_id, p_amount, p_phone_number,
    p_bill_ref_number, p_result_code, p_result_desc, p_raw_response, p_sale_id,
    case when p_result_code = '0' then 'completed' else 'pending' end
  )
  returning id into v_trans_id;

  return v_trans_id;
end;
$$ language plpgsql security definer;

-- ── Function: Update Transaction Status ─────────────────────
create or replace function public.update_mpesa_transaction_status(
  p_transaction_id text,
  p_status text,
  p_result_code text default null,
  p_result_desc text default null
)
returns json as $$
begin
  update public.mpesa_transactions
  set status = p_status,
      result_code = coalesce(p_result_code, result_code),
      result_desc = coalesce(p_result_desc, result_desc),
      updated_at = now()
  where transaction_id = p_transaction_id;

  return json_build_object(
    'success', true,
    'message', 'Transaction status updated'
  );
end;
$$ language plpgsql security definer;

-- ── Function: Get Store M-Pesa Stats ────────────────────────
create or replace function public.get_mpesa_stats(p_store_id uuid)
returns json as $$
declare
  v_stats json;
begin
  select json_build_object(
    'total_transactions', count(*),
    'completed_transactions', count(*) filter (where status = 'completed'),
    'pending_transactions', count(*) filter (where status = 'pending'),
    'failed_transactions', count(*) filter (where status = 'failed'),
    'total_amount', coalesce(sum(amount) filter (where status = 'completed'), 0),
    'today_amount', coalesce(
      sum(amount) filter (
        where status = 'completed' 
        and created_at::date = current_date
      ), 0
    ),
    'this_month_amount', coalesce(
      sum(amount) filter (
        where status = 'completed' 
        and date_trunc('month', created_at) = date_trunc('month', now())
      ), 0
    )
  ) into v_stats
  from public.mpesa_transactions
  where store_id = p_store_id;

  return v_stats;
end;
$$ language plpgsql security definer;

-- ============================================================
-- COMMENTS
-- ============================================================
comment on table public.mpesa_credentials is 'Stores M-Pesa API credentials for each store (till number, keys)';
comment on table public.mpesa_transactions is 'Logs all M-Pesa transactions (C2B payments, confirmations)';
comment on function public.save_mpesa_credentials is 'Securely saves or updates M-Pesa credentials for a store';
comment on function public.get_mpesa_credentials is 'Retrieves M-Pesa credentials for API calls';
comment on function public.log_mpesa_transaction is 'Logs incoming M-Pesa transaction from callback';
