# Fix: Products and Categories Disappearing on Browser Restart

## Problem
Products and categories were disappearing when the browser was restarted, even though they were being saved to both localStorage and Supabase.

## Root Cause
The `handleLogin` function was clearing all state (including products and categories) BEFORE loading data from localStorage. The flow was:

1. User restarts browser
2. Session loads from localStorage
3. User logs in with PIN
4. `handleLogin` clears ALL data → `setProducts([])`
5. `loadStoreData` tries to fetch from Supabase
6. Products lost!

## The Fix
Modified `handleLogin` in `src/main.jsx` to:
1. ✅ **Removed the clearing of products/categories/sales on login**
2. ✅ **Added immediate loading from scoped localStorage** (`vyro-{storeId}-products`)
3. ✅ **Only clears cart and discount** (which should be reset on login)

### Before:
```javascript
const handleLogin = user => {
  // Clear in-memory store data before loading
  setProducts([]); setSales([]); setCustomers([]);
  setSuppliers([]); setPurchases([]); setExpenses([]);
  setCategories(seedCategories); // ❌ Lost data!
  
  persist('session', sess, setSession);
  // ... settings
};
```

### After:
```javascript
const handleLogin = user => {
  persist('session', sess, setSession);
  
  // Load store data from localStorage immediately
  const sid = user.store_id;
  if (sid) {
    const localProducts = lsGetS(sid, 'products', lsGet('products', seedProducts));
    const localCategories = lsGetS(sid, 'categories', lsGet('categories', seedCategories));
    // ... load all data
    
    setProducts(localProducts); // ✅ Restored!
    setCategories(localCategories);
    // ...
  }
  
  // Only clear cart and discount
  setCart([]);
  setDiscount(0);
};
```

## How It Works Now

### On First Login:
1. User enters PIN
2. `handleLogin` runs
3. Loads from scoped localStorage (empty first time, uses seed data)
4. `loadStoreData` fetches from Supabase
5. Products saved to both state and `vyro-{storeId}-products`

### On Add Product:
1. User adds product
2. `saveProduct` calls `persist('products', updated, setProducts)`
3. Saves to `vyro-{storeId}-products` in localStorage
4. Also saves to Supabase (if online)

### On Browser Restart:
1. Session restored from `localStorage` → `vyro-session`
2. User logs in with PIN
3. `handleLogin` loads from `vyro-{storeId}-products` ✅
4. Products immediately visible!
5. `loadStoreData` fetches from Supabase and overwrites (if online)

## Data Scoping

All store data is now properly scoped by `store_id`:
- `vyro-{storeId}-products`
- `vyro-{storeId}-categories`
- `vyro-{storeId}-sales`
- `vyro-{storeId}-customers`
- `vyro-{storeId}-suppliers`
- `vyro-{storeId}-purchases`
- `vyro-{storeId}-expenses`

Global (unscoped) data:
- `vyro-session` (current session)
- `vyro-settings` (app settings)

## Testing

1. **Add a product:**
   - Login
   - Go to Products
   - Add a new product
   - See it in the list

2. **Verify localStorage:**
   - Open browser DevTools → Application → LocalStorage
   - Check for `vyro-{your-store-id}-products`
   - Should contain your products

3. **Restart browser:**
   - Close browser completely
   - Reopen and go to app
   - Login with same PIN
   - **Products should still be there** ✅

4. **Test offline:**
   - Disable network in DevTools
   - Add more products
   - Restart browser
   - Products persist ✅

## Related Files
- `src/main.jsx` - Fixed `handleLogin` function (line ~421)
- Uses helper functions: `lsGetS`, `lsSetS` (store-scoped localStorage)

## Migration Note
The code includes fallback logic to migrate from old unscoped keys:
```javascript
lsGetS(sid, 'products', lsGet('products', seedProducts))
//                       ^^^^^ Falls back to old global key if scoped key doesn't exist
```

This ensures data isn't lost when users update to the fixed version.
