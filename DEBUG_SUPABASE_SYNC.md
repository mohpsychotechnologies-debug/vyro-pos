# Debug: Data Not Syncing to Supabase

## Problem
Products, customers, expenses, sales, and purchases tables are empty in Supabase even though data exists in localStorage.

## Possible Causes

### 1. Supabase Client Not Initialized
**Check:** Open browser console and look for errors like:
- `Supabase not configured`
- `No connection`

**Fix:** Verify `.env` file has correct values:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Then restart dev server: `npm run dev`

### 2. RLS Policies Blocking Writes
**Check:** Open browser console when saving products. Look for:
- `new row violates row-level security policy`
- `permission denied for table products`

**Fix:** Run this in Supabase SQL Editor to check policies:
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('products', 'customers', 'sales', 'expenses', 'purchases');

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('products', 'customers', 'sales', 'expenses', 'purchases');
```

### 3. Session Context Not Set
**Check:** The app must call `setSessionContext(storeId, role)` before writes.

**Test:** Run this in browser console after login:
```javascript
console.log('Supabase:', window.supabase);
console.log('Store ID:', localStorage.getItem('vyro-session'));
```

## Quick Test Script

### Test 1: Check if Supabase is connected
Open browser console on your app and run:
```javascript
// Check if Supabase client exists
console.log('Supabase client:', typeof supabase);

// Try to fetch products
const testFetch = async () => {
  const sess = JSON.parse(localStorage.getItem('vyro-session'));
  console.log('Session:', sess);
  
  if (!sess) {
    console.error('❌ No session found. Please login first.');
    return;
  }
  
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', sess.store_id);
    
  console.log('Products from Supabase:', data);
  if (error) console.error('Error:', error);
};

testFetch();
```

### Test 2: Try manual insert
```javascript
const testInsert = async () => {
  const sess = JSON.parse(localStorage.getItem('vyro-session'));
  
  if (!sess) {
    console.error('❌ Please login first');
    return;
  }
  
  const testProduct = {
    id: crypto.randomUUID(),
    store_id: sess.store_id,
    name: 'Test Product',
    price: 100,
    stock: 10,
    category: 'Test',
    barcode: '1234567890',
    icon: '🧪'
  };
  
  console.log('Attempting to insert:', testProduct);
  
  const { data, error } = await supabase
    .from('products')
    .insert([testProduct])
    .select();
    
  if (error) {
    console.error('❌ Insert failed:', error);
    console.error('Error code:', error.code);
    console.error('Error details:', error.details);
  } else {
    console.log('✅ Insert successful:', data);
  }
};

testInsert();
```

## Manual Data Migration

If you have data in localStorage but not in Supabase, run this migration script:

### Step 1: Get localStorage Data
Open browser console:
```javascript
const sess = JSON.parse(localStorage.getItem('vyro-session'));
const storeId = sess?.store_id;

if (!storeId) {
  console.error('Please login first');
} else {
  const products = JSON.parse(localStorage.getItem(`vyro-${storeId}-products`) || '[]');
  const customers = JSON.parse(localStorage.getItem(`vyro-${storeId}-customers`) || '[]');
  const sales = JSON.parse(localStorage.getItem(`vyro-${storeId}-sales`) || '[]');
  
  console.log('Products to migrate:', products.length);
  console.log('Customers to migrate:', customers.length);
  console.log('Sales to migrate:', sales.length);
  
  // Copy these for next step
  window.localProducts = products;
  window.localCustomers = customers;
  window.localSales = sales;
}
```

### Step 2: Bulk Insert to Supabase
```javascript
const migrateData = async () => {
  const sess = JSON.parse(localStorage.getItem('vyro-session'));
  
  // Migrate products
  if (window.localProducts && window.localProducts.length > 0) {
    console.log('📦 Migrating products...');
    const { data: prodData, error: prodError } = await supabase
      .from('products')
      .insert(window.localProducts.map(p => ({
        id: p.id,
        store_id: sess.store_id,
        name: p.name,
        price: p.price,
        stock: p.stock || 0,
        low_stock: p.lowStock || 5,
        category: p.category,
        brand: p.brand,
        barcode: p.barcode,
        icon: p.icon
      })));
    
    if (prodError) console.error('Products error:', prodError);
    else console.log('✅ Products migrated:', prodData?.length || window.localProducts.length);
  }
  
  // Migrate customers
  if (window.localCustomers && window.localCustomers.length > 0) {
    console.log('👥 Migrating customers...');
    const { data: custData, error: custError } = await supabase
      .from('customers')
      .insert(window.localCustomers.map(c => ({
        id: c.id,
        store_id: sess.store_id,
        name: c.name,
        phone: c.phone,
        points: c.points || 0
      })));
    
    if (custError) console.error('Customers error:', custError);
    else console.log('✅ Customers migrated:', custData?.length || window.localCustomers.length);
  }
  
  // Migrate sales
  if (window.localSales && window.localSales.length > 0) {
    console.log('💰 Migrating sales...');
    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .insert(window.localSales.map(s => ({
        id: s.id,
        store_id: sess.store_id,
        cashier_id: s.cashierId,
        cashier_name: s.cashier,
        customer_name: s.customer,
        customer_id: s.customerId,
        method: s.method,
        subtotal: s.subtotal,
        discount: s.discount,
        tax: s.tax,
        total: s.total,
        items: s.items,
        loyalty_earned: s.loyaltyEarned || 0,
        sale_date: s.isoDate || new Date().toISOString().split('T')[0]
      })));
    
    if (salesError) console.error('Sales error:', salesError);
    else console.log('✅ Sales migrated:', salesData?.length || window.localSales.length);
  }
};

migrateData();
```

## Expected Console Output

### When Adding a Product (Online Mode):
```
✅ Supabase client initialized
📝 Saving product: Test Product
✅ Product saved to localStorage
✅ Product saved to Supabase
```

### When Adding a Product (Offline/Not Connected):
```
⚠ Supabase not configured
📝 Saving product: Test Product
✅ Product saved to localStorage only
```

## Fix RLS Policies

If the test shows RLS errors, run this in Supabase SQL Editor:

```sql
-- Drop restrictive policies
DROP POLICY IF EXISTS "Users can manage their store's products" ON public.products;
DROP POLICY IF EXISTS "Users can manage their store's customers" ON public.customers;
DROP POLICY IF EXISTS "Users can manage their store's sales" ON public.sales;

-- Create permissive policies (for testing)
CREATE POLICY "Allow all operations on products"
  ON public.products
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on customers"
  ON public.customers
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on sales"
  ON public.sales
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Repeat for other tables
```

⚠️ **Note:** These are permissive policies for testing. In production, use proper RLS policies that check user permissions.

## Verify Fix

1. Login to your store
2. Add a new product
3. Open browser console - should see "✅ Product saved to Supabase"
4. Go to Supabase → Table Editor → products
5. Should see your product! ✅

## Still Not Working?

Check:
1. Internet connection is active
2. Supabase project is not paused (free tier pauses after inactivity)
3. No CORS errors in console
4. `.env` variables are loaded (restart dev server after changing .env)
