-- ============================================================
-- QUICK UPDATE: Set Business Types for Your Stores
-- Run this to manually set business types
-- ============================================================

-- First, see all your stores
SELECT id, name, business_type, created_at FROM stores ORDER BY created_at;

-- Copy the output above, then update each store below
-- Replace 'STORE_NAME' with the actual store name from the query above

-- Example: Set first store to retail
UPDATE stores 
SET business_type = 'retail' 
WHERE name ILIKE '%store name here%';  -- Replace with your store name

-- Example: Set second store to hotel
UPDATE stores 
SET business_type = 'hotel' 
WHERE name ILIKE '%hotel name here%';  -- Replace with your store name

-- Verify the changes
SELECT name, business_type FROM stores;

-- ============================================================
-- After running this, users need to LOG OUT and LOG BACK IN
-- for the navigation changes to take effect
-- ============================================================
