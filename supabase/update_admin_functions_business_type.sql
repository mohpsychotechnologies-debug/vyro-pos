-- ============================================================
-- UPDATE ADMIN FUNCTION TO INCLUDE BUSINESS_TYPE
-- Add business_type to the stores list in admin panel
-- ============================================================

-- Drop and recreate the function with business_type
create or replace function public.get_all_stores_with_subscriptions()
returns table (
  id uuid,
  name text,
  address text,
  phone text,
  currency text,
  status text,
  business_type text,
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
      s.business_type,
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
    group by s.id, s.name, s.address, s.phone, s.currency, s.status, s.business_type,
             s.subscription_plan, s.subscription_status, s.subscription_ends_at,
             s.cashier_limit, m.name, m.id, s.created_at
    order by s.created_at desc;
end;
$$ language plpgsql security definer;

-- Grant execute permission
grant execute on function public.get_all_stores_with_subscriptions to authenticated;
