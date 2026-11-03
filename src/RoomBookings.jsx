import React, { useState, useEffect } from 'react';
import {
  fetchRooms,
  fetchBookings,
  createRoom,
  updateRoom,
  deleteRoom,
  createBooking,
  updateBooking,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  fetchBookingExtras,
  addBookingExtra,
  deleteBookingExtra,
  checkRoomAvailability,
  setSessionContext,
} from './supabase';
import { 
  sendWhatsApp, 
  formatBookingConfirmation, 
  formatCheckInConfirmation, 
  formatCheckOutReceipt 
} from './whatsappUtils';
import { shareBookingConfirmationPDF, shareCheckOutReceiptPDF } from './receiptPDF';

// ══════════════════════════════════════════════════════════════
// ROOM BOOKINGS MODULE
// ══════════════════════════════════════════════════════════════

export default function RoomBookings({ storeId, session, money, notify, storeName = 'Hotel', initialRooms = [], initialBookings = [], taxRate = 16 }) {
  const [view, setView] = useState('calendar'); // 'calendar' | 'bookings' | 'rooms' | 'new-booking'
  const [rooms, setRooms] = useState(initialRooms);
  const [bookings, setBookings] = useState(initialBookings);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  // Skip loading spinner if App already passed data
  const [loading, setLoading] = useState(initialRooms.length === 0 && initialBookings.length === 0);
  const [filters, setFilters] = useState({
    status: 'all',
    roomType: 'all',
    dateFrom: null,
    dateTo: null
  });

  useEffect(() => {
    // If App already passed data, no need to fetch again
    if (initialRooms.length > 0 || initialBookings.length > 0) return;
    loadData();
  }, [storeId]);

  async function loadData() {
    if (!storeId || !session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Run setSessionContext and data fetches in parallel — no need to wait for context before fetching
    const [, roomsData, bookingsData] = await Promise.all([
      setSessionContext(storeId, session.role).catch(() => {}),
      fetchRooms(storeId),
      fetchBookings(storeId),
    ]);
    setRooms(roomsData);
    setBookings(bookingsData);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading rooms...</p>
      </div>
    );
  }

  return (
    <div className="room-bookings-container">
      <div className="bookings-header">
        <h2>🏨 Room Bookings</h2>
        <div className="header-actions">
          <button
            className={`tab-btn ${view === 'calendar' ? 'active' : ''}`}
            onClick={() => setView('calendar')}
          >
            📅 Calendar
          </button>
          <button
            className={`tab-btn ${view === 'bookings' ? 'active' : ''}`}
            onClick={() => setView('bookings')}
          >
            📋 Bookings
          </button>
          <button
            className={`tab-btn ${view === 'rooms' ? 'active' : ''}`}
            onClick={() => setView('rooms')}
          >
            🚪 Rooms
          </button>
          {(session?.role === 'manager' || session?.role === 'cashier') && (
            <button
              className="primary"
              onClick={() => setView('new-booking')}
            >
              + New Booking
            </button>
          )}
        </div>
      </div>

      {view === 'calendar' && (
        <CalendarView
          rooms={rooms}
          bookings={bookings}
          money={money}
          onSelectBooking={booking => {
            setSelectedBooking(booking);
            setView('booking-details');
          }}
        />
      )}

      {view === 'bookings' && (
        <BookingsListView
          bookings={bookings}
          rooms={rooms}
          money={money}
          filters={filters}
          setFilters={setFilters}
          onSelectBooking={booking => {
            setSelectedBooking(booking);
            setView('booking-details');
          }}
          onRefresh={loadData}
        />
      )}

      {view === 'rooms' && (
        <RoomsManagementView
          rooms={rooms}
          storeId={storeId}
          session={session}
          money={money}
          onRefresh={loadData}
          notify={notify}
        />
      )}

      {view === 'new-booking' && (
        <NewBookingView
          rooms={rooms}
          storeId={storeId}
          session={session}
          money={money}
          storeName={storeName}
          taxRate={taxRate}
          onBack={() => setView('calendar')}
          onSuccess={(newBooking, selectedRoom) => {
            loadData();
            notify('✓ Booking created successfully');
            
            // Show WhatsApp confirmation option
            if (newBooking && newBooking.guest_phone) {
              const shouldSend = window.confirm(
                `Share booking confirmation PDF with ${newBooking.guest_name}?`
              );
              if (shouldSend) {
                shareBookingConfirmationPDF({ booking: newBooking, room: selectedRoom, storeName, storePhone: '' });
              }
            }
            
            setView('bookings');
          }}
          notify={notify}
        />
      )}

      {view === 'booking-details' && selectedBooking && (
        <BookingDetailsView
          booking={selectedBooking}
          rooms={rooms}
          money={money}
          storeName={storeName}
          onBack={() => {
            setView('bookings');
            setSelectedBooking(null);
          }}
          onUpdate={loadData}
          notify={notify}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CALENDAR VIEW
// ══════════════════════════════════════════════════════════════

function CalendarView({ rooms, bookings, money, onSelectBooking }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'week' | 'month'

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get bookings for a specific room and date
  const getBookingForRoomDate = (roomId, date) => {
    const dateStr = date.toISOString().split('T')[0];
    return bookings.find(b =>
      b.room_id === roomId &&
      b.booking_status !== 'cancelled' &&
      b.booking_status !== 'no_show' &&
      dateStr >= b.check_in_date &&
      dateStr < b.check_out_date
    );
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }

    return days;
  };

  const calendarDays = generateCalendarDays();

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar-view">
      <div className="calendar-controls">
        <button onClick={prevMonth}>← Previous</button>
        <h3>{monthName}</h3>
        <button onClick={nextMonth}>Next →</button>
      </div>

      <div className="calendar-grid">
        <div className="calendar-header">
          <div className="calendar-cell header-cell">Room</div>
          {calendarDays.map(day => (
            <div key={day.toISOString()} className="calendar-cell header-cell date-header">
              <div className="day-number">{day.getDate()}</div>
              <div className="day-name">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            </div>
          ))}
        </div>

        {rooms.map(room => (
          <div key={room.id} className="calendar-row">
            <div className="calendar-cell room-cell">
              <div className="room-number">{room.room_number}</div>
              <div className="room-type">{room.room_type}</div>
            </div>
            {calendarDays.map(day => {
              const booking = getBookingForRoomDate(room.id, day);
              const isToday = day.toDateString() === today.toDateString();
              const isPast = day < today;

              return (
                <div
                  key={`${room.id}-${day.toISOString()}`}
                  className={`calendar-cell day-cell ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${booking ? 'booked' : 'available'}`}
                  onClick={() => booking && onSelectBooking(booking)}
                  style={{
                    cursor: booking ? 'pointer' : 'default',
                    backgroundColor: booking
                      ? booking.booking_status === 'checked_in'
                        ? '#ef444420'
                        : booking.booking_status === 'confirmed'
                        ? '#f59e0b20'
                        : '#22c55e20'
                      : isPast
                      ? '#f3f4f620'
                      : 'transparent'
                  }}
                >
                  {booking && (
                    <div className="booking-indicator" title={booking.guest_name}>
                      <div className="guest-initials">
                        {booking.guest_name.split(' ').map(n => n[0]).join('')}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="calendar-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#f59e0b20' }} />
          <span>Confirmed</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#ef444420' }} />
          <span>Checked In</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#22c55e20' }} />
          <span>Checked Out</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// BOOKINGS LIST VIEW
// ══════════════════════════════════════════════════════════════

function BookingsListView({ bookings, rooms, money, filters, setFilters, onSelectBooking, onRefresh }) {
  const [search, setSearch] = useState('');

  const filteredBookings = bookings.filter(b => {
    if (filters.status !== 'all' && b.booking_status !== filters.status) return false;
    if (search && !b.guest_name.toLowerCase().includes(search.toLowerCase()) &&
        !b.booking_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statusColors = {
    confirmed: '#f59e0b',
    checked_in: '#ef4444',
    checked_out: '#22c55e',
    cancelled: '#9ca3af',
    no_show: '#64748b'
  };

  const statusLabels = {
    confirmed: 'Confirmed',
    checked_in: 'Checked In',
    checked_out: 'Checked Out',
    cancelled: 'Cancelled',
    no_show: 'No Show'
  };

  return (
    <div className="bookings-list-view">
      <div className="bookings-filters">
        <input
          type="text"
          className="search"
          placeholder="Search guest name or booking number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={filters.status}
          onChange={e => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="all">All Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="checked_in">Checked In</option>
          <option value="checked_out">Checked Out</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn-refresh" onClick={onRefresh}>🔄 Refresh</button>
      </div>

      <div className="bookings-stats">
        <div className="stat-card">
          <div className="stat-label">Total Bookings</div>
          <div className="stat-value">{bookings.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">
            {bookings.filter(b => b.booking_status === 'checked_in' || b.booking_status === 'confirmed').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">
            {money(bookings.filter(b => b.booking_status !== 'cancelled').reduce((sum, b) => sum + Number(b.total || 0), 0))}
          </div>
        </div>
      </div>

      <div className="bookings-table">
        <table>
          <thead>
            <tr>
              <th>Booking #</th>
              <th>Guest Name</th>
              <th>Room</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Nights</th>
              <th>Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.map(booking => {
              const room = rooms.find(r => r.id === booking.room_id);
              return (
                <tr key={booking.id}>
                  <td>{booking.booking_number}</td>
                  <td>
                    <div className="guest-info">
                      <div className="guest-name">{booking.guest_name}</div>
                      <div className="guest-contact">{booking.guest_phone}</div>
                    </div>
                  </td>
                  <td>
                    {room ? `${room.room_number} - ${room.room_type}` : 'N/A'}
                  </td>
                  <td>{new Date(booking.check_in_date).toLocaleDateString()}</td>
                  <td>{new Date(booking.check_out_date).toLocaleDateString()}</td>
                  <td>{booking.nights}</td>
                  <td>{money(booking.total)}</td>
                  <td>
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: statusColors[booking.booking_status] + '20',
                        color: statusColors[booking.booking_status],
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    >
                      {statusLabels[booking.booking_status]}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-view"
                      onClick={() => onSelectBooking(booking)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredBookings.length === 0 && (
          <div className="empty-state">
            <p>No bookings found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ROOMS MANAGEMENT VIEW
// ══════════════════════════════════════════════════════════════

function RoomsManagementView({ rooms, storeId, session, money, onRefresh, notify }) {
  const [showForm, setShowForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredRooms = filterStatus === 'all'
    ? rooms
    : rooms.filter(r => r.status === filterStatus);

  const handleSave = async (formData) => {
    console.log('🔍 handleSave called with:', formData);
    console.log('🏪 Store ID:', storeId);
    
    if (editingRoom) {
      console.log('✏️ Updating room:', editingRoom.id);
      const error = await updateRoom(editingRoom.id, formData);
      if (error) {
        console.error('❌ Update error:', error);
        notify('Failed to update room: ' + (error.message || error));
        return;
      }
      notify('✓ Room updated');
    } else {
      console.log('➕ Creating new room...');
      const { data, error } = await createRoom(storeId, formData);
      console.log('📦 Create result:', { data, error });
      
      if (error) {
        console.error('❌ Create error:', error);
        notify('Failed to create room: ' + (error.message || error));
        return;
      }
      console.log('✅ Room created successfully:', data);
      notify('✓ Room created');
    }
    setShowForm(false);
    setEditingRoom(null);
    await onRefresh();
  };

  const handleDelete = async (roomId) => {
    if (!confirm('Delete this room? This cannot be undone.')) return;
    
    const error = await deleteRoom(roomId);
    if (error) {
      notify('Failed to delete room: ' + error);
      return;
    }
    notify('✓ Room deleted');
    onRefresh();
  };

  const statusIcons = {
    available: '🟢',
    occupied: '🔴',
    reserved: '🟡',
    maintenance: '🔧'
  };

  return (
    <div className="rooms-management">
      <div className="rooms-toolbar">
        <select
          className="filter-select"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="all">All Rooms</option>
          <option value="available">Available</option>
          <option value="occupied">Occupied</option>
          <option value="reserved">Reserved</option>
          <option value="maintenance">Maintenance</option>
        </select>
        
        {session?.role === 'manager' && (
          <button
            className="primary"
            onClick={() => {
              setEditingRoom(null);
              setShowForm(true);
            }}
          >
            + Add Room
          </button>
        )}
      </div>

      <div className="rooms-grid">
        {filteredRooms.map(room => (
          <div key={room.id} className={`room-card room-${room.status}`}>
            <div className="room-header">
              <div className="room-number">{room.room_number}</div>
              <div className="room-status">
                {statusIcons[room.status]} {room.status}
              </div>
            </div>
            <div className="room-body">
              <div className="room-type">{room.room_type}</div>
              {room.room_name && <div className="room-name">{room.room_name}</div>}
              <div className="room-capacity">👥 {room.capacity} guests</div>
              <div className="room-price">{money(room.price_per_night)}/night</div>
              {room.amenities && room.amenities.length > 0 && (
                <div className="room-amenities">
                  {room.amenities.slice(0, 3).map((a, i) => (
                    <span key={i} className="amenity-tag">{a}</span>
                  ))}
                  {room.amenities.length > 3 && (
                    <span className="amenity-more">+{room.amenities.length - 3}</span>
                  )}
                </div>
              )}
            </div>
            {session?.role === 'manager' && (
              <div className="room-actions">
                <button
                  className="btn-edit"
                  onClick={() => {
                    setEditingRoom(room);
                    setShowForm(true);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(room.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredRooms.length === 0 && (
        <div className="empty-state">
          <p style={{ fontSize: 48 }}>🚪</p>
          <p>No rooms found</p>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Add rooms to start managing bookings</p>
        </div>
      )}

      {showForm && (
        <RoomFormModal
          room={editingRoom}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingRoom(null);
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// NEW BOOKING VIEW
// ══════════════════════════════════════════════════════════════

function NewBookingView({ rooms, storeId, session, money, onBack, onSuccess, notify, taxRate = 16 }) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [step, setStep] = useState(1); // 1: Select Room & Dates, 2: Guest Details, 3: Payment
  const [formData, setFormData] = useState({
    roomId: '',
    checkInDate: today,
    checkOutDate: tomorrow,
    adults: 1,
    children: 0,
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    guestIdNumber: '',
    guestAddress: '',
    specialRequests: '',
    notes: '',
    depositPaid: 0,
    paymentMethod: 'Cash'
  });
  const [availableRooms, setAvailableRooms] = useState([]);

  useEffect(() => {
    if (step === 1 && formData.checkInDate && formData.checkOutDate) {
      // Filter available rooms (simplified - in production, check against bookings)
      setAvailableRooms(rooms.filter(r => r.status === 'available'));
    }
  }, [step, formData.checkInDate, formData.checkOutDate, rooms]);

  const selectedRoom = rooms.find(r => r.id === formData.roomId);
  const nights = formData.checkInDate && formData.checkOutDate
    ? Math.max(0, Math.ceil((new Date(formData.checkOutDate) - new Date(formData.checkInDate)) / 86400000))
    : 0;
  const subtotal = selectedRoom ? selectedRoom.price_per_night * nights : 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const handleSubmit = async () => {
    if (!formData.roomId || !formData.guestName || !formData.guestPhone) {
      notify('Please fill in all required fields');
      return;
    }

    const bookingData = {
      roomId: formData.roomId,
      checkInDate: formData.checkInDate,
      checkOutDate: formData.checkOutDate,
      adults: formData.adults,
      children: formData.children,
      guestName: formData.guestName,
      guestPhone: formData.guestPhone,
      guestEmail: formData.guestEmail,
      guestIdNumber: formData.guestIdNumber,
      guestAddress: formData.guestAddress,
      roomRate: selectedRoom.price_per_night,
      extras: 0,
      discount: 0,
      total: total,
      depositPaid: Number(formData.depositPaid),
      paymentMethod: formData.paymentMethod,
      specialRequests: formData.specialRequests,
      notes: formData.notes
    };

    const { data, error } = await createBooking(storeId, bookingData, session.id, session.name);
    
    if (error) {
      notify('Failed to create booking: ' + error);
      return;
    }

    // Calculate nights for the booking object
    const createdBooking = {
      ...data,
      nights: nights,
      balance: total - Number(formData.depositPaid)
    };

    onSuccess(createdBooking, selectedRoom);
  };

  return (
    <div className="new-booking-view">
      <div className="booking-wizard-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h3>New Booking</h3>
        <div className="wizard-steps">
          <div className={`step ${step >= 1 ? 'active' : ''}`}>1. Room & Dates</div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}>2. Guest Info</div>
          <div className={`step ${step >= 3 ? 'active' : ''}`}>3. Payment</div>
        </div>
      </div>

      {step === 1 && (
        <div className="wizard-step">
          <h4>Select Room and Dates</h4>
          <div className="form-grid">
            <div className="form-field">
              <label>Check-In Date *</label>
              <input
                type="date"
                className="input"
                value={formData.checkInDate}
                min={today}
                onChange={e => setFormData({ ...formData, checkInDate: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Check-Out Date *</label>
              <input
                type="date"
                className="input"
                value={formData.checkOutDate}
                min={formData.checkInDate || today}
                onChange={e => setFormData({ ...formData, checkOutDate: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Adults *</label>
              <input
                type="number"
                className="input"
                value={formData.adults}
                min="1"
                onChange={e => setFormData({ ...formData, adults: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="form-field">
              <label>Children</label>
              <input
                type="number"
                className="input"
                value={formData.children}
                min="0"
                onChange={e => setFormData({ ...formData, children: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="available-rooms-grid">
            {availableRooms.map(room => (
              <div
                key={room.id}
                className={`room-option ${formData.roomId === room.id ? 'selected' : ''}`}
                onClick={() => setFormData({ ...formData, roomId: room.id })}
              >
                <div className="room-number">{room.room_number}</div>
                <div className="room-type">{room.room_type}</div>
                <div className="room-capacity">👥 {room.capacity}</div>
                <div className="room-price">{money(room.price_per_night)}/night</div>
              </div>
            ))}
          </div>

          <div className="wizard-footer">
            <button
              className="primary"
              disabled={!formData.roomId || nights <= 0}
              onClick={() => setStep(2)}
            >
              Next: Guest Information
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-step">
          <h4>Guest Information</h4>
          <div className="form-grid">
            <div className="form-field">
              <label>Guest Name *</label>
              <input
                type="text"
                className="input"
                value={formData.guestName}
                onChange={e => setFormData({ ...formData, guestName: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="form-field">
              <label>Phone Number *</label>
              <input
                type="tel"
                className="input"
                value={formData.guestPhone}
                onChange={e => setFormData({ ...formData, guestPhone: e.target.value })}
                placeholder="+254..."
              />
            </div>
            <div className="form-field">
              <label>Email</label>
              <input
                type="email"
                className="input"
                value={formData.guestEmail}
                onChange={e => setFormData({ ...formData, guestEmail: e.target.value })}
                placeholder="guest@example.com"
              />
            </div>
            <div className="form-field">
              <label>ID/Passport Number</label>
              <input
                type="text"
                className="input"
                value={formData.guestIdNumber}
                onChange={e => setFormData({ ...formData, guestIdNumber: e.target.value })}
              />
            </div>
            <div className="form-field full-width">
              <label>Address</label>
              <input
                type="text"
                className="input"
                value={formData.guestAddress}
                onChange={e => setFormData({ ...formData, guestAddress: e.target.value })}
              />
            </div>
            <div className="form-field full-width">
              <label>Special Requests</label>
              <textarea
                className="input"
                value={formData.specialRequests}
                onChange={e => setFormData({ ...formData, specialRequests: e.target.value })}
                rows="3"
                placeholder="E.g., late check-in, extra pillows, etc."
              />
            </div>
          </div>

          <div className="wizard-footer">
            <button className="secondary" onClick={() => setStep(1)}>← Back</button>
            <button
              className="primary"
              disabled={!formData.guestName || !formData.guestPhone}
              onClick={() => setStep(3)}
            >
              Next: Payment
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-step">
          <h4>Payment Details</h4>
          
          <div className="booking-summary">
            <h5>Booking Summary</h5>
            <div className="summary-row">
              <span>Room:</span>
              <span>{selectedRoom?.room_number} - {selectedRoom?.room_type}</span>
            </div>
            <div className="summary-row">
              <span>Guest:</span>
              <span>{formData.guestName}</span>
            </div>
            <div className="summary-row">
              <span>Check-In:</span>
              <span>{new Date(formData.checkInDate).toLocaleDateString()}</span>
            </div>
            <div className="summary-row">
              <span>Check-Out:</span>
              <span>{new Date(formData.checkOutDate).toLocaleDateString()}</span>
            </div>
            <div className="summary-row">
              <span>Nights:</span>
              <span>{nights}</span>
            </div>
            <hr />
            <div className="summary-row">
              <span>Room Rate:</span>
              <span>{money(selectedRoom?.price_per_night)}/night</span>
            </div>
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Tax ({taxRate}%):</span>
              <span>{money(tax)}</span>
            </div>
            <div className="summary-row total">
              <span>Total:</span>
              <span>{money(total)}</span>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label>Payment Method</label>
              <select
                className="input"
                value={formData.paymentMethod}
                onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
              >
                <option>Cash</option>
                <option>M-Pesa</option>
                <option>Card</option>
                <option>Bank Transfer</option>
              </select>
            </div>
            <div className="form-field">
              <label>Deposit Amount</label>
              <input
                type="number"
                className="input"
                value={formData.depositPaid}
                min="0"
                max={total}
                onChange={e => setFormData({ ...formData, depositPaid: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
            <div className="form-field full-width">
              <label>Balance Due</label>
              <div className="balance-display">{money(total - Number(formData.depositPaid))}</div>
            </div>
          </div>

          <div className="wizard-footer">
            <button className="secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="primary" onClick={handleSubmit}>
              Create Booking
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// BOOKING DETAILS VIEW
// ══════════════════════════════════════════════════════════════

function BookingDetailsView({ booking, rooms, money, onBack, onUpdate, notify, storeName = 'Hotel' }) {
  const [extras, setExtras] = useState([]);
  const [showExtrasForm, setShowExtrasForm] = useState(false);

  useEffect(() => {
    loadExtras();
  }, [booking.id]);

  async function loadExtras() {
    const data = await fetchBookingExtras(booking.id);
    setExtras(data);
  }

  const handleCheckIn = async () => {
    const error = await checkInBooking(booking.id);
    if (error) {
      notify('Failed to check in');
      return;
    }
    notify('✓ Guest checked in');
    
    // Share check-in confirmation PDF
    if (booking.guest_phone && window.confirm('Share check-in confirmation PDF?')) {
      const room = rooms.find(r => r.id === booking.room_id);
      shareBookingConfirmationPDF({ booking: { ...booking, booking_number: booking.booking_number }, room, storeName, storePhone: '' });
    }
    
    onUpdate();
  };

  const handleCheckOut = async () => {
    const error = await checkOutBooking(booking.id);
    if (error) {
      notify('Failed to check out');
      return;
    }
    notify('✓ Guest checked out');
    
    // Share check-out receipt PDF
    if (booking.guest_phone && window.confirm('Share check-out receipt PDF?')) {
      const room = rooms.find(r => r.id === booking.room_id);
      shareCheckOutReceiptPDF({ booking, room, storeName, storePhone: '', extras });
    }
    
    onUpdate();
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this booking?')) return;
    
    const error = await cancelBooking(booking.id);
    if (error) {
      notify('Failed to cancel booking');
      return;
    }
    notify('✓ Booking cancelled');
    onUpdate();
  };

  const handleResendConfirmation = () => {
    if (!booking.guest_phone) {
      notify('No phone number available');
      return;
    }
    const room = rooms.find(r => r.id === booking.room_id);
    shareBookingConfirmationPDF({ booking, room, storeName, storePhone: '' });
    notify('✓ Opening PDF to share...');
  };

  const room = rooms.find(r => r.id === booking.room_id);
  const extrasTotal = extras.reduce((sum, e) => sum + Number(e.total || 0), 0);
  const grandTotal = Number(booking.total || 0) + extrasTotal;

  return (
    <div className="booking-details-view">
      <div className="details-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h3>Booking Details</h3>
        <div className="header-actions">
          {booking.guest_phone && (
            <button className="btn-whatsapp" onClick={handleResendConfirmation} title="Send confirmation via WhatsApp">
              📱 Send WhatsApp
            </button>
          )}
          {booking.booking_status === 'confirmed' && (
            <button className="btn-check-in" onClick={handleCheckIn}>
              Check In
            </button>
          )}
          {booking.booking_status === 'checked_in' && (
            <button className="btn-check-out" onClick={handleCheckOut}>
              Check Out
            </button>
          )}
          {(booking.booking_status === 'confirmed' || booking.booking_status === 'checked_in') && (
            <button className="btn-cancel" onClick={handleCancel}>
              Cancel Booking
            </button>
          )}
        </div>
      </div>

      <div className="details-content">
        <div className="details-section">
          <h4>Booking Information</h4>
          <div className="info-grid">
            <div className="info-item">
              <label>Booking Number</label>
              <div>{booking.booking_number}</div>
            </div>
            <div className="info-item">
              <label>Status</label>
              <div className="status-badge">{booking.booking_status}</div>
            </div>
            <div className="info-item">
              <label>Room</label>
              <div>{room?.room_number} - {room?.room_type}</div>
            </div>
            <div className="info-item">
              <label>Check-In</label>
              <div>{new Date(booking.check_in_date).toLocaleDateString()}</div>
            </div>
            <div className="info-item">
              <label>Check-Out</label>
              <div>{new Date(booking.check_out_date).toLocaleDateString()}</div>
            </div>
            <div className="info-item">
              <label>Nights</label>
              <div>{booking.nights}</div>
            </div>
          </div>
        </div>

        <div className="details-section">
          <h4>Guest Information</h4>
          <div className="info-grid">
            <div className="info-item">
              <label>Name</label>
              <div>{booking.guest_name}</div>
            </div>
            <div className="info-item">
              <label>Phone</label>
              <div>{booking.guest_phone}</div>
            </div>
            <div className="info-item">
              <label>Email</label>
              <div>{booking.guest_email || 'N/A'}</div>
            </div>
            <div className="info-item">
              <label>ID Number</label>
              <div>{booking.guest_id_number || 'N/A'}</div>
            </div>
          </div>
        </div>

        <div className="details-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4>Extras & Charges</h4>
            {booking.booking_status === 'checked_in' && (
              <button className="btn-add-extra" onClick={() => setShowExtrasForm(true)}>
                + Add Charge
              </button>
            )}
          </div>
          {extras.length > 0 ? (
            <table className="extras-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Amount</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {extras.map(extra => (
                  <tr key={extra.id}>
                    <td>{extra.description}</td>
                    <td>{extra.category || '-'}</td>
                    <td>{extra.quantity}</td>
                    <td>{money(extra.amount)}</td>
                    <td>{money(extra.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>No extra charges</p>
          )}
        </div>

        <div className="details-section">
          <h4>Payment Summary</h4>
          <div className="payment-summary">
            <div className="payment-row">
              <span>Room Charges</span>
              <span>{money(booking.subtotal)}</span>
            </div>
            <div className="payment-row">
              <span>Extras</span>
              <span>{money(extrasTotal)}</span>
            </div>
            <div className="payment-row">
              <span>Discount</span>
              <span>-{money(booking.discount)}</span>
            </div>
            <hr />
            <div className="payment-row total">
              <span>Grand Total</span>
              <span>{money(grandTotal)}</span>
            </div>
            <div className="payment-row">
              <span>Paid</span>
              <span>{money(booking.deposit_paid)}</span>
            </div>
            <div className="payment-row balance">
              <span>Balance Due</span>
              <span>{money(grandTotal - Number(booking.deposit_paid))}</span>
            </div>
          </div>
        </div>
      </div>

      {showExtrasForm && (
        <ExtraChargeModal
          bookingId={booking.id}
          onSave={() => {
            loadExtras();
            setShowExtrasForm(false);
            notify('✓ Charge added');
          }}
          onClose={() => setShowExtrasForm(false)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════════

function RoomFormModal({ room, onSave, onClose }) {
  const [formData, setFormData] = useState(room || {
    roomNumber: '',
    roomName: '',
    roomType: 'double',
    floor: 1,
    capacity: 2,
    pricePerNight: 5000,
    description: '',
    amenities: []
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('📝 Form submitted with data:', formData);
    console.log('📝 Room Number:', formData.roomNumber);
    console.log('📝 Room Type:', formData.roomType);
    console.log('📝 Price:', formData.pricePerNight);
    console.log('📝 Capacity:', formData.capacity);
    onSave(formData);
  };

  const availableAmenities = ['wifi', 'tv', 'ac', 'minibar', 'balcony', 'jacuzzi', 'kitchenette', 'safe', 'desk', 'phone'];

  const toggleAmenity = (amenity) => {
    const amenities = formData.amenities || [];
    if (amenities.includes(amenity)) {
      setFormData({ ...formData, amenities: amenities.filter(a => a !== amenity) });
    } else {
      setFormData({ ...formData, amenities: [...amenities, amenity] });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{room ? 'Edit Room' : 'Add New Room'}</h3>
          <button onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-field">
                <label>Room Number *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.roomNumber || formData.room_number || ''}
                  onChange={e => setFormData({ ...formData, roomNumber: e.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Room Name</label>
                <input
                  type="text"
                  className="input"
                  value={formData.roomName || formData.room_name || ''}
                  onChange={e => setFormData({ ...formData, roomName: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Room Type *</label>
                <select
                  className="input"
                  value={formData.roomType || formData.room_type || 'double'}
                  onChange={e => setFormData({ ...formData, roomType: e.target.value })}
                  required
                >
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="suite">Suite</option>
                  <option value="deluxe">Deluxe</option>
                  <option value="family">Family</option>
                  <option value="presidential">Presidential</option>
                </select>
              </div>
              <div className="form-field">
                <label>Floor</label>
                <input
                  type="number"
                  className="input"
                  value={formData.floor || 1}
                  onChange={e => setFormData({ ...formData, floor: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-field">
                <label>Capacity *</label>
                <input
                  type="number"
                  className="input"
                  value={formData.capacity || 2}
                  min="1"
                  onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Price per Night *</label>
                <input
                  type="number"
                  className="input"
                  value={formData.pricePerNight || formData.price_per_night || 0}
                  min="0"
                  onChange={e => setFormData({ ...formData, pricePerNight: parseFloat(e.target.value) })}
                  required
                />
              </div>
              <div className="form-field full-width">
                <label>Description</label>
                <textarea
                  className="input"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="form-field full-width">
                <label>Amenities</label>
                <div className="amenities-grid">
                  {availableAmenities.map(amenity => (
                    <label key={amenity} className="amenity-checkbox">
                      <input
                        type="checkbox"
                        checked={(formData.amenities || []).includes(amenity)}
                        onChange={() => toggleAmenity(amenity)}
                      />
                      <span>{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">
              {room ? 'Update Room' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExtraChargeModal({ bookingId, onSave, onClose }) {
  const [formData, setFormData] = useState({
    description: '',
    category: 'room_service',
    amount: 0,
    quantity: 1
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { error } = await addBookingExtra(bookingId, formData);
    if (error) {
      alert('Failed to add charge');
      return;
    }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Extra Charge</h3>
          <button onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-field">
              <label>Description *</label>
              <input
                type="text"
                className="input"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Category</label>
              <select
                className="input"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="room_service">Room Service</option>
                <option value="minibar">Minibar</option>
                <option value="laundry">Laundry</option>
                <option value="restaurant">Restaurant</option>
                <option value="spa">Spa</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-field">
              <label>Quantity *</label>
              <input
                type="number"
                className="input"
                value={formData.quantity}
                min="1"
                onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                required
              />
            </div>
            <div className="form-field">
              <label>Amount *</label>
              <input
                type="number"
                className="input"
                value={formData.amount}
                min="0"
                step="0.01"
                onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                required
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">Add Charge</button>
          </div>
        </form>
      </div>
    </div>
  );
}
