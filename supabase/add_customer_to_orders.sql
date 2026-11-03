-- Add customer_name and customer_phone to restaurant_orders
ALTER TABLE restaurant_orders
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Index for fast lookup by phone
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_customer_phone
  ON restaurant_orders(customer_phone)
  WHERE customer_phone IS NOT NULL;
