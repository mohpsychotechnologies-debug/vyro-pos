-- ============================================================================
-- FIX: Function Cache Issue
-- ============================================================================
-- Supabase cached the wrong function signature
-- This drops and recreates it properly

-- Drop old function (all variants)
DROP FUNCTION IF EXISTS create_restaurant_order(UUID, UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS create_restaurant_order(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS create_restaurant_order;

-- Recreate with correct signature
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
  
  RAISE NOTICE 'Created order % for table %', v_order_id, p_table_id;
  
  RETURN v_order_id;
END;
$$;

-- Verify
SELECT 'Function recreated!' as result;
SELECT 
  routine_name,
  r.data_type,
  ARRAY_AGG(parameter_name || ' ' || p.data_type ORDER BY ordinal_position) as parameters
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
WHERE routine_name = 'create_restaurant_order'
GROUP BY routine_name, r.data_type;

-- Test it
SELECT 'Testing function...' as result;
DO $$
DECLARE
  v_test_order_id UUID;
  v_store_id UUID;
  v_table_id UUID;
BEGIN
  -- Get first store and table
  SELECT id INTO v_store_id FROM stores LIMIT 1;
  SELECT id INTO v_table_id FROM tables LIMIT 1;
  
  -- Test create order
  v_test_order_id := create_restaurant_order(v_store_id, v_table_id, NULL, 1);
  
  RAISE NOTICE 'Test successful! Order ID: %', v_test_order_id;
  
  -- Clean up test order
  DELETE FROM restaurant_orders WHERE id = v_test_order_id;
  UPDATE tables SET status = 'available' WHERE id = v_table_id;
END $$;

SELECT '✅ Function is working!' as result;
