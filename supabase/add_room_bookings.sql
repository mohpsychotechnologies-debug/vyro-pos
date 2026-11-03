-- ============================================================
-- HOTEL ROOM BOOKING MODULE
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── Rooms Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  room_number TEXT NOT NULL,
  room_name TEXT,
  room_type TEXT NOT NULL, -- 'single' | 'double' | 'suite' | 'deluxe' | 'family' | 'presidential'
  floor INTEGER,
  capacity INTEGER DEFAULT 2,
  price_per_night NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  amenities TEXT[], -- ['wifi', 'tv', 'ac', 'minibar', 'balcony', 'jacuzzi']
  status TEXT DEFAULT 'available', -- 'available' | 'occupied' | 'maintenance' | 'reserved'
  images TEXT[], -- Array of image URLs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, room_number)
);

-- ── Room Bookings Table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE RESTRICT NOT NULL,
  booking_number TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT NOT NULL,
  guest_id_number TEXT, -- ID/Passport number
  guest_address TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INTEGER GENERATED ALWAYS AS (check_out_date - check_in_date) STORED,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  room_rate NUMERIC NOT NULL,
  subtotal NUMERIC GENERATED ALWAYS AS (room_rate * (check_out_date - check_in_date)) STORED,
  extras NUMERIC DEFAULT 0, -- Room service, minibar, etc.
  discount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  deposit_paid NUMERIC DEFAULT 0,
  balance NUMERIC GENERATED ALWAYS AS (total - deposit_paid) STORED,
  payment_method TEXT, -- 'M-Pesa' | 'Cash' | 'Card' | 'Bank Transfer'
  payment_status TEXT DEFAULT 'pending', -- 'pending' | 'partial' | 'paid' | 'refunded'
  booking_status TEXT DEFAULT 'confirmed', -- 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
  special_requests TEXT,
  notes TEXT,
  booked_by UUID REFERENCES public.pos_users(id),
  booked_by_name TEXT,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Booking Extras/Charges ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_extras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES public.room_bookings(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  category TEXT, -- 'room_service' | 'minibar' | 'laundry' | 'restaurant' | 'spa' | 'other'
  amount NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  total NUMERIC GENERATED ALWAYS AS (amount * quantity) STORED,
  charged_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Room Maintenance Log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
  issue_type TEXT NOT NULL, -- 'cleaning' | 'repair' | 'inspection' | 'upgrade'
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'normal', -- 'low' | 'normal' | 'high' | 'urgent'
  status TEXT DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed' | 'cancelled'
  reported_by UUID REFERENCES public.pos_users(id),
  reported_by_name TEXT,
  assigned_to TEXT,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes for Performance ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_store_status ON public.rooms(store_id, status);
CREATE INDEX IF NOT EXISTS idx_rooms_store_type ON public.rooms(store_id, room_type);
CREATE INDEX IF NOT EXISTS idx_bookings_store ON public.room_bookings(store_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room ON public.room_bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON public.room_bookings(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.room_bookings(store_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_booking_extras ON public.booking_extras(booking_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_room ON public.room_maintenance(room_id, status);

-- ── RLS Policies ─────────────────────────────────────────────
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_maintenance ENABLE ROW LEVEL SECURITY;

-- Rooms: store-scoped access
CREATE POLICY "rooms_all" ON public.rooms FOR ALL
  USING (store_id = current_store_id() OR current_user_role() = 'superadmin');

-- Room Bookings: store-scoped access
CREATE POLICY "bookings_all" ON public.room_bookings FOR ALL
  USING (store_id = current_store_id() OR current_user_role() = 'superadmin');

-- Booking Extras: accessible via booking's store
CREATE POLICY "booking_extras_all" ON public.booking_extras FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.room_bookings rb
      WHERE rb.id = booking_extras.booking_id
        AND (rb.store_id = current_store_id() OR current_user_role() = 'superadmin')
    )
  );

-- Room Maintenance: store-scoped access
CREATE POLICY "maintenance_all" ON public.room_maintenance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_maintenance.room_id
        AND (r.store_id = current_store_id() OR current_user_role() = 'superadmin')
    )
  );

-- ── Helper Functions ─────────────────────────────────────────

-- Generate booking number
CREATE OR REPLACE FUNCTION generate_booking_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'BK' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
         LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Check room availability
CREATE OR REPLACE FUNCTION check_room_availability(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.room_bookings
    WHERE room_id = p_room_id
      AND booking_status NOT IN ('cancelled', 'no_show', 'checked_out')
      AND (id != p_exclude_booking_id OR p_exclude_booking_id IS NULL)
      AND (
        -- Check if dates overlap
        (check_in_date, check_out_date) OVERLAPS (p_check_in, p_check_out)
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update room status based on bookings
CREATE OR REPLACE FUNCTION update_room_status(p_room_id UUID)
RETURNS VOID AS $$
DECLARE
  v_current_booking BOOLEAN;
  v_maintenance BOOLEAN;
BEGIN
  -- Check if room has active booking (checked in)
  SELECT EXISTS (
    SELECT 1 FROM public.room_bookings
    WHERE room_id = p_room_id
      AND booking_status = 'checked_in'
      AND check_out_date >= CURRENT_DATE
  ) INTO v_current_booking;
  
  -- Check if room is under maintenance
  SELECT EXISTS (
    SELECT 1 FROM public.room_maintenance
    WHERE room_id = p_room_id
      AND status IN ('pending', 'in_progress')
  ) INTO v_maintenance;
  
  -- Update room status
  IF v_maintenance THEN
    UPDATE public.rooms SET status = 'maintenance' WHERE id = p_room_id;
  ELSIF v_current_booking THEN
    UPDATE public.rooms SET status = 'occupied' WHERE id = p_room_id;
  ELSE
    -- Check for upcoming reservations today
    IF EXISTS (
      SELECT 1 FROM public.room_bookings
      WHERE room_id = p_room_id
        AND booking_status = 'confirmed'
        AND check_in_date = CURRENT_DATE
    ) THEN
      UPDATE public.rooms SET status = 'reserved' WHERE id = p_room_id;
    ELSE
      UPDATE public.rooms SET status = 'available' WHERE id = p_room_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update room status when booking changes
CREATE OR REPLACE FUNCTION trigger_update_room_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_room_status(OLD.room_id);
    RETURN OLD;
  ELSE
    PERFORM update_room_status(NEW.room_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_status_change ON public.room_bookings;
CREATE TRIGGER booking_status_change
  AFTER INSERT OR UPDATE OR DELETE ON public.room_bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_room_status();

-- Trigger to update booking updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_updated_at ON public.room_bookings;
CREATE TRIGGER booking_updated_at
  BEFORE UPDATE ON public.room_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── Sample Data (Optional) ───────────────────────────────────
-- Uncomment and modify store_id to add sample rooms

/*
-- Replace with your actual hotel store_id
DO $$
DECLARE
  v_store_id UUID := '7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916'; -- Vyro Store
BEGIN
  INSERT INTO public.rooms (store_id, room_number, room_name, room_type, floor, capacity, price_per_night, description, amenities, status) VALUES
  -- Ground Floor
  (v_store_id, '101', 'Garden View Single', 'single', 1, 1, 3500, 'Cozy single room with garden view', ARRAY['wifi', 'tv', 'ac'], 'available'),
  (v_store_id, '102', 'Pool View Double', 'double', 1, 2, 5500, 'Double room overlooking the pool', ARRAY['wifi', 'tv', 'ac', 'minibar'], 'available'),
  (v_store_id, '103', 'Deluxe Twin', 'deluxe', 1, 2, 7500, 'Spacious deluxe room with twin beds', ARRAY['wifi', 'tv', 'ac', 'minibar', 'balcony'], 'available'),
  
  -- First Floor
  (v_store_id, '201', 'Standard Double', 'double', 2, 2, 5000, 'Comfortable double room', ARRAY['wifi', 'tv', 'ac'], 'available'),
  (v_store_id, '202', 'Family Suite', 'family', 2, 4, 12000, 'Large family suite with 2 bedrooms', ARRAY['wifi', 'tv', 'ac', 'minibar', 'balcony', 'kitchenette'], 'available'),
  (v_store_id, '203', 'Executive Suite', 'suite', 2, 2, 15000, 'Executive suite with living area', ARRAY['wifi', 'tv', 'ac', 'minibar', 'balcony', 'jacuzzi'], 'available'),
  
  -- Second Floor
  (v_store_id, '301', 'Honeymoon Suite', 'suite', 3, 2, 18000, 'Romantic suite with king bed and jacuzzi', ARRAY['wifi', 'tv', 'ac', 'minibar', 'balcony', 'jacuzzi'], 'available'),
  (v_store_id, '302', 'Presidential Suite', 'presidential', 3, 4, 35000, 'Luxury presidential suite with panoramic views', ARRAY['wifi', 'tv', 'ac', 'minibar', 'balcony', 'jacuzzi', 'kitchenette', 'dining'], 'available');
END $$;
*/

-- ── Verification ─────────────────────────────────────────────
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN ('rooms', 'room_bookings', 'booking_extras', 'room_maintenance')
ORDER BY table_name;

-- Show created indexes
SELECT 
  indexname,
  tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE '%room%' OR indexname LIKE '%booking%'
ORDER BY tablename, indexname;

SELECT '✅ Room booking module created successfully!' as status;
