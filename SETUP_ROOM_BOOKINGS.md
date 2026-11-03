# Quick Setup Guide: Room Bookings Module

## Step-by-Step Setup

### Step 1: Run Database Migration ✅
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Open file: `supabase/add_room_bookings.sql`
4. Copy entire contents
5. Paste into SQL Editor
6. Click **"Run"**
7. Wait for success message: ✅ Room booking module created successfully!

### Step 2: Verify Tables Created
Run this in SQL Editor to verify:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('rooms', 'room_bookings', 'booking_extras', 'room_maintenance');
```

You should see 4 tables.

### Step 3: (Optional) Add Sample Rooms
If you want to test with sample data, run this (replace the store_id):

```sql
-- Find your hotel store ID first
SELECT id, name, business_type FROM stores WHERE business_type = 'hotel';

-- Then insert sample rooms (replace YOUR_STORE_ID)
INSERT INTO public.rooms (store_id, room_number, room_name, room_type, floor, capacity, price_per_night, description, amenities, status) VALUES
('YOUR_STORE_ID', '101', 'Garden View Single', 'single', 1, 1, 3500, 'Cozy single room with garden view', ARRAY['wifi', 'tv', 'ac'], 'available'),
('YOUR_STORE_ID', '102', 'Pool View Double', 'double', 1, 2, 5500, 'Double room overlooking the pool', ARRAY['wifi', 'tv', 'ac', 'minibar'], 'available'),
('YOUR_STORE_ID', '103', 'Deluxe Suite', 'suite', 1, 2, 15000, 'Spacious suite with balcony', ARRAY['wifi', 'tv', 'ac', 'minibar', 'balcony', 'jacuzzi'], 'available');
```

### Step 4: Clear Browser Cache
```javascript
// Open browser console (F12) and run:
localStorage.clear();
location.reload();
```

### Step 5: Login and Test
1. Login to a hotel store (Vyro Store or CLARION HOTEL)
2. You should see: 🏨 **Room Bookings** tab in navigation
3. Click it to open the module
4. If you added sample rooms, they should appear

## What You Get

### Navigation (Hotel Stores Only):
- ✅ Dashboard
- ✅ Restaurant 🍽
- ✅ **Room Bookings 🏨** (NEW!)
- ✅ Kitchen 👨‍🍳
- ✅ Sales
- ✅ Products
- etc.

Retail stores will NOT see the Room Bookings tab.

## Quick Test Workflow

1. **Add a Room** (if not using sample data):
   - Go to "Rooms" tab
   - Click "+ Add Room"
   - Fill in: Room 201, Double, Floor 2, Capacity 2, Price 6000
   - Select amenities: wifi, tv, ac
   - Click "Create Room"

2. **Create a Booking**:
   - Click "+ New Booking"
   - Select dates (today to tomorrow)
   - Select adults (2)
   - Click room 201
   - Click "Next: Guest Information"
   - Enter guest name: "John Doe"
   - Enter phone: "+254712345678"
   - Click "Next: Payment"
   - Enter deposit: 3000
   - Select payment method: Cash
   - Click "Create Booking"

3. **View Calendar**:
   - Go to "Calendar" tab
   - You should see Room 201 marked as booked
   - Click on the booking to view details

4. **Check In**:
   - Go to "Bookings" tab
   - Click "View" on John Doe's booking
   - Click "Check In"
   - Status changes to "Checked In"
   - Room status automatically becomes "Occupied"

5. **Add Extra Charge**:
   - In booking details, click "+ Add Charge"
   - Description: "Room Service - Breakfast"
   - Category: room_service
   - Amount: 1500
   - Quantity: 2
   - Click "Add Charge"
   - Total updates automatically

6. **Check Out**:
   - Click "Check Out" button
   - Balance due is shown
   - Room automatically becomes "Available"

## Troubleshooting

### "Room Bookings" tab not showing:
```sql
-- Check business type
SELECT id, name, business_type FROM stores;

-- If not 'hotel', update it:
UPDATE stores SET business_type = 'hotel' WHERE name = 'Your Store Name';
```

Then clear cache and reload.

### Tables not created:
- Check SQL ran without errors
- Look for error messages in Supabase SQL Editor
- Common issue: schema.sql not run first (run if needed)

### Permission errors:
- RLS policies created automatically
- If issues, temporarily disable: `ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;`

### Booking not creating:
- Check browser console (F12) for errors
- Verify room exists and is available
- Check dates are valid (checkout > checkin)

## Next Steps

1. **Add More Rooms**: Build your room inventory
2. **Test Full Workflow**: Create → Check In → Add Charges → Check Out
3. **Explore Calendar**: View month-by-month availability
4. **Try Filters**: Filter bookings by status, dates
5. **Check Reports**: View revenue and occupancy stats

## Database Functions Available

```sql
-- Check if room is available for dates
SELECT check_room_availability(
  'room-id'::uuid, 
  '2024-11-10'::date, 
  '2024-11-12'::date
);

-- Generate booking number
SELECT generate_booking_number();

-- Update room status based on bookings
SELECT update_room_status('room-id'::uuid);
```

## API Endpoints (Supabase Functions)

All backend functions are in `src/supabase.js`:

### Rooms:
- `fetchRooms(storeId, status)` - Get all rooms
- `createRoom(storeId, roomData)` - Add new room
- `updateRoom(roomId, updates)` - Edit room
- `deleteRoom(roomId)` - Remove room

### Bookings:
- `fetchBookings(storeId, filters)` - Get all bookings
- `createBooking(storeId, bookingData, userId, userName)` - New booking
- `checkInBooking(bookingId)` - Check in guest
- `checkOutBooking(bookingId)` - Check out guest
- `cancelBooking(bookingId, refundAmount)` - Cancel booking
- `updateBooking(bookingId, updates)` - Modify booking

### Extras:
- `fetchBookingExtras(bookingId)` - Get charges
- `addBookingExtra(bookingId, extraData)` - Add charge
- `deleteBookingExtra(extraId)` - Remove charge

### Availability:
- `checkRoomAvailability(roomId, checkIn, checkOut, excludeBookingId)` - Check dates

## File Structure

```
vyro-POS/
├── src/
│   ├── RoomBookings.jsx     (Main component)
│   ├── supabase.js           (Backend functions added)
│   ├── main.jsx              (Navigation updated)
│   └── styles.css            (Styling added)
├── supabase/
│   └── add_room_bookings.sql (Database schema)
└── ROOM_BOOKINGS_MODULE.md   (Full documentation)
```

## Support

If you encounter any issues:
1. Check browser console (F12) for error messages
2. Verify SQL ran successfully in Supabase
3. Check that business_type = 'hotel' for your store
4. Clear localStorage and reload
5. Review ROOM_BOOKINGS_MODULE.md for detailed docs

---

**You're all set! 🎉**

Your hotel can now manage room bookings, check-ins, check-outs, and extra charges seamlessly within Vyro POS!
