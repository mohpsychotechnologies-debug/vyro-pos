# 🏨 Hotel Room Bookings Module

Complete room booking management system for hotel businesses in Vyro POS.

## Features

### ✅ Room Management
- Create, edit, and delete rooms
- Room types: Single, Double, Suite, Deluxe, Family, Presidential
- Room status: Available, Occupied, Reserved, Maintenance
- Room amenities (wifi, TV, AC, minibar, balcony, jacuzzi, etc.)
- Floor and capacity management
- Pricing per night

### ✅ Booking Management
- Interactive calendar view with visual availability
- Multi-step booking wizard
- Guest information capture (name, phone, email, ID number)
- Check-in/Check-out functionality
- Booking status tracking (Confirmed, Checked In, Checked Out, Cancelled)
- Special requests and notes
- Automatic booking number generation

### ✅ Payment Handling
- Deposit payments
- Balance tracking
- Multiple payment methods (Cash, M-Pesa, Card, Bank Transfer)
- Payment status (Pending, Partial, Paid, Refunded)
- Extra charges during stay (room service, minibar, etc.)

### ✅ Calendar Features
- Month view with room-wise availability
- Color-coded booking status
- Guest initials on booked slots
- Click to view booking details
- Visual indicators for check-in status

### ✅ Reporting & Analytics
- Total bookings count
- Active bookings
- Revenue tracking
- Occupancy visualization

## Database Schema

### Tables Created:
1. **rooms** - Room inventory
2. **room_bookings** - Booking records
3. **booking_extras** - Additional charges
4. **room_maintenance** - Maintenance logs

### Key Features:
- Row Level Security (RLS) for store isolation
- Automatic booking number generation
- Room availability checking
- Automatic room status updates based on bookings
- Timestamps for check-in/check-out

## Installation Steps

### 1. Run SQL Migration
```bash
# In Supabase SQL Editor, run:
supabase/add_room_bookings.sql
```

This creates:
- 4 new tables (rooms, room_bookings, booking_extras, room_maintenance)
- RLS policies for store isolation
- Helper functions for availability checking
- Triggers for auto-status updates

### 2. Add Sample Rooms (Optional)
Uncomment the sample data section at the bottom of `add_room_bookings.sql` and replace the store_id with your actual hotel store ID, then run it.

### 3. Navigation
The module automatically appears in hotel stores only! Hotels will see:
- 🏨 Room Bookings (NEW!)
- 🍽 Restaurant
- 👨‍🍳 Kitchen
- (No Point of Sale - filtered out)

Retail stores will NOT see room bookings.

## Usage Guide

### For Hotel Staff:

#### Creating a New Booking:
1. Click "+ New Booking"
2. **Step 1**: Select check-in/out dates, number of guests, and available room
3. **Step 2**: Enter guest information (name, phone, email, ID)
4. **Step 3**: Review summary, enter deposit amount, select payment method
5. Click "Create Booking"

#### Checking In a Guest:
1. Go to Bookings tab
2. Find the confirmed booking
3. Click "View"
4. Click "Check In" button
5. Room status automatically updates to "Occupied"

#### Adding Extra Charges:
1. Open checked-in booking
2. Click "+ Add Charge"
3. Select category (room service, minibar, etc.)
4. Enter description, quantity, and amount
5. Charges automatically added to bill

#### Checking Out:
1. Find checked-in booking
2. Click "Check Out"
3. Balance due is displayed
4. Collect payment
5. Room automatically becomes "Available"

### For Managers:

#### Managing Rooms:
1. Go to "Rooms" tab
2. Click "+ Add Room" to create new rooms
3. Set room number, type, floor, capacity, price, amenities
4. Edit or delete existing rooms
5. Filter by status (Available, Occupied, etc.)

#### Calendar View:
- Month-by-month availability visualization
- Color coding:
  - 🟡 Yellow = Confirmed (not checked in yet)
  - 🔴 Red = Checked In (currently occupied)
  - 🟢 Green = Checked Out (completed)
- Click on any booked slot to view details

## Code Structure

### Files Created:
```
src/
├── RoomBookings.jsx    # Main booking component (1300+ lines)
├── supabase.js         # Backend functions added (300+ lines)
└── styles.css          # Booking module styles (500+ lines)

supabase/
└── add_room_bookings.sql   # Database schema (350+ lines)
```

### Components:
- `RoomBookings` - Main container
- `CalendarView` - Visual calendar with availability
- `BookingsListView` - Table of all bookings
- `RoomsManagementView` - Room CRUD
- `NewBookingView` - Wizard for creating bookings
- `BookingDetailsView` - Detailed booking info with actions
- `RoomFormModal` - Add/edit room modal
- `ExtraChargeModal` - Add charges to booking

## Technical Details

### Automatic Features:
1. **Room Status Auto-Update**: When a booking is created, checked-in, or checked-out, the room status updates automatically via database trigger
2. **Availability Checking**: System prevents double-booking by checking date overlaps
3. **Booking Numbers**: Auto-generated in format `BK20241102-1234`
4. **Calculated Fields**: Nights, subtotals, balances calculated automatically
5. **RLS Security**: Each store only sees its own rooms and bookings

### Performance Optimizations:
- Indexed queries on store_id, dates, status
- Efficient calendar rendering
- Lazy loading of booking extras
- Optimized joins for room details

## Business Logic

### Booking Flow:
```
New Booking (confirmed)
    ↓ Check In button
Checked In (occupied)
    ↓ Check Out button
Checked Out (completed)

Can be Cancelled at confirmed or checked_in stage
```

### Room Status Flow:
```
Available → Reserved (if booking starting today)
         → Occupied (when checked in)
         → Maintenance (if issue reported)
         → Available (when checkout completes)
```

### Payment Status:
```
Pending (no deposit)
    ↓ Partial deposit paid
Partial (deposit < total)
    ↓ Full amount paid
Paid (deposit_paid >= total)
```

## Security & RLS

All tables have RLS policies that filter by `current_store_id()`:
- Store A cannot see Store B's rooms
- Store A cannot see Store B's bookings
- Superadmin can see everything

## Future Enhancements

Potential features to add:
- [ ] Online booking portal for guests
- [ ] Email/SMS notifications for bookings
- [ ] Room service integration with restaurant module
- [ ] Housekeeping schedule
- [ ] Multi-room bookings (for groups)
- [ ] Booking modifications (change dates/room)
- [ ] Revenue analytics dashboard
- [ ] Seasonal pricing
- [ ] Discount codes/promotions
- [ ] Integration with channel managers (Booking.com, Airbnb)

## Troubleshooting

### Room bookings tab not appearing:
- Check store business_type is set to 'hotel'
- Run: `SELECT business_type FROM stores WHERE id = 'your-store-id';`
- If null or 'retail', update: `UPDATE stores SET business_type = 'hotel' WHERE id = 'your-store-id';`

### Cannot create booking:
- Check RLS context is set (should happen automatically on login)
- Verify room exists and is available
- Check dates are valid (check-out > check-in)

### Room status not updating:
- Check triggers are enabled: `SELECT * FROM pg_trigger WHERE tgname = 'booking_status_change';`
- Manually refresh: `SELECT update_room_status('room-id');`

## Support

For questions or issues, check:
1. Browser console (F12) for error messages
2. Supabase Dashboard → SQL Editor → Run diagnostics
3. Verify tables exist: `SELECT * FROM rooms LIMIT 1;`

## License

Part of Vyro POS system.
