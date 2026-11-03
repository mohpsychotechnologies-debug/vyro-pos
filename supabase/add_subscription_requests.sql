-- ============================================================
-- SUBSCRIPTION REQUESTS TABLE
-- For new users to request store subscriptions
-- ============================================================

create table if not exists public.subscription_requests (
  id              uuid primary key default uuid_generate_v4(),
  business_name   text not null,
  owner_name      text not null,
  phone           text not null,
  email           text,
  address         text,
  plan            text not null, -- 'trial' | 'monthly_basic' | 'monthly_premium' | 'yearly_basic' | 'yearly_premium'
  status          text default 'pending', -- 'pending' | 'approved' | 'rejected'
  notes           text,
  admin_notes     text,
  approved_by     uuid references public.pos_users(id),
  approved_at     timestamptz,
  store_id        uuid references public.stores(id), -- Set when approved
  created_at      timestamptz default now()
);

-- RLS policies
alter table public.subscription_requests enable row level security;

-- Allow anyone to insert requests (public submission) - No auth required
create policy "Anyone can submit subscription request"
  on public.subscription_requests
  for insert
  with check (true);

-- Allow anyone to view their own submission (optional - for confirmation page)
create policy "Users can view all requests"
  on public.subscription_requests
  for select
  using (true);

-- Superadmin can update requests
create policy "Superadmin can update requests"
  on public.subscription_requests
  for update
  using (
    exists (
      select 1 from public.pos_users
      where pos_users.id = auth.uid()
      and pos_users.role = 'superadmin'
    )
  );

-- Index for faster queries
create index if not exists idx_subscription_requests_status on public.subscription_requests(status);
create index if not exists idx_subscription_requests_created on public.subscription_requests(created_at desc);

-- Function to count pending requests
create or replace function get_pending_requests_count()
returns integer
language sql
security definer
as $$
  select count(*)::integer
  from public.subscription_requests
  where status = 'pending';
$$;
