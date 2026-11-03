-- ============================================================
-- UPDATE EXISTING STORES WITH BUSINESS TYPES
-- Manually set business types for testing
-- ============================================================

-- First, let's see all your stores
SELECT id, name, business_type FROM stores;

-- Update specific stores (replace the store_id with your actual IDs)
-- Copy the IDs from the query above and paste them below

-- Example: Update first store to RETAIL
-- UPDATE stores 
-- SET business_type = 'retail' 
-- WHERE id = 'paste-store-id-here';

-- Example: Update second store to HOTEL
-- UPDATE stores 
-- SET business_type = 'hotel' 
-- WHERE id = 'paste-store-id-here';

-- ============================================================
-- QUICK INSTRUCTIONS:
-- 1. Run the SELECT query above to see your store IDs
-- 2. Copy the store IDs
-- 3. Uncomment and update the UPDATE statements below
-- 4. Replace 'paste-store-id-here' with actual UUIDs
-- 5. Run the UPDATE statements
-- ============================================================

-- Store 1: Retail/General POS
UPDATE stores 
SET business_type = 'retail' 
WHERE name = 'YOUR_FIRST_STORE_NAME';  -- Change this to match your store name

-- Store 2: Hotel/Restaurant POS
UPDATE stores 
SET business_type = 'hotel' 
WHERE name = 'YOUR_SECOND_STORE_NAME';  -- Change this to match your store name

-- Verify the changes
SELECT id, name, business_type FROM stores;
