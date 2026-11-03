-- ============================================================================
-- SIMPLE FIX: Just recreate the function
-- ============================================================================

-- Drop old versions
DROP FUNCTION IF EXISTS create_restaurant_order(UUID, UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS create_restaurant_order(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS create_restaurant_order CASCADE;

-- Recreate function
CREATE OR REPLACE FUNCTION create_restaurant_order(
  p_store_id UUID,
  p_table_id UUID,
  p_waiter_id UUID,
  p_guest_count INTEGER DEFAULT 1
)
RETURNS UUID
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
BEGIN
  -- Generate order number
  v_order_number := 'ORD' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  
  -- Create order
  INSERT INTO restaurant_orders (
    store_id, table_id, waiter_id, order_number, guest_count, status
  ) VALUES (
    p_store_id, p_table_id, p_waiter_id, v_order_number, p_guest_count, 'open'
  ) RETURNING id INTO v_order_id;
  
  -- Update table status to occupied
  IF p_table_id IS NOT NULL THEN
    UPDATE tables SET status = 'occupied', updated_at = NOW() WHERE id = p_table_id;
  END IF;
  
  RETURN v_order_id;
END;
$$;

SELECT '✅ Function created! Now test in the app.' as result;
