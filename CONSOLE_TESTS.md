# Console Tests - Run in Your App

Open your app at **http://localhost:5173**, login, then open browser console (F12) and run these commands:

## Test 1: Check Session
```javascript
const sess = JSON.parse(localStorage.getItem('vyro-session'));
console.log('Session:', sess);
```

**Expected:** Should show your user info and store_id

---

## Test 2: Check Supabase Client
```javascript
console.log('Supabase available:', typeof supabase !== 'undefined');
```

**Expected:** Should show `true`

---

## Test 3: Check localStorage Data
```javascript
const sess = JSON.parse(localStorage.getItem('vyro-session'));
if (sess) {
  const storeId = sess.store_id;
  const products = JSON.parse(localStorage.getItem(`vyro-${storeId}-products`) || '[]');
  console.log(`📦 Products in localStorage: ${products.length}`);
  console.log('First product:', products[0]);
} else {
  console.log('❌ Not logged in');
}
```

**Expected:** Should show count of products you added

---

## Test 4: Check Supabase Connection
```javascript
const testSupabase = async () => {
  try {
    const { data, error } = await supabase.from('products').select('count');
    if (error) {
      console.error('❌ Supabase error:', error.message);
    } else {
      console.log('✅ Supabase connected, total products:', data);
    }
  } catch (e) {
    console.error('❌ Exception:', e.message);
  }
};
testSupabase();
```

**Expected:** Should show product count from Supabase (might be 0)

---

## Test 5: Try Manual Insert
```javascript
const testInsert = async () => {
  const sess = JSON.parse(localStorage.getItem('vyro-session'));
  if (!sess || !sess.store_id) {
    console.error('❌ Not logged in or no store_id');
    return;
  }
  
  const testProduct = {
    id: crypto.randomUUID(),
    store_id: sess.store_id,
    name: 'Console Test Product',
    price: 999,
    stock: 5,
    low_stock: 2,
    category: 'Test',
    barcode: 'TEST123',
    icon: '🧪'
  };
  
  console.log('Attempting insert:', testProduct);
  
  const { data, error } = await supabase
    .from('products')
    .insert([testProduct])
    .select();
  
  if (error) {
    console.error('❌ Insert failed:', error);
    console.error('Code:', error.code);
    console.error('Details:', error.details);
    console.error('Hint:', error.hint);
  } else {
    console.log('✅ Insert successful!', data);
  }
};
testInsert();
```

**Expected:** Either success or specific error message

---

## Test 6: Migrate All Data
```javascript
const migrateAll = async () => {
  const sess = JSON.parse(localStorage.getItem('vyro-session'));
  if (!sess) {
    console.error('❌ Not logged in');
    return;
  }
  
  const storeId = sess.store_id;
  const products = JSON.parse(localStorage.getItem(`vyro-${storeId}-products`) || '[]');
  
  if (products.length === 0) {
    console.log('⚠️ No products in localStorage to migrate');
    return;
  }
  
  console.log(`📦 Migrating ${products.length} products...`);
  
  const { data, error } = await supabase
    .from('products')
    .upsert(products.map(p => ({
      id: p.id,
      store_id: storeId,
      name: p.name,
      price: p.price,
      stock: p.stock || 0,
      low_stock: p.lowStock || p.low_stock || 5,
      category: p.category,
      brand: p.brand || null,
      barcode: p.barcode || null,
      icon: p.icon || '🏷️'
    })));
  
  if (error) {
    console.error('❌ Migration failed:', error);
  } else {
    console.log(`✅ Migrated ${products.length} products successfully!`);
    console.log('Sample:', data?.[0]);
  }
};
migrateAll();
```

**Expected:** All products migrated to Supabase

---

## What to Look For:

### If Test 1 shows `null`:
- You're not logged in
- Login first at http://localhost:5173

### If Test 4 shows error:
- **"relation does not exist"** → Tables not created, run schema.sql
- **"permission denied"** → RLS policy blocking, run the fix below
- **"JWT"** error → Wrong Supabase keys in .env

### If Test 5 shows "permission denied":
Run this in Supabase SQL Editor:
```sql
-- Temporarily allow all operations for testing
DROP POLICY IF EXISTS "Users can manage their store's products" ON public.products;

CREATE POLICY "Allow all product operations"
  ON public.products
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

---

## After Tests, Tell Me:

1. What does Test 1 show? (session info)
2. What error does Test 5 show? (exact error message)
3. How many products are in localStorage? (from Test 3)
