# Category Separation Between POS and Restaurant Modules

## Problem
Categories added in the retail POS module were appearing in the restaurant module and vice versa, because they were all stored with the same `store_id` in the database.

## Solution
Add a `module` field to separate categories by module type ('retail' vs 'restaurant').

## Step 1: Run SQL to Add Module Column ✅
Run the SQL file: `supabase/separate_categories_by_module.sql`

This will:
- Add `module` column to categories table
- Set existing categories to 'retail' by default
- Update unique constraint to allow same category name in different modules

## Step 2: Update Code (PARTIALLY DONE)
The following have been updated:

✅ `src/supabase.js` - Updated `fetchCategories`, `addCategory`, and `deleteCategory` to accept `module` parameter
✅ `src/main.jsx` - Added `restaurantCategories` state
✅ `src/main.jsx` - Updated `loadStoreData` to fetch both retail and restaurant categories
✅ `src/main.jsx` - Updated `addCategory` and `deleteCategory` to handle module parameter

## Step 3: Update Products Page to Pass Module
Still needs to be done - the ProductsPage needs to know which module it's in:

**Option A: Pass module from parent**
```jsx
// In main.jsx around line 828
{page==='products' && <ProductsPage 
  products={products} 
  categories={categories} 
  money={fmt} 
  onAdd={() => setModal('product')} 
  onEdit={p => setModal({ edit: p })} 
  onDelete={deleteProduct} 
  onAddCategory={(name) => addCategory(name, 'retail')}  // <-- ADD MODULE
  onDeleteCategory={(name) => deleteCategory(name, 'retail')} // <-- ADD MODULE
/>}
```

**Option B: Pass module as prop**
```jsx
{page==='products' && <ProductsPage 
  products={products} 
  categories={categories} 
  module="retail"  // <-- NEW PROP
  money={fmt} 
  onAdd={() => setModal('product')} 
  onEdit={p => setModal({ edit: p })} 
  onDelete={deleteProduct} 
  onAddCategory={addCategory}
  onDeleteCategory={deleteCategory} 
/>}
```

Then in ProductsPage:
```jsx
function ProductsPage({products, categories, module='retail', money, onAdd, onEdit, onDelete, onAddCategory, onDeleteCategory}) {
  // ...
  const handleAddCat = e => {
    e.preventDefault();
    if (!newCat.trim()) return;
    if (categories.map(c => c.toLowerCase()).includes(newCat.trim().toLowerCase())) {
      setCatError('Already exists.');
      return;
    }
    onAddCategory(newCat.trim(), module);  // <-- PASS MODULE
    setNewCat('');
    setCatError('');
  };
  
  // Also update delete to pass module:
  // onDeleteCategory(categoryName, module)
}
```

## Step 4: Update Restaurant Module
The Restaurant module should use `restaurantCategories` instead of `categories`:

- Pass `restaurantCategories` prop when rendering Restaurant component
- Use `onAddCategory={(name) => addCategory(name, 'restaurant')}`
- Use `onDeleteCategory={(name) => deleteCategory(name, 'restaurant')}`

## Testing
1. Run the SQL in Supabase SQL Editor
2. Login to a retail store -> Add a category in Products -> Verify it only appears in POS, not in other modules
3. Login to a hotel store -> Add a category in Restaurant -> Verify it only appears in Restaurant module
4. Verify categories are isolated between stores (MOHA TECHNOLOGY vs Vyro Store)

## Notes
- Existing categories will be marked as 'retail' by default
- Each store can have separate category lists for POS vs Restaurant
- Same category name can exist in both modules (e.g., "Beverages" in both retail and restaurant)
