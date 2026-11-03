-- ============================================================
-- ADD BUSINESS TYPE FIELD
-- Track what type of business each store is (Retail, Hotel, etc.)
-- ============================================================

-- Add business_type to subscription_requests
alter table public.subscription_requests 
add column if not exists business_type text;

-- Add business_type to stores
alter table public.stores 
add column if not exists business_type text default 'retail';

-- Update existing stores to 'retail' if null
update public.stores 
set business_type = 'retail' 
where business_type is null;

-- Add comment for documentation
comment on column public.stores.business_type is 
  'Type of business: retail, hotel, pharmacy, etc. Determines which POS modules are available';

comment on column public.subscription_requests.business_type is 
  'Type of business requested: retail, hotel, pharmacy, etc.';
