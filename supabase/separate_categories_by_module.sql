-- Add module field to categories to separate retail vs restaurant categories
-- This allows the same store to have different categories for POS vs Restaurant

-- Add module column to categories table
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS module TEXT DEFAULT 'retail';

-- Add comment to explain the column
COMMENT ON COLUMN public.categories.module IS 'Module type: retail (for POS) or restaurant (for Restaurant module)';

-- Update existing categories to be 'retail' by default
UPDATE public.categories 
SET module = 'retail' 
WHERE module IS NULL;

-- Make module required
ALTER TABLE public.categories 
ALTER COLUMN module SET NOT NULL;

-- Update unique constraint to include module
-- This allows same category name in different modules
ALTER TABLE public.categories 
DROP CONSTRAINT IF EXISTS categories_store_id_name_key;

ALTER TABLE public.categories 
ADD CONSTRAINT categories_store_id_name_module_key 
UNIQUE (store_id, name, module);

-- Verify the changes
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'categories' 
  AND column_name = 'module';
