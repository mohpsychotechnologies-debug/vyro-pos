-- Fix get_kitchen_orders to include 'ready' items so they stay visible
-- and kitchen staff can mark them as served
CREATE OR REPLACE FUNCTION get_kitchen_orders(p_store_id UUID)
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  table_number TEXT,
  item_id UUID,
  item_name TEXT,
  quantity INTEGER,
  notes TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ,
  time_elapsed INTEGER
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ro.id,
    ro.order_number,
    COALESCE(t.table_number, 'Takeaway') as table_number,
    roi.id,
    roi.item_name,
    roi.quantity,
    roi.notes,
    roi.status,
    roi.sent_at,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(roi.sent_at, roi.created_at)))::INTEGER as time_elapsed
  FROM restaurant_order_items roi
  JOIN restaurant_orders ro ON roi.order_id = ro.id
  LEFT JOIN tables t ON ro.table_id = t.id
  WHERE ro.store_id = p_store_id
    AND roi.status IN ('sent', 'preparing', 'ready')  -- include ready so they stay visible
    AND ro.status NOT IN ('completed', 'cancelled')
  ORDER BY roi.sent_at ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;
