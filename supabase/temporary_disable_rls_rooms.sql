-- TEMPORARY: Disable RLS on room tables to test functionality
-- This removes security isolation - USE ONLY FOR TESTING
-- After testing works, we'll fix RLS properly

-- Disable RLS on all room-related tables
ALTER TABLE public.rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_extras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_maintenance DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('rooms', 'room_bookings', 'booking_extras', 'room_maintenance');
-- All should show rowsecurity = false

-- Test insert
INSERT INTO rooms (store_id, room_number, room_type, capacity, price_per_night, status)
VALUES ('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'TEST101', 'double', 2, 5000, 'available')
RETURNING *;

-- If this works, issue is RLS
-- You can now test creating rooms from the UI

-- DELETE test room after
DELETE FROM rooms WHERE room_number = 'TEST101';

SELECT '✅ RLS disabled - test creating rooms in UI now!' as status;
