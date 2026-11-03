# Debug: Room Not Saving

## Steps to Diagnose

### 1. Check Browser Console (F12)
After clicking "Create Room", look for these console messages:

**Expected Output:**
```
📝 Form submitted with data: {roomNumber: "101", roomType: "double", ...}
📝 Room Number: 101
📝 Room Type: double
📝 Price: 5000
📝 Capacity: 2
🔍 handleSave called with: {roomNumber: "101", ...}
🏪 Store ID: 7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916
➕ Creating new room...
🔧 createRoom called with: {storeId: "...", roomData: {...}}
📤 Inserting data: {store_id: "...", room_number: "101", ...}
✅ Room created: {id: "...", room_number: "101", ...}
✅ Room created successfully: {...}
📦 Create result: {data: {...}, error: null}
```

**If Error:**
```
❌ Supabase error: {code: "...", message: "..."}
❌ Create error: {...}
```

### 2. Common Errors & Solutions

#### Error: "No store ID provided"
**Cause:** storeId is null/undefined
**Fix:**
```sql
-- Check session has store_id
SELECT id, name, store_id, role FROM pos_users WHERE pin = 'YOUR_PIN';

-- If store_id is null, you need to assign user to a store
UPDATE pos_users SET store_id = 'your-hotel-store-id' WHERE pin = 'YOUR_PIN';
```

#### Error: "permission denied for table rooms"
**Cause:** RLS blocking access
**Solution 1 - Check RLS context:**
```sql
-- In Supabase SQL Editor
SELECT current_store_id();
SELECT current_user_role();

-- Should return your store ID and role
-- If NULL, RLS context not set (should auto-set on login)
```

**Solution 2 - Check RLS Policy:**
```sql
-- Verify policy exists
SELECT * FROM pg_policies WHERE tablename = 'rooms';

-- Should see policy "rooms_all"
-- If missing, run the SQL migration again
```

**Solution 3 - Temporarily disable RLS (for testing only):**
```sql
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;

-- Test creating room now
-- Then re-enable:
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
```

#### Error: "duplicate key value violates unique constraint"
**Cause:** Room number already exists for this store
**Fix:**
```sql
-- Check existing rooms
SELECT id, store_id, room_number FROM rooms WHERE store_id = 'your-store-id';

-- Delete test room if needed
DELETE FROM rooms WHERE room_number = '101' AND store_id = 'your-store-id';
```

#### Error: "relation 'rooms' does not exist"
**Cause:** SQL migration not run
**Fix:**
Run `supabase/add_room_bookings.sql` in Supabase SQL Editor

#### Error: "null value in column 'room_number'"
**Cause:** Form field empty
**Fix:** Ensure Room Number field has a value before submitting

### 3. Verify Database Directly

After attempting to create a room, check if it was actually inserted:

```sql
-- Check if room exists
SELECT * FROM rooms WHERE store_id = 'your-store-id' ORDER BY created_at DESC LIMIT 5;

-- If room exists but not showing in UI:
-- Issue is with fetchRooms, not createRoom
```

### 4. Check Network Request

In browser DevTools:
1. Open **Network** tab (F12)
2. Filter by "rooms"
3. Try creating room
4. Look for POST request to `/rest/v1/rooms`
5. Check:
   - Request payload (should have room_number, room_type, etc.)
   - Response status (200 = success, 400 = bad request, 403 = permission denied)
   - Response body (error details if failed)

### 5. Check Session

```javascript
// In browser console
console.log('Session:', JSON.parse(localStorage.getItem('vyro-session')));

// Should show:
// {
//   id: "user-id",
//   store_id: "store-id",  // <-- MUST be present
//   name: "User Name",
//   role: "manager"
// }
```

If `store_id` is missing:
```sql
-- Fix in database
UPDATE pos_users SET store_id = 'your-hotel-store-id' WHERE id = 'user-id';

-- Then logout and login again
```

### 6. Test with Simple SQL Insert

Try inserting directly in Supabase SQL Editor:

```sql
-- Replace with your actual store_id
INSERT INTO rooms (store_id, room_number, room_type, capacity, price_per_night, status)
VALUES ('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', '101', 'double', 2, 5000, 'available')
RETURNING *;

-- If this works, issue is in the app code
-- If this fails, issue is in database/RLS
```

### 7. Force Refresh Data

After creating room (even if error shown):

```javascript
// In browser console
localStorage.removeItem('vyro-rooms');
location.reload();
```

## Quick Fix Steps

### Most Common Issue: RLS Context Not Set

1. **Check if RLS is the problem:**
```sql
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
```

2. **Try creating room now**

3. **If it works, the issue is RLS context**

4. **Re-enable RLS:**
```sql
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
```

5. **Fix RLS context (in app login flow):**
   - Check `setSessionContext(storeId, role)` is called after login
   - Already implemented in main.jsx, should work automatically

6. **Alternative: Use service_role key temporarily:**
   - In `.env`, add: `VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`
   - Update supabase.js to use service role for testing
   - ⚠️ **DO NOT use in production!**

## Debugging Checklist

- [ ] Checked browser console for error messages
- [ ] Verified storeId is not null (check console logs)
- [ ] Checked Network tab for failed requests
- [ ] Verified tables exist in Supabase
- [ ] Checked RLS policies are active
- [ ] Tested direct SQL insert
- [ ] Verified user has store_id in session
- [ ] Tried disabling RLS temporarily
- [ ] Cleared localStorage and reloaded

## Still Not Working?

**Paste these results:**

1. **Console output** when clicking "Create Room"
2. **SQL query result:**
   ```sql
   SELECT id, store_id, name, role FROM pos_users WHERE id = 'your-user-id';
   ```
3. **Network request details** (from DevTools Network tab)
4. **Any error messages** from browser console

This will help identify the exact issue!
