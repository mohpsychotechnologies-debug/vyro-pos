# Fixed: 401 Unauthorized Error

## Problem
Getting **401 Unauthorized** when trying to create rooms because RLS (Row Level Security) context wasn't set for the rooms module.

## Root Cause
The `setSessionContext(storeId, role)` function sets the RLS variables that tell PostgreSQL which store the user belongs to. This was only being called in the main App component during initial login, but when navigating to the Room Bookings module, the context might not be set yet or might have been lost.

## Solution Applied
Updated `RoomBookings.jsx` to:
1. Call `setSessionContext()` **before** loading any data
2. Add error handling if context setting fails
3. Add console logging to debug the flow

## What Changed

### Before:
```javascript
useEffect(() => {
  loadData();  // Direct data load without setting context
}, [storeId]);
```

### After:
```javascript
useEffect(() => {
  initializeAndLoadData();  // First set context, then load data
}, [storeId]);

async function initializeAndLoadData() {
  // Set RLS context FIRST
  await setSessionContext(storeId, session.role);
  
  // Then load data
  await loadData();
}
```

## Testing Steps

1. **Clear browser cache:**
   ```javascript
   localStorage.clear();
   location.reload();
   ```

2. **Login** to your hotel store

3. **Go to Room Bookings** tab

4. **Open Console (F12)** and you should see:
   ```
   🔐 Setting RLS context: {storeId: "...", role: "manager"}
   ✅ RLS context set successfully
   📥 Loading rooms and bookings for store: ...
   ```

5. **Click "+ Add Room"**

6. **Fill in the form:**
   - Room Number: 101
   - Room Type: Double
   - Capacity: 2
   - Price: 5000

7. **Click "Create Room"**

8. **Check console** for:
   ```
   📝 Form submitted with data: ...
   🔍 handleSave called with: ...
   ➕ Creating new room...
   🔧 createRoom called with: ...
   ✅ Room created: ...
   ```

9. **Room should appear** in the rooms grid

## If Still Getting 401

### Check 1: Verify RLS Function Exists
```sql
-- In Supabase SQL Editor
SELECT * FROM pg_proc WHERE proname = 'set_session_context';

-- Should return 1 row
-- If not found, run schema.sql to create it
```

### Check 2: Test RLS Context Manually
```sql
-- Set context manually
SELECT set_session_context('your-store-id'::text, 'manager'::text);

-- Check it was set
SELECT current_store_id();
SELECT current_user_role();

-- Should return your store ID and 'manager'
```

### Check 3: Test Insert with Context
```sql
-- Set context
SELECT set_session_context('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'manager');

-- Try insert
INSERT INTO rooms (store_id, room_number, room_type, capacity, price_per_night, status)
VALUES ('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', '101', 'double', 2, 5000, 'available')
RETURNING *;

-- If this works: issue was with app not calling set_session_context
-- If this fails: issue is with RLS policy
```

### Check 4: Verify RLS Policy
```sql
-- Check rooms table has RLS enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename = 'rooms';
-- rowsecurity should be TRUE

-- Check policy exists
SELECT * FROM pg_policies WHERE tablename = 'rooms';
-- Should see "rooms_all" policy
```

## Emergency Fix (Temporary)

If you need to test **immediately** and can't wait for the fix:

```sql
-- TEMPORARY: Disable RLS on rooms table
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE booking_extras DISABLE ROW LEVEL SECURITY;

-- ⚠️ WARNING: This removes security isolation between stores
-- ⚠️ Only use for testing
-- ⚠️ Re-enable before production:

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_extras ENABLE ROW LEVEL SECURITY;
```

## What This Fix Does

1. **Ensures RLS context is set** before any database operation
2. **Maintains session context** throughout the rooms module
3. **Provides clear error messages** if context setting fails
4. **Logs everything** for easy debugging

## Files Modified

- ✅ `src/RoomBookings.jsx` - Added RLS context initialization
- ✅ Console logging for debugging

## Next Steps

1. Test room creation (should work now!)
2. Test room editing
3. Test booking creation
4. If all works, you're good to go! 🎉

## Still Having Issues?

**Share these details:**

1. **Console output** when opening Room Bookings tab
2. **Console output** when clicking "Create Room"
3. **SQL query result:**
   ```sql
   SELECT current_store_id();
   SELECT current_user_role();
   ```
4. **Network request details** from DevTools

This will help identify any remaining issues!
