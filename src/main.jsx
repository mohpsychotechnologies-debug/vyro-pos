import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './public-site.css';
import PublicSite from './PublicSite';
import BarcodeScanner from './BarcodeScanner';
import { Restaurant, KitchenDisplay } from './Restaurant';
import RoomBookings from './RoomBookings';
import { BarChart, LineChart, DonutChart, HBarChart, KpiCard, Sparkline } from './Charts';
import {
  supabase, loginUser, logActivity, setSessionContext,
  fetchAllStores, createStore, updateStore, suspendStore,
  fetchAllUsers, fetchStoreUsers, createUser, updateUser, dismissUser, reinstateUser, resetUserPin, resetUserPassword, deleteUser, adminUpdateUserEmail, userUpdateCredentials,
  fetchActivityLog, fetchAllSales, deleteLogEntry, clearActivityLog,
  fetchTable, saveProduct as sbSaveProduct, saveSale, deleteRow, upsertRow,
  fetchCategories, addCategory as sbAddCategory, deleteCategory as sbDeleteCategory,
  getSubscriptionStats, getSubscriptionPlans, getPaymentConfig, updatePaymentConfig,
  requestSubscriptionRenewal, getPendingPayments, approvePayment, rejectPayment,
  getStorePaymentHistory, getAllPayments, checkCashierLimit, updateSubscription,
  fetchSubscriptionRequests,
  fetchRestaurantOrders, fetchBookings, fetchRooms,
  saveMpesaCredentials, getMpesaCredentials, getMpesaTransactions, getMpesaStats,
} from './supabase';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
const isoDate  = d => { try { const dt = d instanceof Date ? d : new Date(d); if (isNaN(dt.getTime())) return ''; return dt.toISOString().split('T')[0]; } catch { return ''; } };
const today    = () => isoDate(new Date());
const money    = (n, sym = 'KSh') => `${sym} ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const genBarcode = () => '6' + String(Date.now()).slice(-12).padStart(12, '0');
const uid      = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

// localStorage helpers — session (unscoped) vs store data (scoped by storeId)
const lsGet     = (k, fb)          => { try { const v = localStorage.getItem(`vyro-${k}`);            return v !== null ? JSON.parse(v) : fb; } catch { return fb; } };
const lsSet     = (k, v)           => { try { localStorage.setItem(`vyro-${k}`,            JSON.stringify(v)); } catch {} };
const lsGetS    = (sid, k, fb)     => { try { const v = localStorage.getItem(`vyro-${sid}-${k}`);     return v !== null ? JSON.parse(v) : fb; } catch { return fb; } };
const lsSetS    = (sid, k, v)      => { try { localStorage.setItem(`vyro-${sid}-${k}`,     JSON.stringify(v)); } catch {} };
const lsClearS  = sid              => { ['products','categories','sales','customers','suppliers','purchases','expenses','settings'].forEach(k => localStorage.removeItem(`vyro-${sid}-${k}`)); };

/* ─────────────────────────────────────────────────────────────
   AUDIO FEEDBACK
───────────────────────────────────────────────────────────── */
function playBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 1200; // High pitch for success
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
  } catch (error) {
    console.warn('Audio beep failed:', error);
  }
}

function playErrorBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 400; // Low pitch for error
    oscillator.type = 'square';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.warn('Audio error beep failed:', error);
  }
}

/* ─────────────────────────────────────────────────────────────
   PAGINATION
───────────────────────────────────────────────────────────── */
function usePagination(items, pageSize = 20) {
  const [page, setPage] = useState(1);
  // Reset to page 1 whenever the item list changes (filter/search applied)
  useEffect(() => { setPage(1); }, [items.length]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start      = (page - 1) * pageSize;
  const slice      = items.slice(start, start + pageSize);
  return { slice, page, setPage, totalPages, total: items.length, start, end: start + slice.length };
}

function Pagination({ page, totalPages, total, start, end, setPage }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  return (
    <div className="pagination">
      <span className="pg-info">Showing {start + 1}–{end} of {total}</span>
      <div className="pg-controls">
        <button className="pg-btn" disabled={page === 1}            onClick={() => setPage(p => p - 1)}>‹ Prev</button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="pg-ellipsis">…</span>
            : <button key={p} className={`pg-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
        )}
        <button className="pg-btn" disabled={page === totalPages}   onClick={() => setPage(p => p + 1)}>Next ›</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEED DATA (used when Supabase not configured)
───────────────────────────────────────────────────────────── */
const seedCategories = ['Drinks','Bakery','Snacks','Dairy','Hot drinks','Personal care','Household','Stationery'];
const seedProducts = [
  { id:'p1', name:'Bottled Water',  brand:'Keringet',    category:'Drinks',    price:50,  barcode:'615123450001', icon:'💧', stock:100, low_stock:10 },
  { id:'p2', name:'Soda 500ml',     brand:'Coca-Cola',   category:'Drinks',    price:100, barcode:'615123450002', icon:'🥤', stock:80,  low_stock:10 },
  { id:'p3', name:'White Bread',    brand:'Supa Loaf',   category:'Bakery',    price:75,  barcode:'615123450004', icon:'🍞', stock:30,  low_stock:5  },
  { id:'p4', name:'Milk 500ml',     brand:'Brookside',   category:'Dairy',     price:70,  barcode:'615123450008', icon:'🥛', stock:20,  low_stock:5  },
  { id:'p5', name:'Coffee',         brand:'Nescafé',     category:'Hot drinks',price:180, barcode:'615123450010', icon:'☕', stock:15,  low_stock:3  },
];
const seedSettings = {
  storeName:'Vyro Store', storeAddress:'Nairobi, Kenya', storePhone:'+254 700 000000',
  taxRate:16, currency:'KSh',
  loyaltySpend:1000,  // KSh required to earn 1 point
  loyaltyRedeem:100,  // points needed to redeem KSh 1
  loyaltyMinRedeem:100, // minimum points before redemption is allowed
  darkMode:false,
};

/* ─────────────────────────────────────────────────────────────
   NAV CONFIG
   Format: [id, icon, label, allowed_roles, allowed_business_types]
   null = available for all business types
───────────────────────────────────────────────────────────── */
const NAV = [
  ['dashboard',    '▦', 'Dashboard',      ['superadmin','manager','cashier'], null],
  ['pos',          '▣', 'Point of sale',  ['manager','cashier'], ['retail','pharmacy','electronics','fashion','hardware','beauty','auto','bookshop','other']],
  ['restaurant',   '🍽', 'Restaurant',     ['manager','cashier'], ['hotel']],
  ['rooms',        '🏨', 'Room Bookings', ['manager','cashier'], ['hotel']],
  ['kitchen',      '👨‍🍳', 'Kitchen',        ['manager','cashier'], ['hotel']],
  ['sales',        '↗', 'Sales',          ['manager','cashier'], ['retail','pharmacy','electronics','fashion','hardware','beauty','auto','bookshop','other']],
  ['products',     '☰', 'Products',       ['manager'], null],
  ['purchases',    '▤', 'Purchases',      ['manager'], ['retail','pharmacy','electronics','fashion','hardware','beauty','auto','bookshop','other']],
  ['customers',    '♙', 'Customers',      ['manager','cashier'], null],
  ['suppliers',    '♧', 'Suppliers',      ['manager'], ['retail','pharmacy','electronics','fashion','hardware','beauty','auto','bookshop','other']],
  ['payments',     '◉', 'Payments',       ['manager'], null],
  ['expenses',     '▤', 'Expenses',       ['manager'], null],
  ['reports',      '▥', 'Reports',        ['manager'], null],
  ['subscription', '💳', 'Subscription',  ['manager'], null],
  ['admin',        '🛡', 'Admin panel',    ['superadmin'], null],
  ['settings',     '⚙', 'Settings',       ['manager'], null],
];

/* ─────────────────────────────────────────────────────────────
   WHATSAPP UTILITIES
───────────────────────────────────────────────────────────── */
function sendWhatsApp(phone, message) {
  // Remove non-digits and ensure it starts with country code
  const cleanPhone = phone.replace(/\D/g, '');
  // If starts with 0, replace with 254 (Kenya)
  const intlPhone = cleanPhone.startsWith('0') ? '254' + cleanPhone.slice(1) : cleanPhone;
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${intlPhone}?text=${encoded}`, '_blank');
}

function formatCredentialsMessage(businessName, ownerName, email, password, plan) {
  return `🎉 *Welcome to Vyro POS!*

Your subscription request has been approved.

*Business:* ${businessName}
*Plan:* ${plan}

*Login Credentials:*
📧 Email: ${email}
🔑 Password: ${password}

*Login here:* ${window.location.origin}/login

⚠️ *Please change your password after first login*

Need help? Reply to this message.`;
}

function formatReminderMessage(storeName, daysLeft, planName) {
  return `⏰ *Subscription Reminder - Vyro POS*

Hi ${storeName},

Your ${planName} subscription expires in *${daysLeft} day${daysLeft !== 1 ? 's' : ''}*.

To avoid interruption, please renew your subscription.

*Login to renew:* ${window.location.origin}/login

Questions? Reply to this message.`;
}

function formatBookingConfirmation(booking, room, storeName) {
  const checkIn = new Date(booking.check_in_date).toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
  const checkOut = new Date(booking.check_out_date).toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });

  return `🏨 *Booking Confirmation*

Dear ${booking.guest_name},

Your room booking at *${storeName}* has been confirmed! ✅

*Booking Details:*
📋 Booking #: ${booking.booking_number}
🚪 Room: ${room?.room_number || 'N/A'} (${room?.room_type || 'N/A'})
📅 Check-in: ${checkIn}
📅 Check-out: ${checkOut}
🌙 Nights: ${booking.nights}
👥 Guests: ${booking.adults} adult(s)${booking.children ? `, ${booking.children} children` : ''}

*Payment Summary:*
💵 Total: KSh ${Number(booking.total || 0).toLocaleString()}
✅ Paid: KSh ${Number(booking.deposit_paid || 0).toLocaleString()}
${booking.balance > 0 ? `⚠️ Balance: KSh ${Number(booking.balance || 0).toLocaleString()}` : ''}

${booking.special_requests ? `*Special Requests:*
📝 ${booking.special_requests}

` : ''}*Important:*
• Check-in: 2:00 PM
• Check-out: 11:00 AM
• Bring valid ID

We look forward to welcoming you! 🎉

*${storeName}*`;
}

/* ─────────────────────────────────────────────────────────────
   ROOT APP
───────────────────────────────────────────────────────────── */
function App() {
  const [session,    setSession]    = useState(() => lsGet('session', null));
  const [page,       setPage]       = useState('dashboard');
  // Initialize view based on URL path
  const [view, setView] = useState(() => {
    const path = window.location.pathname.replace('/', '').toLowerCase();
    if (path === 'login') return 'login';
    return 'site';
  });
  const [settings,   setSettings]   = useState(() => lsGet('settings', seedSettings));

  // Store data — start empty; populated by loadStoreData after login (scoped per store)
  // Store data — load from scoped localStorage (with migration from old unscoped keys)
  const [products,   setProducts]   = useState(() => { const sid=lsGet('session',null)?.store_id; return sid?lsGetS(sid,'products',lsGet('products',seedProducts)):lsGet('products',seedProducts); });
  const [categories, setCategories] = useState(() => { const sid=lsGet('session',null)?.store_id; return sid?lsGetS(sid,'categories',lsGet('categories',seedCategories)):lsGet('categories',seedCategories); });
  const [restaurantCategories, setRestaurantCategories] = useState(() => { const sid=lsGet('session',null)?.store_id; return sid?lsGetS(sid,'restaurant_categories',lsGet('restaurant_categories',[])):lsGet('restaurant_categories',[]); });
  const [sales,      setSales]      = useState(() => { const sid=lsGet('session',null)?.store_id; return sid?lsGetS(sid,'sales',lsGet('sales',[])):lsGet('sales',[]); });
  const [customers,  setCustomers]  = useState(() => { const sid=lsGet('session',null)?.store_id; return sid?lsGetS(sid,'customers',lsGet('customers',[])):lsGet('customers',[]); });
  const [suppliers,  setSuppliers]  = useState(() => { const sid=lsGet('session',null)?.store_id; return sid?lsGetS(sid,'suppliers',lsGet('suppliers',[])):lsGet('suppliers',[]); });
  const [purchases,  setPurchases]  = useState(() => { const sid=lsGet('session',null)?.store_id; return sid?lsGetS(sid,'purchases',lsGet('purchases',[])):lsGet('purchases',[]); });
  const [expenses,   setExpenses]   = useState(() => { const sid=lsGet('session',null)?.store_id; return sid?lsGetS(sid,'expenses',lsGet('expenses',[])):lsGet('expenses',[]); });
  
  // Hotel/Restaurant data
  const [restaurantOrders, setRestaurantOrders] = useState([]);
  const [roomBookings, setRoomBookings] = useState([]);
  const [rooms, setRooms] = useState([]);

  // Cart state
  const [cart,       setCart]       = useState([]);
  const [discount,   setDiscount]   = useState(0);   // percentage discount
  const [redeemPts,  setRedeemPts]  = useState(false); // redeem loyalty points
  const [category,   setCategory]   = useState('All');
  const [query,      setQuery]      = useState('');

  // UI state
  const [toast,      setToast]      = useState('');
  const [modal,      setModal]      = useState(null);
  const [receipt,    setReceipt]    = useState(null);
  const [loading,    setLoading]    = useState(false);

  const role    = session?.role || '';
  const storeId = session?.store_id || null;
  const sym     = settings.currency;
  const taxRate = settings.taxRate / 100;
  const fmt     = n => money(n, sym);

  // ── Dark mode ──────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.darkMode ? 'dark' : 'light');
  }, [settings.darkMode]);

  // ── Load store data from Supabase after login ──────────────
  useEffect(() => {
    if (!session || role === 'superadmin' || !supabase) return;
    loadStoreData();
  }, [session]);

  // ── Keep restaurantOrders live via Realtime (for nav badges) ──
  useEffect(() => {
    const isHotel = (session?.businessType || 'retail') === 'hotel';
    if (!session || !storeId || !supabase || !isHotel) return;

    const refreshOrders = async () => {
      const fresh = await fetchRestaurantOrders(storeId).catch(() => null);
      if (fresh) setRestaurantOrders(fresh);
    };

    const channel = supabase
      .channel(`app-restaurant-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_orders' }, refreshOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_order_items' }, refreshOrders)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.store_id]);

  const loadStoreData = async () => {
    if (!storeId) return;

    // Offline mode (no Supabase): load from scoped localStorage, migrating from old unscoped keys
    if (!supabase) {
      const mp = lsGetS(storeId, 'products', lsGet('products', seedProducts));
      const mc = lsGetS(storeId, 'categories', lsGet('categories', seedCategories));
      const ms = lsGetS(storeId, 'sales', lsGet('sales', []));
      const mcu = lsGetS(storeId, 'customers', lsGet('customers', []));
      const msp = lsGetS(storeId, 'suppliers', lsGet('suppliers', []));
      const mpu = lsGetS(storeId, 'purchases', lsGet('purchases', []));
      const me = lsGetS(storeId, 'expenses', lsGet('expenses', []));
      setProducts(mp); setCategories(mc); setSales(ms); setCustomers(mcu);
      setSuppliers(msp); setPurchases(mpu); setExpenses(me);
      return;
    }

    // ── CRITICAL: set RLS session context BEFORE any reads or writes ──
    // All RLS policies check current_store_id() / current_user_role()
    // which are set by this call. Without it every query returns empty / is rejected.
    await setSessionContext(storeId, role);

    // Online mode: fetch from Supabase, merge with localStorage, push up if needed
    setLoading(true);
    try {
      const isHotelStore = (session?.businessType || 'retail') === 'hotel';
      const [prods, salesData, custsData, suppData, purchData, expData, catNames, restCatNames, restOrders, bookings, roomsData] = await Promise.all([
        fetchTable('products',   storeId),
        fetchTable('sales',      storeId),
        fetchTable('customers',  storeId),
        fetchTable('suppliers',  storeId),
        fetchTable('purchases',  storeId),
        fetchTable('expenses',   storeId),
        fetchCategories(storeId, 'retail'),
        fetchCategories(storeId, 'restaurant'),
        isHotelStore ? fetchRestaurantOrders(storeId).catch(() => []) : Promise.resolve([]),
        isHotelStore ? fetchBookings(storeId).catch(() => []) : Promise.resolve([]),
        isHotelStore ? fetchRooms(storeId).catch(() => []) : Promise.resolve([]),
      ]);

      const mapProduct = r => ({ ...r, lowStock: r.low_stock });
      const mapSale    = r => ({ ...r, isoDate: r.sale_date, customer: r.customer_name, cashier: r.cashier_name, items: r.items || [] });

      // ── Products ──
      if (prods.length > 0) {
        const p = prods.map(mapProduct);
        lsSetS(storeId, 'products', p); setProducts(p);
      } else {
        // Supabase empty — push localStorage data up
        const local = lsGetS(storeId, 'products', lsGet('products', []));
        if (local.length > 0) {
          setProducts(local);
          for (const p of local) {
            const { lowStock: _ls, isoDate: _i, date: _d, ...dbRow } = p;
            await upsertRow('products', { ...dbRow, low_stock: p.low_stock || p.lowStock || 5 });
          }
        }
      }

      // ── Sales ──
      if (salesData.length > 0) {
        const s = salesData.map(mapSale);
        lsSetS(storeId, 'sales', s); setSales(s);
      } else {
        const local = lsGetS(storeId, 'sales', lsGet('sales', []));
        if (local.length > 0) {
          setSales(local);
          for (const s of local) {
            await saveSale({ id: s.id, store_id: storeId, cashier_id: s.cashierId || null, cashier_name: s.cashier, customer_name: s.customer, customer_id: s.customerId || null, method: s.method, subtotal: s.sub || s.subtotal || 0, discount: s.discount || 0, tax: s.tax || 0, total: s.total, items: s.items || [], loyalty_earned: s.loyaltyEarned || 0, sale_date: s.isoDate || today() });
          }
        }
      }

      // ── Customers ──
      if (custsData.length > 0) {
        lsSetS(storeId, 'customers', custsData); setCustomers(custsData);
      } else {
        const local = lsGetS(storeId, 'customers', lsGet('customers', []));
        if (local.length > 0) {
          setCustomers(local);
          for (const c of local) {
            await upsertRow('customers', { id: c.id, store_id: storeId, name: c.name, phone: c.phone || null, points: c.points || 0 });
          }
        }
      }

      // ── Suppliers ──
      if (suppData.length > 0) {
        lsSetS(storeId, 'suppliers', suppData); setSuppliers(suppData);
      } else {
        const local = lsGetS(storeId, 'suppliers', lsGet('suppliers', []));
        if (local.length > 0) {
          setSuppliers(local);
          for (const s of local) {
            await upsertRow('suppliers', { id: s.id, store_id: storeId, name: s.name, phone: s.phone || null, email: s.email || null, address: s.address || null });
          }
        }
      }

      // ── Purchases ──
      if (purchData.length > 0) {
        lsSetS(storeId, 'purchases', purchData); setPurchases(purchData);
      } else {
        const local = lsGetS(storeId, 'purchases', lsGet('purchases', []));
        if (local.length > 0) {
          setPurchases(local);
          for (const p of local) {
            await upsertRow('purchases', { id: p.id, store_id: storeId, supplier_name: p.supplier || p.supplier_name || null, product_id: p.productId || p.product_id || null, product_name: p.productName || p.product_name || null, qty: +p.qty || 0, cost: +p.cost || 0, note: p.note || null, purchase_date: p.isoDate || today() });
          }
        }
      }

      // ── Expenses ──
      if (expData.length > 0) {
        lsSetS(storeId, 'expenses', expData); setExpenses(expData);
      } else {
        const local = lsGetS(storeId, 'expenses', lsGet('expenses', []));
        if (local.length > 0) {
          setExpenses(local);
          for (const e of local) {
            await upsertRow('expenses', { id: e.id, store_id: storeId, category: e.category, note: e.note || null, amount: +e.amount || 0, expense_date: e.isoDate || today() });
          }
        }
      }

      // ── Categories (Retail) ──
      if (catNames.length > 0) {
        lsSetS(storeId, 'categories', catNames); setCategories(catNames);
      } else {
        const local = lsGetS(storeId, 'categories', lsGet('categories', seedCategories));
        if (local.length > 0) {
          setCategories(local);
          for (const name of local) {
            await sbAddCategory(storeId, name, 'retail');
          }
        }
      }

      // ── Categories (Restaurant) ──
      if (restCatNames.length > 0) {
        lsSetS(storeId, 'restaurant_categories', restCatNames); setRestaurantCategories(restCatNames);
      } else {
        const local = lsGetS(storeId, 'restaurant_categories', lsGet('restaurant_categories', []));
        if (local.length > 0) {
          setRestaurantCategories(local);
          for (const name of local) {
            await sbAddCategory(storeId, name, 'restaurant');
          }
        }
      }

      // ── Restaurant Orders ──
      if (restOrders && restOrders.length > 0) {
        setRestaurantOrders(restOrders);
      }

      // ── Room Bookings ──
      if (bookings && bookings.length > 0) {
        setRoomBookings(bookings);
      }

      // ── Rooms ──
      if (roomsData && roomsData.length > 0) {
        setRooms(roomsData);
      }

    } catch (e) {
      console.warn('Load error:', e);
      // On any error, fall back to localStorage so UI isn't empty
      const p = lsGetS(storeId, 'products', lsGet('products', seedProducts));
      const c = lsGetS(storeId, 'categories', lsGet('categories', seedCategories));
      const s = lsGetS(storeId, 'sales', lsGet('sales', []));
      const cu = lsGetS(storeId, 'customers', lsGet('customers', []));
      const su = lsGetS(storeId, 'suppliers', lsGet('suppliers', []));
      const pu = lsGetS(storeId, 'purchases', lsGet('purchases', []));
      const ex = lsGetS(storeId, 'expenses', lsGet('expenses', []));
      setProducts(p); setCategories(c); setSales(s);
      setCustomers(cu); setSuppliers(su); setPurchases(pu); setExpenses(ex);
    }
    setLoading(false);
  };

  // ── Persist helper (store-scoped) ──────────────────────────
  const persist = (key, value, setter) => {
    if (storeId && key !== 'session' && key !== 'settings') {
      lsSetS(storeId, key, value);
    } else {
      lsSet(key, value);
    }
    setter(value);
  };

  // ── Notifications ──────────────────────────────────────────
  const notify = useCallback(t => { setToast(t); setTimeout(() => setToast(''), 2800); }, []);

  // ── Cart ───────────────────────────────────────────────────
  const total     = list => list.reduce((s, i) => s + Number(i.total ?? i.amount ?? i.cost ?? 0), 0);
  const sub       = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discAmt   = sub * (discount / 100);
  const taxAmt    = (sub - discAmt) * taxRate;
  const grand     = sub - discAmt + taxAmt;

  const addToCart = id => setCart(c => {
    const p = products.find(x => x.id === id);
    if (!p) return c;
    if ((p.stock ?? Infinity) <= 0) { notify(`"${p.name}" is out of stock.`); return c; }
    const found = c.find(x => x.id === id);
    return found ? c.map(x => x.id === id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...p, qty: 1 }];
  });

  // ── Checkout ───────────────────────────────────────────────
  const checkout = async (method, customerId) => {
    if (!cart.length) return;
    const customer = customers.find(c => c.id === customerId) || null;
    const loyaltySpend   = settings.loyaltySpend   || 1000; // KSh per point
    const loyaltyRedeem  = settings.loyaltyRedeem  || 100;  // points per KSh 1
    const loyaltyMin     = settings.loyaltyMinRedeem || 100;

    // Points earned this sale: 1 point per loyaltySpend KSh
    const loyaltyEarned = Math.floor(grand / loyaltySpend);

    // Loyalty redemption discount
    const currentPoints  = customer?.points || 0;
    const canRedeem      = redeemPts && customer && currentPoints >= loyaltyMin;
    const pointsUsed     = canRedeem ? currentPoints : 0;
    const loyaltyDiscount = canRedeem ? Math.floor(currentPoints / loyaltyRedeem) : 0; // KSh value
    const finalTotal     = Math.max(0, grand - loyaltyDiscount);

    const saleObj = {
      id: uid(), isoDate: today(), date: new Date().toLocaleString('en-KE'),
      customer: customer?.name || 'Walk-in customer',
      customerId: customer?.id || null,
      method, sub, discount: discAmt, tax: taxAmt, total: finalTotal,
      loyaltyDiscount, pointsUsed,
      items: cart, cashier: session?.name || 'Cashier',
      cashierId: session?.userId, loyaltyEarned,
    };

    // Deduct stock
    const updatedProducts = products.map(p => {
      const ci = cart.find(x => x.id === p.id);
      return ci ? { ...p, stock: Math.max(0, (p.stock || 0) - ci.qty) } : p;
    });

    // Update customer points
    let updatedCustomers = customers;
    if (customer) {
      const newPoints = Math.max(0, currentPoints - pointsUsed) + loyaltyEarned;
      updatedCustomers = customers.map(c =>
        c.id === customer.id ? { ...c, points: newPoints } : c
      );
      persist('customers', updatedCustomers, setCustomers);
    }

    persist('sales',    [saleObj, ...sales],    setSales);
    persist('products', updatedProducts,        setProducts);
    setCart([]); setDiscount(0); setRedeemPts(false);
    setReceipt(saleObj);
    notify(`Sale completed!${loyaltyDiscount > 0 ? ` KSh ${loyaltyDiscount} loyalty discount applied.` : ''}`);

    // Sync to Supabase
    if (supabase && storeId) {
      await saveSale({
        store_id: storeId, cashier_id: session?.userId, cashier_name: session?.name,
        customer_name: saleObj.customer, customer_id: saleObj.customerId,
        method, subtotal: sub, discount: discAmt, tax: taxAmt, total: finalTotal,
        items: cart, loyalty_earned: loyaltyEarned, sale_date: today(),
      });
      for (const p of updatedProducts) {
        const ci = cart.find(x => x.id === p.id);
        if (ci) await upsertRow('products', { id: p.id, stock: p.stock, store_id: storeId });
      }
      await logActivity(storeId, session?.userId, session?.name, role, 'sale',
        `${fmt(finalTotal)} via ${method}${loyaltyDiscount > 0 ? ` (${pointsUsed} pts redeemed)` : ''}`);
    }
  };

  // ── Save product ───────────────────────────────────────────
  const saveProduct = async (data, editId) => {
    const coerced = { ...data, price: +data.price, stock: +data.stock || 0, low_stock: +data.lowStock || 5, lowStock: +data.lowStock || 5, icon: data.icon || '🏷️', store_id: storeId };
    // Strip frontend-only camelCase aliases before sending to Postgres
    const { lowStock: _lsAlias, isoDate: _iso, date: _date, ...dbRow } = coerced;
    if (editId) {
      const updated = products.map(p => p.id === editId ? { ...p, ...coerced } : p);
      persist('products', updated, setProducts);
      if (supabase && storeId) {
        const err = await upsertRow('products', { ...dbRow, id: editId });
        if (err) notify(`⚠ Sync failed: ${err}`);
      }
      notify('Product updated.');
    } else {
      const newP = { ...coerced, id: uid() };
      const { lowStock: _ls2, ...newDbRow } = newP;
      persist('products', [newP, ...products], setProducts);
      if (supabase && storeId) {
        const err = await upsertRow('products', newDbRow);
        if (err) notify(`⚠ Sync failed: ${err}`);
      }
      notify('Product added.');
    }
    if (supabase && storeId) await logActivity(storeId, session?.userId, session?.name, role, editId ? 'product_edit' : 'product_add', data.name);
    setModal(null);
  };

  const deleteProduct = async id => {
    if (!window.confirm('Delete this product?')) return;
    persist('products', products.filter(p => p.id !== id), setProducts);
    if (supabase) await deleteRow('products', id);
    notify('Product deleted.');
  };

  // ── Save record (customer / supplier / purchase / expense) ─
  const saveRecord = async (type, data) => {
    const item = { ...data, id: uid(), date: new Date().toLocaleDateString('en-KE'), isoDate: today(), store_id: storeId };
    const maps = {
      customer: [customers, setCustomers],
      supplier: [suppliers, setSuppliers],
      purchase: [purchases, setPurchases],
      expense:  [expenses,  setExpenses],
    };
    if (type === 'purchase' && data.productId && +data.qty > 0) {
      const updated = products.map(p => p.id === data.productId ? { ...p, stock: (p.stock || 0) + +data.qty } : p);
      persist('products', updated, setProducts);
      if (supabase) {
        const p = updated.find(x => x.id === data.productId);
        if (p) await upsertRow('products', { id: p.id, stock: p.stock, store_id: storeId });
      }
    }
    const [list, set] = maps[type];
    persist(`${type}s`, [item, ...list], set);

    if (supabase && storeId) {
      const tableMap = { customer:'customers', supplier:'suppliers', purchase:'purchases', expense:'expenses' };
      let dbRow;
      if (type === 'purchase') {
        dbRow = { id: item.id, store_id: storeId, supplier_name: data.supplier, product_id: data.productId, product_name: data.productName, qty: +data.qty, cost: +data.cost, note: data.note || null, purchase_date: today() };
      } else if (type === 'expense') {
        dbRow = { id: item.id, store_id: storeId, category: data.category, note: data.note || null, amount: +data.amount, expense_date: today() };
      } else if (type === 'customer') {
        dbRow = { id: item.id, store_id: storeId, name: data.name, phone: data.phone || null, points: 0 };
      } else if (type === 'supplier') {
        dbRow = { id: item.id, store_id: storeId, name: data.name, phone: data.phone || null, email: data.email || null, address: data.address || null };
      }
      const err = await upsertRow(tableMap[type], dbRow);
      if (err) notify(`⚠ Sync failed: ${err}`);
      await logActivity(storeId, session?.userId, session?.name, role, `${type}_add`, data.name || data.note || '');
    }
    setModal(null);
    notify('Record saved.');
  };

  // ── Categories ─────────────────────────────────────────────
  const addCategory = async (name, module = 'retail') => {
    const t = name.trim();
    const catList = module === 'restaurant' ? restaurantCategories : categories;
    const setCatList = module === 'restaurant' ? setRestaurantCategories : setCategories;
    const storageKey = module === 'restaurant' ? 'restaurant_categories' : 'categories';
    
    if (!t || catList.map(c => c.toLowerCase()).includes(t.toLowerCase())) return false;
    // Update local state + localStorage immediately so UI responds
    const updated = [...catList, t];
    lsSet(storageKey, updated);
    setCatList(updated);
    // Persist to Supabase
    if (supabase && storeId) {
      const err = await sbAddCategory(storeId, t, module);
      if (err) notify(`Saved locally — sync failed: ${err}`);
    }
    notify(`Category "${t}" added.`);
    return true;
  };

  const deleteCategory = async (name, module = 'retail') => {
    const catList = module === 'restaurant' ? restaurantCategories : categories;
    const setCatList = module === 'restaurant' ? setRestaurantCategories : setCategories;
    const storageKey = module === 'restaurant' ? 'restaurant_categories' : 'categories';
    
    if (products.some(p => p.category === name)) { notify(`"${name}" is in use — reassign products first.`); return; }
    if (!window.confirm(`Delete category "${name}"?`)) return;
    const updated = catList.filter(c => c !== name);
    lsSet(storageKey, updated);
    setCatList(updated);
    if (supabase && storeId) await sbDeleteCategory(storeId, name, module);
    notify(`Category deleted.`);
  };

  // ── Settings ───────────────────────────────────────────────
  const saveSettings = updates => {
    const merged = { ...settings, ...updates };
    persist('settings', merged, setSettings);
    if (supabase && storeId) updateStore(storeId, {
      name:          merged.storeName,
      address:       merged.storeAddress,
      phone:         merged.storePhone,
      currency:      merged.currency,
      tax_rate:      merged.taxRate,
      loyalty_spend: merged.loyaltySpend,
      loyalty_redeem:merged.loyaltyRedeem,
    });
  };

  // ── Login / logout ─────────────────────────────────────────
  const handleLogin = async user => {
    // Fetch full store info including business_type
    let businessType = 'retail'; // default
    if (supabase && user.store_id) {
      console.log('🔍 Fetching business_type for store:', user.store_id);
      const { data: storeData, error } = await supabase
        .from('stores')
        .select('business_type')
        .eq('id', user.store_id)
        .single();
      
      console.log('📦 Store data received:', storeData, 'Error:', error);
      
      if (storeData?.business_type) {
        businessType = storeData.business_type;
        console.log('✅ Business type set to:', businessType);
      } else {
        console.log('⚠️ No business_type in store data, using default: retail');
      }
    }
    
    const sess = {
      userId: user.id, name: user.name, role: user.role,
      store_id: user.store_id, storeName: user.stores?.name,
      subscription_plan:   user.subscription_plan,
      subscription_status: user.subscription_status,
      subscription_ends_at: user.subscription_ends_at,
      days_remaining:       user.days_remaining,
      cashier_limit:        user.cashier_limit,
      businessType:         businessType
    };
    
    console.log('💾 Saving session with businessType:', sess.businessType);
    persist('session', sess, setSession);

    // Set RLS session context immediately so all subsequent writes are allowed
    if (supabase && user.store_id) {
      setSessionContext(user.store_id, user.role);
    }

    // Update URL based on role
    const roleRoutes = {
      superadmin: '/admin',
      manager:    '/manager',
      cashier:    '/cashier',
    };
    window.history.pushState(null, '', roleRoutes[user.role] || '/dashboard');
    if (user.stores) {
      const s = user.stores;
      const merged = { ...seedSettings, storeName: s.name, storeAddress: s.address || '', storePhone: s.phone || '', taxRate: s.tax_rate || 16, currency: s.currency || 'KSh', loyaltySpend: s.loyalty_spend || 1000, loyaltyRedeem: s.loyalty_redeem || 100, loyaltyMinRedeem: 100 };
      persist('settings', merged, setSettings);
    }
    
    // Load store data from localStorage immediately on login (will be overwritten by Supabase fetch if online)
    const sid = user.store_id;
    if (sid) {
      const localProducts = lsGetS(sid, 'products', lsGet('products', seedProducts));
      const localCategories = lsGetS(sid, 'categories', lsGet('categories', seedCategories));
      const localSales = lsGetS(sid, 'sales', lsGet('sales', []));
      const localCustomers = lsGetS(sid, 'customers', lsGet('customers', []));
      const localSuppliers = lsGetS(sid, 'suppliers', lsGet('suppliers', []));
      const localPurchases = lsGetS(sid, 'purchases', lsGet('purchases', []));
      const localExpenses = lsGetS(sid, 'expenses', lsGet('expenses', []));
      
      setProducts(localProducts);
      setCategories(localCategories);
      setSales(localSales);
      setCustomers(localCustomers);
      setSuppliers(localSuppliers);
      setPurchases(localPurchases);
      setExpenses(localExpenses);
    }
    
    // Clear cart and discount for fresh session
    setCart([]);
    setDiscount(0);
  };

  const handleLogout = async () => {
    if (supabase && storeId) await logActivity(storeId, session?.userId, session?.name, role, 'logout', 'Logged out');
    // Clear all store data from state on logout
    setProducts([]); setSales([]); setCustomers([]);
    setSuppliers([]); setPurchases([]); setExpenses([]);
    setCategories(seedCategories); setCart([]); setDiscount(0);
    lsSet('session', null); setSession(null); setPage('dashboard');
    window.history.pushState(null, '', '/');
    setView('site');
  };

  // ── Derived ────────────────────────────────────────────────
  const filtered       = useMemo(() => products.filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.brand} ${p.barcode}`.toLowerCase().includes(query.toLowerCase())), [products, category, query]);
  const lowStock       = products.filter(p => (p.stock ?? 0) <= (p.low_stock ?? p.lowStock ?? 5));
  const businessType = session?.businessType || 'retail';
  console.log('🎯 Current session businessType:', businessType, 'Role:', role);
  const todaySalesAmt  = total(sales.filter(s => s.isoDate === today()));
  const isEditModal    = modal && typeof modal === 'object' && modal.edit;
  const visibleNav     = NAV.filter(([,, , roles, allowedTypes]) => {
    // Check if user role is allowed
    if (!roles.includes(role)) return false;
    // Check if business type is allowed (null = available for all)
    if (allowedTypes && !allowedTypes.includes(businessType)) return false;
    return true;
  });
  
  console.log('📋 Visible navigation tabs:', visibleNav.map(n => n[2]));

  // ── Public landing page (shown when not logged in and on site view) ──
  if (!session && view === 'site') return <PublicSite onEnterLogin={() => {
    window.history.pushState(null, '', '/login');
    setView('login');
  }} />;

  // ── Login screen ──
  if (!session) return (
    <>
      <button className="ps-back-btn" onClick={() => {
        window.history.pushState(null, '', '/');
        setView('site');
      }}>← Back to site</button>
      <LoginScreen onLogin={handleLogin} notify={notify} />
    </>
  );
  if (loading)  return <div className="loading-screen"><div className="spinner" /><p>Loading store data…</p></div>;

  // Superadmin gets a completely different layout at /admin
  if (role === 'superadmin') {
    return <SuperAdminApp session={session} onLogout={handleLogout} notify={notify} />;
  }

  // Manager and cashier apps at /manager and /cashier
  return (
    <>
      <aside className="side">
        <div className="brand">
          <i>V</i>
          <span>
            {settings.storeName}
            <small>{role === 'manager' ? 'MANAGER PORTAL' : 'CASHIER PORTAL'}</small>
          </span>
        </div>
        <div className="welcome-msg">
          <p>Welcome back, <b>{session.name}</b></p>
          <span className="role-badge" style={{fontSize:10, padding:'2px 8px'}}>
            {role === 'manager' ? 'Manager' : 'Cashier'}
          </span>
        </div>
        <nav>
          {visibleNav.map(([id, icon, label]) => {
            const showOps = id === 'sales';
            const showFin = id === 'payments';

            // Kitchen badge: orders currently being processed in kitchen
            const kitchenCount = id === 'kitchen'
              ? restaurantOrders.filter(o =>
                  ['sent_to_kitchen', 'preparing', 'ready'].includes(o.status)
                ).length
              : 0;

            // Restaurant badge: orders where food is ready waiting for payment
            const restaurantCount = id === 'restaurant'
              ? restaurantOrders.filter(o => o.status === 'ready' || o.status === 'served').length
              : 0;

            return (
              <React.Fragment key={id}>
                {showOps && <p>OPERATIONS</p>}
                {showFin && <p>FINANCE</p>}
                <button className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
                  {icon}<span>{label}</span>
                  {id === 'products' && lowStock.length > 0 && <span className="nav-badge">{lowStock.length}</span>}
                  {id === 'kitchen' && kitchenCount > 0 && <span className="nav-badge nav-badge-urgent">{kitchenCount}</span>}
                  {id === 'restaurant' && restaurantCount > 0 && <span className="nav-badge" style={{background:'var(--green)'}}>{restaurantCount}</span>}
                  {id === 'subscription' && session.subscription_status === 'expired' && <span className="nav-badge nav-badge-urgent">!</span>}
                  {id === 'subscription' && session.subscription_status !== 'expired' && session.days_remaining != null && session.days_remaining <= 7 && session.days_remaining > 0 && <span className="nav-badge nav-badge-warn">{session.days_remaining}d</span>}
                </button>
              </React.Fragment>
            );
          })}
        </nav>
        <footer>
          <img src="/logo.png" alt="Vyro" className="footer-logo" onError={e => e.target.style.display='none'} />
          <div className="footer-user">
            <span>{session.name}<small>{session.role}</small></span>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Log out">⏻</button>
        </footer>
      </aside>

      <main>
        <header>
          <div>
            <p>{page === 'dashboard' ? 'OVERVIEW' : page === 'reports' ? 'BUSINESS INTELLIGENCE' : ['expenses','payments'].includes(page) ? 'FINANCE' : 'OPERATIONS'}</p>
            <h1>{page === 'pos' ? 'Point of sale' : page[0].toUpperCase() + page.slice(1)}</h1>
          </div>
          <div className="header-actions">
            <span>{new Date().toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short' })}</span>
            {lowStock.length > 0 && <button className="alert-chip" onClick={() => setPage('products')}>⚠ {lowStock.length} low stock</button>}
            {session.subscription_status === 'expired' && (
              <button className="alert-chip alert-chip-danger" onClick={() => setPage('subscription')}>
                ⚠ Subscription expired
              </button>
            )}
            {session.subscription_status !== 'expired' && session.days_remaining != null && session.days_remaining <= 7 && session.days_remaining > 0 && (
              <button className="alert-chip alert-chip-warn" onClick={() => setPage('subscription')}>
                ⏰ {session.days_remaining} days left
              </button>
            )}
            <button className="primary" onClick={() => setPage('pos')}>+ New sale</button>
          </div>
        </header>

        {page==='dashboard' && <Dashboard sales={sales} customers={customers} expenses={expenses} products={products} money={fmt} total={total} setPage={setPage} open={setModal} todaySalesAmt={todaySalesAmt} lowStock={lowStock} session={session} restaurantOrders={restaurantOrders} roomBookings={roomBookings} />}
        {page==='pos'       && <POS products={products} categories={categories} cart={cart} addToCart={addToCart} setCart={setCart} sub={sub} discAmt={discAmt} taxAmt={taxAmt} grand={grand} discount={discount} setDiscount={setDiscount} redeemPts={redeemPts} setRedeemPts={setRedeemPts} money={fmt} category={category} setCategory={setCategory} query={query} setQuery={setQuery} filtered={filtered} customers={customers} checkout={checkout} open={setModal} notify={notify} taxRate={settings.taxRate} loyaltySpend={settings.loyaltySpend||500} loyaltyRedeem={settings.loyaltyRedeem||100} loyaltyMin={settings.loyaltyMinRedeem||100} />}
        {page==='restaurant' && <Restaurant storeId={storeId} session={session} products={products} money={fmt} notify={notify} categories={restaurantCategories} onAddCategory={(name) => addCategory(name, 'restaurant')} onDeleteCategory={(name) => deleteCategory(name, 'restaurant')} initialOrders={restaurantOrders} storeName={settings.storeName} storePhone={settings.storePhone} taxRate={settings.taxRate || 16} loyaltySpend={settings.loyaltySpend || 1000} customers={customers}
          onOrderComplete={async (completedOrder) => {
            // Handle immediate refresh from sendToKitchen
            if (completedOrder._refresh && completedOrder._fresh) {
              setRestaurantOrders(completedOrder._fresh);
              return;
            }

            // Refresh restaurant orders in App state so Payments/Reports update immediately
            const fresh = await fetchRestaurantOrders(storeId).catch(() => []);
            // Merge customer data into the completed order in case DB columns don't exist yet
            const merged = fresh.map(o => 
              o.id === completedOrder.orderId
                ? { ...o, customer_name: completedOrder.customerName || o.customer_name, customer_phone: completedOrder.customerPhone || o.customer_phone }
                : o
            );
            setRestaurantOrders(merged);

            // Save/update customer and award loyalty points
            const phone = completedOrder.customerPhone?.trim();
            const name  = completedOrder.customerName?.trim();
            if (phone || name) {
              const custName = name || 'Restaurant Guest';
              const existing = customers.find(c => 
                (phone && (c.phone === phone || c.phone === phone.replace(/^0/, '+254'))) ||
                (name && c.name?.toLowerCase() === custName.toLowerCase())
              );
              const pointsEarned = completedOrder.pointsEarned || 0;
              if (!existing) {
                const newCust = { id: crypto.randomUUID(), store_id: storeId, name: custName, phone: phone || null, points: pointsEarned };
                await upsertRow('customers', newCust);
                setCustomers(prev => [...prev, newCust]);
              } else if (pointsEarned > 0) {
                const newPoints = (existing.points || 0) + pointsEarned;
                await upsertRow('customers', { id: existing.id, store_id: storeId, name: existing.name, phone: existing.phone, points: newPoints });
                setCustomers(prev => prev.map(c => c.id === existing.id ? { ...c, points: newPoints } : c));
              }
            }
          }}
        />}
        {page==='rooms'      && <RoomBookings storeId={storeId} session={session} money={fmt} notify={notify} storeName={settings.storeName} onSendWhatsApp={(phone, message) => sendWhatsApp(phone, message)} initialRooms={rooms} initialBookings={roomBookings} taxRate={settings.taxRate || 16} />}
        {page==='kitchen'    && <KitchenDisplay storeId={storeId} session={session} notify={notify} />}
        {page==='sales'     && <SalesPage sales={sales} money={fmt} total={total} setPage={setPage} setReceipt={setReceipt} />}
        {page==='products'  && <ProductsPage products={products} categories={categories} money={fmt} onAdd={() => setModal('product')} onEdit={p => setModal({ edit: p })} onDelete={deleteProduct} onAddCategory={(name) => addCategory(name, 'retail')} onDeleteCategory={(name) => deleteCategory(name, 'retail')} />}
        {page==='purchases' && <PurchasesPage purchases={purchases} products={products} suppliers={suppliers} money={fmt} open={setModal} />}
        {page==='customers' && <CustomersPage customers={customers} sales={sales} restaurantOrders={restaurantOrders} money={fmt} total={total} open={setModal} businessType={businessType} />}
        {page==='suppliers' && <Contacts title="Suppliers" items={suppliers} open={() => setModal('supplier')} />}
        {page==='payments'  && <UnifiedPayments sales={sales} restaurantOrders={restaurantOrders} roomBookings={roomBookings} money={fmt} total={total} session={session} businessType={businessType} />}
        {page==='expenses'  && <ExpensesPage expenses={expenses} money={fmt} total={total} open={setModal} />}
        {page==='reports'   && <Reports sales={sales} expenses={expenses} purchases={purchases} products={products} money={fmt} total={total} restaurantOrders={restaurantOrders} roomBookings={roomBookings} businessType={businessType} />}
        {page==='subscription' && <SubscriptionPage session={session} storeId={storeId} notify={notify} />}
        {page==='settings'  && <SettingsPage settings={settings} storeId={storeId} session={session} saveSettings={saveSettings} notify={notify} />}
      </main>

      {modal==='product'  && <ProductModal  categories={categories} save={d => saveProduct(d, null)} close={() => setModal(null)} />}
      {isEditModal        && <ProductModal  categories={categories} product={modal.edit} save={d => saveProduct(d, modal.edit.id)} close={() => setModal(null)} />}
      {modal==='customer' && <RecordModal   type="customer"  save={saveRecord} close={() => setModal(null)} />}
      {modal==='supplier' && <RecordModal   type="supplier"  save={saveRecord} close={() => setModal(null)} />}
      {modal==='expense'  && <RecordModal   type="expense"   save={saveRecord} close={() => setModal(null)} />}
      {modal==='purchase' && <PurchaseModal products={products} suppliers={suppliers} save={d => saveRecord('purchase', d)} close={() => setModal(null)} />}

      {receipt && <ReceiptModal sale={receipt} settings={settings} close={() => setReceipt(null)} />}
      {toast   && <div className="toast">{toast}</div>}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   LOGIN SCREEN
───────────────────────────────────────────────────────────── */
function LoginScreen({ onLogin, notify }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [err,      setErr]      = useState('');
  const [busy,     setBusy]     = useState(false);

  const attempt = async e => {
    e.preventDefault();
    if (!email.trim() || !password) { setErr('Enter your email and password.'); return; }
    setBusy(true); setErr('');
    if (supabase) {
      const { user, error } = await loginUser(email, password);
      if (error) { setErr(error); setBusy(false); }
      else        onLogin(user);
    } else {
      setErr('⚠ Running offline — Supabase not configured.');
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo-wrap">
          <img
            src="/logo.png"
            alt="Vyro POS"
            className="login-logo-img"
            onError={e => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div className="login-brand" style={{display:'none'}}>
            <i>V</i><span>Vyro POS</span>
          </div>
        </div>

        <h2 className="login-title">Welcome back</h2>
        <p className="login-sub">Sign in to your store</p>

        <form onSubmit={attempt} className="login-form">
          <div className="login-field">
            <label>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setErr(''); }}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              required
            />
          </div>

          <div className="login-field">
            <label>Password</label>
            <div className="login-pw-wrap">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setErr(''); }}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-pw-toggle"
                onClick={() => setShowPw(s => !s)}
                tabIndex={-1}
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {err && <p className="login-err">{err}</p>}

          <button type="submit" className="primary login-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p className="login-help">
          Need access? Contact your administrator or{' '}
          <button
            className="link-btn"
            style={{fontSize:13}}
            onClick={() => window.history.pushState(null,'','/portals') || window.location.reload()}
          >
            visit the portals page
          </button>.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SUPER ADMIN APP
───────────────────────────────────────────────────────────── */
function SuperAdminApp({ session, onLogout, notify }) {
  const [tab,        setTab]        = useState('stores');
  const [stores,     setStores]     = useState([]);
  const [allUsers,   setAllUsers]   = useState([]);
  const [actLog,     setActLog]     = useState([]);
  const [allSales,   setAllSales]   = useState([]);
  const [modal,      setModal]      = useState(null);
  const [selStore,   setSelStore]   = useState(null); // store filter for log
  const [loading,    setLoading]    = useState(true);
  
  // Subscription state
  const [subscriptionStats, setSubscriptionStats] = useState({});
  const [allPayments, setAllPayments] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [subscriptionRequests, setSubscriptionRequests] = useState([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    // Set RLS session context so superadmin policies allow cross-store reads
    await setSessionContext('', 'superadmin');
    const [s, u, l, sa, stats, payments, plans, pending, config, requests] = await Promise.all([
      fetchAllStores(), 
      fetchAllUsers(), 
      fetchActivityLog(), 
      fetchAllSales(),
      getSubscriptionStats(),
      getAllPayments(),
      getSubscriptionPlans(),
      getPendingPayments(),
      getPaymentConfig(),
      fetchSubscriptionRequests(),
    ]);
    setStores(s); 
    setAllUsers(u); 
    setActLog(l); 
    setAllSales(sa);
    setSubscriptionStats(stats);
    setAllPayments(payments);
    setSubscriptionPlans(plans);
    setPendingPayments(pending);
    setPaymentConfig(config);
    setSubscriptionRequests(requests);
    setLoading(false);
  };

  const handleCreateStore = async data => {
    const { data: store, error } = await createStore({
      name: data.name, address: data.address, phone: data.phone,
      currency: data.currency || 'KSh', tax_rate: +data.taxRate || 16,
      business_type: data.businessType || 'retail',
    });
    if (error) { notify(`Error: ${error}`); return; }
    // Create manager user for this store
    await createUser({ store_id: store.id, name: data.managerName, email: data.managerEmail, password: data.managerPassword, role: 'manager', active: true });
    
    // Show WhatsApp share modal
    setModal({
      type: 'storeCreated',
      data: {
        storeName: data.name,
        managerName: data.managerName,
        email: data.managerEmail,
        password: data.managerPassword,
        phone: data.phone,
      },
    });
    load();
  };

  const handleSuspendStore = async (id, suspended) => {
    await suspendStore(id, suspended);
    notify(suspended ? 'Store suspended.' : 'Store reactivated.');
    load();
  };

  const handleUpdateBusinessType = async (storeId, businessType) => {
    console.log('🔄 handleUpdateBusinessType called:', { storeId, businessType });
    const { error } = await updateStore(storeId, { business_type: businessType });
    if (error) {
      notify('❌ Failed to update: ' + error);
      return;
    }
    notify('✅ Business type updated');
    load();
  };

  const handleDismissUser = async (id, name) => {
    if (!window.confirm(`Dismiss ${name}? They will no longer be able to log in.`)) return;
    await dismissUser(id);
    notify(`${name} has been dismissed.`);
    load();
  };

  const handleReinstateUser = async (id, name) => {
    await reinstateUser(id);
    notify(`${name} reinstated.`);
    load();
  };

  const handleDeleteUser = async (id, name) => {
    if (!window.confirm(`Permanently delete "${name}"?\n\nThis cannot be undone. All their activity logs will remain but the user account will be removed.`)) return;
    const { error } = await deleteUser(id);
    if (error) {
      notify(`Error deleting user: ${error}`);
      return;
    }
    notify(`${name} has been permanently deleted.`);
    load();
  };

  const handleUpdateUserEmail = async (id, name, newEmail) => {
    if (!newEmail?.trim()) { notify('Email cannot be empty.'); return 'empty'; }
    const err = await adminUpdateUserEmail(id, newEmail.trim());
    if (err) { notify(`Error updating email: ${err}`); return err; }
    notify(`✅ Email for ${name} updated.`);
    load();
    return null;
  };

  const handleResetPin = async (id, name, newPassword) => {
    const err = await resetUserPassword(id, newPassword);
    if (err) { notify(`Failed to reset password: ${err}`); return; }
    notify(`Password for ${name} has been reset.`);
  };

  const handleDeleteLog = async (id) => {
    await deleteLogEntry(id);
    setActLog(l => l.filter(x => x.id !== id));
  };

  const handleClearLog = async (storeId = null) => {
    const label = storeId ? stores.find(s => s.id === storeId)?.name : 'ALL stores';
    if (!window.confirm(`Clear all activity log entries for ${label}? This cannot be undone.`)) return;
    await clearActivityLog(storeId);
    setActLog(l => storeId ? l.filter(x => x.store_id !== storeId) : []);
    notify('Activity log cleared.');
  };

  const handleManageSubscription = (store) => {
    console.log('🔍 Opening subscription modal for store:', store);
    console.log('📋 Available plans:', subscriptionPlans);
    
    if (!store) {
      notify('Error: No store data');
      console.error('Store is undefined');
      return;
    }
    
    if (!store.subscription_plan) {
      notify('Store missing subscription data. Please check database.');
      console.error('Store missing subscription_plan field:', store);
      return;
    }
    
    if (!subscriptionPlans || subscriptionPlans.length === 0) {
      notify('Subscription plans not loaded. Please refresh.');
      console.error('Subscription plans:', subscriptionPlans);
      return;
    }
    
    setModal({ type: 'subscription', store });
  };

  const handleUpdateSubscription = async (storeId, plan, amount, paymentMethod, mpesaCode) => {
    const { data, error } = await updateSubscription(storeId, plan, amount, paymentMethod, mpesaCode);
    if (error) {
      notify(`Error: ${error}`);
      return;
    }
    notify('Subscription updated successfully!');
    load(); // Reload data
  };

  const handleApprovePayment = async (payment) => {
    if (!window.confirm(`Approve KSh ${payment.amount.toLocaleString()} payment from ${payment.store_name}?\n\nM-Pesa code: ${payment.mpesa_code}`)) return;
    const { data, error } = await approvePayment(payment.id, session.userId);
    if (error) { notify(`Error: ${error}`); return; }
    notify(`✅ Payment approved! Subscription activated for ${payment.store_name}.`);
    load();
  };

  const handleRejectPayment = async (payment) => {
    const reason = window.prompt(`Reject payment from ${payment.store_name}?\n\nEnter reason for rejection (required):`);
    if (reason === null) return; // cancelled
    if (!reason.trim()) { notify('Please enter a rejection reason.'); return; }
    const { data, error } = await rejectPayment(payment.id, session.userId, reason.trim());
    if (error) { notify(`Error: ${error}`); return; }
    notify(`Payment rejected. ${payment.store_name} has been notified.`);
    load();
  };

  const handleUpdatePaymentConfig = async (config) => {
    const { data, error } = await updatePaymentConfig(
      config.mpesaType, config.mpesaNumber, config.accountNumber,
      config.businessName, config.instructions
    );
    if (error) { notify(`Error: ${error}`); return; }
    notify('Payment configuration saved!');
    setPaymentConfig(config);
    setModal(null);
  };

  const handleApproveRequest = async (request) => {
    if (!window.confirm(`Approve subscription request for "${request.business_name}"?\n\nThis will create a new store with ${request.plan} plan.`)) return;
    
    const tempPassword = 'Vyro' + Math.floor(1000 + Math.random() * 9000).toString() + '!';
    
    // Create store
    const { data: store, error: storeError } = await createStore({
      name: request.business_name,
      address: request.address || '',
      phone: request.phone,
      currency: 'KSh',
      tax_rate: 16,
      business_type: request.business_type || 'retail',
    });
    
    if (storeError) {
      notify(`Error creating store: ${storeError}`);
      return;
    }
    
    // Generate manager email from business name + phone
    const managerEmail = `${request.business_name.toLowerCase().replace(/\s+/g,'.')}.${request.phone.slice(-4)}@vyropos.store`;
    
    // Create manager user
    const { error: userError } = await createUser({
      store_id: store.id,
      name: request.owner_name,
      email: managerEmail,
      password: tempPassword,
      role: 'manager',
      active: true,
    });
    
    if (userError) {
      notify(`Store created but error creating user: ${userError}`);
      return;
    }
    
    // Update subscription plan for the store
    const { error: subError } = await updateSubscription(store.id, request.plan, 0, null, null);
    if (subError) {
      notify(`Store created but error setting subscription: ${subError}`);
    }
    
    // Mark request as approved
    const { error: approveError } = await supabase
      .from('subscription_requests')
      .update({
        status: 'approved',
        approved_by: session.userId,
        approved_at: new Date().toISOString(),
        store_id: store.id,
        admin_notes: `Auto-approved. Login: ${managerEmail} / Password: ${tempPassword}`,
      })
      .eq('id', request.id);
    
    if (approveError) {
      notify(`Store created but error updating request: ${approveError.message}`);
    } else {
      // Show modal with WhatsApp option
      setModal({
        type: 'approvalSuccess',
        data: {
          businessName: request.business_name,
          ownerName: request.owner_name,
          email: managerEmail,
          password: tempPassword,
          phone: request.phone,
          plan: request.plan,
        },
      });
    }
    
    load();
  };

  const handleRejectRequest = async (request) => {
    const reason = window.prompt(`Reject subscription request for "${request.business_name}"?\n\nEnter reason for rejection (required):`);
    if (reason === null) return;
    if (!reason.trim()) {
      notify('Please enter a rejection reason.');
      return;
    }
    
    const { error } = await supabase
      .from('subscription_requests')
      .update({
        status: 'rejected',
        approved_by: session.userId,
        approved_at: new Date().toISOString(),
        admin_notes: reason.trim(),
      })
      .eq('id', request.id);
    
    if (error) {
      notify(`Error: ${error.message}`);
      return;
    }
    
    notify('Request rejected.');
    load();
  };

  const totalRevenue = allSales.reduce((s, x) => s + Number(x.total || 0), 0);
  const fmt = n => money(n, 'KSh');
  
  const pendingRequestsCount = subscriptionRequests.filter(r => r.status === 'pending').length;

  const tabs = [
    ['stores',  '🏪', 'Stores'],
    ['users',   '👥', 'Users'],
    ['requests', '📝', `Requests${pendingRequestsCount > 0 ? ` (${pendingRequestsCount})` : ''}`],
    ['pending', '⏳', `Pending${pendingPayments.length > 0 ? ` (${pendingPayments.length})` : ''}`],
    ['subscriptions', '💳', 'Subscriptions'],
    ['activity','📋', 'Activity log'],
    ['revenue', '📊', 'Revenue'],
  ];

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="side">
        <div className="brand">
          <i>V</i>
          <span>
            Vyro POS
            <small>SUPER ADMIN</small>
          </span>
        </div>
        <div className="welcome-msg">
          <p>Welcome back, <b>{session.name}</b></p>
          <span className="role-badge" style={{fontSize:10, padding:'2px 8px', background:'var(--violet)', color:'#fff'}}>
            Super Admin
          </span>
        </div>
        <nav>
          {tabs.map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {icon}<span>{label}</span>
            </button>
          ))}
        </nav>
        <footer>
          <img src="/logo.png" alt="Vyro" className="footer-logo" onError={e => e.target.style.display='none'} />
          <div className="footer-user">
            <span>{session.name}<small>Super Admin</small></span>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Log out">⏻</button>
        </footer>
      </aside>

      <main>
        <header>
          <div><p>PLATFORM MANAGEMENT</p><h1>Admin panel</h1></div>
          <div className="header-actions">
            <span>{new Date().toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short' })}</span>
            <button className="btn-edit" onClick={() => setModal('paymentConfig')}>⚙ Payment Settings</button>
            {tab === 'stores' && <button className="primary" onClick={() => setModal('newStore')}>+ Add store</button>}
          </div>
        </header>

        {loading && <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading…</div>}

        {!loading && tab === 'stores' && (
          <AdminStoresTab stores={stores} fmt={fmt} totalRevenue={totalRevenue} onSuspend={handleSuspendStore} onManageSubscription={handleManageSubscription} onUpdateBusinessType={handleUpdateBusinessType} />
        )}

        {!loading && tab === 'users' && (
          <AdminUsersTab allUsers={allUsers} onDismiss={handleDismissUser} onReinstate={handleReinstateUser} onResetPin={handleResetPin} onDelete={handleDeleteUser} onUpdateEmail={handleUpdateUserEmail} />
        )}

        {!loading && tab === 'requests' && (
          <AdminRequestsTab
            requests={subscriptionRequests}
            onApprove={handleApproveRequest}
            onReject={handleRejectRequest}
            fmt={fmt}
          />
        )}

        {!loading && tab === 'pending' && (
          <AdminPendingPaymentsTab
            pendingPayments={pendingPayments}
            onApprove={handleApprovePayment}
            onReject={handleRejectPayment}
            fmt={fmt}
          />
        )}

        {!loading && tab === 'subscriptions' && (
          <AdminSubscriptionsTab stores={stores} allPayments={allPayments} stats={subscriptionStats} fmt={fmt} />
        )}

        {!loading && tab === 'activity' && (
          <AdminActivityTab actLog={actLog} stores={stores} selStore={selStore} setSelStore={setSelStore} onDelete={handleDeleteLog} onClear={handleClearLog} />
        )}

        {!loading && tab === 'revenue' && (
          <AdminRevenueTab allSales={allSales} fmt={fmt} totalRevenue={totalRevenue} stores={stores} />
        )}
      </main>

      {/* New store modal */}
      {modal === 'newStore' && (
        <NewStoreModal save={handleCreateStore} close={() => setModal(null)} />
      )}

      {/* Subscription management modal (admin direct override) */}
      {modal?.type === 'subscription' && (
        <SubscriptionManagementModal 
          store={modal.store} 
          plans={subscriptionPlans} 
          onUpdate={handleUpdateSubscription} 
          onClose={() => setModal(null)} 
          notify={notify} 
        />
      )}

      {/* Approval success modal with WhatsApp share */}
      {modal?.type === 'approvalSuccess' && (
        <ApprovalSuccessModal
          data={modal.data}
          onClose={() => setModal(null)}
          onSendWhatsApp={(phone, message) => sendWhatsApp(phone, message)}
        />
      )}

      {/* Payment config modal */}
      {modal === 'paymentConfig' && (
        <PaymentConfigModal
          currentConfig={paymentConfig}
          onSave={handleUpdatePaymentConfig}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
    </div>
  );
}

function AdminStoresTab({ stores, fmt, totalRevenue, onSuspend, onManageSubscription, onUpdateBusinessType }) {
  const pg = usePagination(stores, 15);
  const [editModal, setEditModal] = useState(null);
  const [selectedType, setSelectedType] = useState('');
  
  const businessTypeLabels = {
    'retail': '🛒 Retail',
    'hotel': '🍽️ Hotel',
    'pharmacy': '💊 Pharmacy',
    'electronics': '📱 Electronics',
    'fashion': '👗 Fashion',
    'hardware': '🔧 Hardware',
    'beauty': '💄 Beauty',
    'auto': '🚗 Auto',
    'bookshop': '📚 Bookshop',
    'other': '🏪 Other'
  };
  
  const openEditModal = (store) => {
    console.log('📂 Opening edit modal for:', store);
    setEditModal(store);
    setSelectedType(store.business_type || 'retail');
  };
  
  const handleSaveBusinessType = async () => {
    console.log('💾 Saving business type:', { storeId: editModal.id, businessType: selectedType });
    await onUpdateBusinessType(editModal.id, selectedType);
    setEditModal(null);
  };
  
  const sendReminder = (store) => {
    if (!store.phone) {
      alert('No phone number on file for this store.');
      return;
    }
    const message = formatReminderMessage(
      store.name,
      store.days_remaining,
      store.subscription_plan
    );
    sendWhatsApp(store.phone, message);
  };
  
  const getPlanBadge = (plan) => {
    const badges = {
      'trial': { label: 'Trial', color: 'violet' },
      'monthly_basic': { label: 'Monthly', color: 'blue' },
      'monthly_premium': { label: 'Premium', color: 'amber' },
      'yearly_basic': { label: 'Yearly', color: 'green' },
      'yearly_premium': { label: 'Premium+', color: 'emerald' },
    };
    return badges[plan] || { label: plan, color: 'gray' };
  };

  return (
    <section className="view">
      <div className="metrics" style={{ marginBottom:16 }}>
        <Metric label="Total stores"  value={stores.length} note="Registered" />
        <Metric label="Active"        value={stores.filter(s=>s.subscription_status==='active').length} note="Paid" accent="green" />
        <Metric label="Expired"       value={stores.filter(s=>s.subscription_status==='expired').length} note="Need renewal" accent="coral" />
        <Metric label="Trial stores"  value={stores.filter(s=>s.subscription_plan==='trial').length} note="Free trial" accent="violet" />
      </div>
      <article className="card table">
        <table>
          <thead>
            <tr>
              <th>Store</th>
              <th>Business Type</th>
              <th>Plan</th>
              <th>Cashiers</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pg.slice.map(s => {
              const badge = getPlanBadge(s.subscription_plan);
              const daysLeft = s.days_remaining;
              const isExpiring = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
              const isExpired = s.subscription_status === 'expired';
              
              return (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                    <small style={{display:'block',color:'var(--muted)',fontSize:11}}>
                      {s.manager_name || 'No manager'}
                    </small>
                  </td>
                  <td>
                    <span style={{fontSize:13}}>
                      {businessTypeLabels[s.business_type] || businessTypeLabels['retail']}
                    </span>
                  </td>
                  <td>
                    <span className={`stock-pill ${badge.color}`}>{badge.label}</span>
                  </td>
                  <td>
                    <span style={{color: s.cashier_count >= s.cashier_limit ? 'var(--coral)' : 'inherit'}}>
                      {s.cashier_count} / {s.cashier_limit}
                    </span>
                  </td>
                  <td>
                    <span className={`stock-pill ${isExpired ? 'danger' : isExpiring ? 'warning' : ''}`}>
                      {s.subscription_status}
                    </span>
                  </td>
                  <td>
                    {s.subscription_ends_at ? (
                      <>
                        {new Date(s.subscription_ends_at).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}
                        {daysLeft !== null && (
                          <small style={{
                            display:'block',
                            color: isExpired ? 'var(--coral)' : isExpiring ? 'var(--amber)' : 'var(--muted)',
                            fontSize:11
                          }}>
                            {isExpired ? 'Expired' : `${daysLeft} days left`}
                          </small>
                        )}
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button 
                        className="btn-edit" 
                        onClick={() => openEditModal(s)}
                        title="Edit Business Type"
                      >
                        Edit Type
                      </button>
                      <button 
                        className="btn-edit" 
                        onClick={() => {
                          console.log('🔘 Manage button clicked!', s);
                          onManageSubscription(s);
                        }}
                      >
                        Manage
                      </button>
                      {isExpiring && s.phone && (
                        <button
                          className="btn-whatsapp"
                          style={{background:'#25D366', color:'#fff', border:'none', fontSize:11, padding:'6px 10px'}}
                          onClick={() => sendReminder(s)}
                          title="Send subscription reminder via WhatsApp"
                        >
                          📱 Remind
                        </button>
                      )}
                      {s.status === 'active' ? (
                        <button className="btn-delete" onClick={() => onSuspend(s.id, true)}>
                          Suspend
                        </button>
                      ) : (
                        <button className="btn-edit" onClick={() => onSuspend(s.id, false)}>
                          Reinstate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!stores.length && (
              <tr><td colSpan={6} className="empty-td">No stores yet.</td></tr>
            )}
          </tbody>
        </table>
      </article>
      <Pagination {...pg} />
      
      {/* Edit Business Type Modal */}
      {editModal && (
        <div className="modal">
          <div className="modal-content" style={{maxWidth:400}}>
            <button type="button" className="close" onClick={() => setEditModal(null)}>×</button>
            <h2>Edit Business Type</h2>
            <p style={{color:'var(--muted)', marginBottom:20}}>
              <strong>{editModal.name}</strong>
            </p>
            
            <label style={{marginBottom:20, display:'block'}}>
              Select Business Type
              <select 
                value={selectedType}
                onChange={(e) => {
                  console.log('📝 Type changed to:', e.target.value);
                  setSelectedType(e.target.value);
                }}
                style={{width:'100%', padding:'12px', fontSize:14, marginTop:8}}
              >
                {Object.entries(businessTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            
            <div style={{display:'flex', gap:10}}>
              <button 
                className="secondary" 
                onClick={() => setEditModal(null)}
                style={{flex:1}}
              >
                Cancel
              </button>
              <button 
                className="primary" 
                onClick={handleSaveBusinessType}
                style={{flex:1}}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AdminUsersTab({ allUsers, onDismiss, onReinstate, onResetPin, onDelete, onUpdateEmail }) {
  const [search,    setSearch]    = useState('');
  const [roleF,     setRoleF]     = useState('All');
  const [collapsed, setCollapsed] = useState({});
  const [revealed,  setRevealed]  = useState({});
  const [resetting, setResetting] = useState({});   // { userId: newPassword }
  const [editingEmail, setEditingEmail] = useState({}); // { userId: emailString }

  const filtered = allUsers.filter(u =>
    (roleF === 'All' || u.role === roleF) &&
    `${u.name} ${u.stores?.name || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, u) => {
    const key  = u.store_id || '__no_store__';
    const name = u.stores?.name || 'Unassigned';
    if (!acc[key]) acc[key] = { storeName: name, storeId: key, users: [] };
    acc[key].users.push(u);
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((a, b) => a.storeName.localeCompare(b.storeName));
  const groupsPg = usePagination(groups, 10); // paginate store groups
  const toggle = id => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  const startReset = (userId, currentEmail) =>
    setResetting(r => ({ ...r, [userId]: '' }));

  const confirmReset = (userId, name) => {
    const newPw = resetting[userId];
    if (!newPw || newPw.length < 6) {
      alert('Password must be at least 6 characters.'); return;
    }
    onResetPin(userId, name, newPw);
    setResetting(r => { const n = { ...r }; delete n[userId]; return n; });
  };

  const cancelReset = userId =>
    setResetting(r => { const n = { ...r }; delete n[userId]; return n; });

  return (
    <section className="view">
      <div className="sectionhead">
        <h2>Users <span className="count-badge">{allUsers.length}</span></h2>
        <span style={{ color:'var(--muted)', fontSize:13 }}>{groups.length} stores</span>
      </div>

      <div className="filter-bar">
        <input className="search" style={{ maxWidth:240 }} value={search} placeholder="Search by name or store…" onChange={e => setSearch(e.target.value)} />
        <label>Role
          <select value={roleF} onChange={e => setRoleF(e.target.value)}>
            <option value="All">All roles</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
          </select>
        </label>
        <span className="filter-total">Showing <b>{filtered.length}</b></span>
      </div>

      <div className="store-groups">
        {groupsPg.slice.map(g => {
          const isOpen = !collapsed[g.storeId];
          const active = g.users.filter(u => u.active).length;

          return (
            <article key={g.storeId} className="card store-group">
              <button type="button" className="store-group-header" onClick={() => toggle(g.storeId)}>
                <div className="store-group-title">
                  <span className="store-group-chevron">{isOpen ? '▾' : '▸'}</span>
                  <span className="store-group-name">{g.storeName}</span>
                  <span className="count-badge">{g.users.length} staff</span>
                  {active < g.users.length && (
                    <span className="count-badge" style={{ background:'#fff1f2', color:'var(--coral)', border:'1px solid #fecdd3' }}>
                      {g.users.length - active} dismissed
                    </span>
                  )}
                </div>
                <span className={`stock-pill ${active > 0 ? '' : 'danger'}`}>{active} active</span>
              </button>

              {isOpen && (
                <div className="store-group-body">
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Role</th><th>Email</th><th>Password</th><th>Status</th><th>Last login</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {g.users.map(u => (
                        <tr key={u.id}>
                          <td><b>{u.name}</b></td>
                          <td><span className="role-badge">{u.role}</span></td>

                          {/* Email cell — inline editable */}
                          <td>
                            {editingEmail[u.id] !== undefined ? (
                              <div className="pin-reset-row">
                                <input
                                  className="pin-reset-input"
                                  type="email"
                                  placeholder="new@email.com"
                                  value={editingEmail[u.id]}
                                  onChange={e => setEditingEmail(r => ({ ...r, [u.id]: e.target.value }))}
                                />
                                <button className="btn-edit" style={{fontSize:11,padding:'3px 8px'}} onClick={async () => {
                                  const err = await onUpdateEmail(u.id, u.name, editingEmail[u.id]);
                                  if (!err) setEditingEmail(r => { const n={...r}; delete n[u.id]; return n; });
                                }}>Save</button>
                                <button className="btn-delete" style={{fontSize:11,padding:'3px 8px'}} onClick={() => setEditingEmail(r => { const n={...r}; delete n[u.id]; return n; })}>✕</button>
                              </div>
                            ) : (
                              <div className="pin-view-row">
                                <span style={{fontSize:12, color: u.email ? 'var(--ink)' : 'var(--muted)'}}>
                                  {u.email || '— no email —'}
                                </span>
                                <button className="pin-toggle-btn" onClick={() => setEditingEmail(r => ({...r, [u.id]: u.email||''}))} title="Edit email">✏️</button>
                              </div>
                            )}
                          </td>

                          {/* Password reset cell */}
                          <td>
                            {resetting[u.id] !== undefined ? (
                              <div className="pin-reset-row">
                                <input
                                  className="pin-reset-input"
                                  type="password"
                                  placeholder="New password (6+)"
                                  minLength={6}
                                  value={resetting[u.id]}
                                  onChange={e => setResetting(r => ({ ...r, [u.id]: e.target.value }))}
                                />
                                <button className="btn-edit" style={{fontSize:11,padding:'3px 8px'}} onClick={() => confirmReset(u.id, u.name)}>Save</button>
                                <button className="btn-delete" style={{fontSize:11,padding:'3px 8px'}} onClick={() => cancelReset(u.id)}>✕</button>
                              </div>
                            ) : (
                              <div className="pin-view-row">
                                <button className="pin-toggle-btn" onClick={() => startReset(u.id)} title="Reset password" style={{fontSize:13}}>
                                  🔑 Reset password
                                </button>
                              </div>
                            )}
                          </td>

                          <td><span className={`stock-pill ${u.active ? '' : 'danger'}`}>{u.active ? 'Active' : 'Dismissed'}</span></td>
                          <td style={{ color:'var(--muted)', fontSize:12 }}>
                            {u.last_login ? new Date(u.last_login).toLocaleString('en-KE') : 'Never logged in'}
                          </td>
                          <td>
                            <div className="row-actions">
                              {u.active
                                ? <button className="btn-delete" onClick={() => onDismiss(u.id, u.name)}>Dismiss</button>
                                : <button className="btn-edit"   onClick={() => onReinstate(u.id, u.name)}>Reinstate</button>}
                              <button
                                className="btn-delete"
                                style={{background:'#fef2f2', borderColor:'#fecaca', color:'#dc2626'}}
                                onClick={() => onDelete(u.id, u.name)}
                                title="Permanently delete this user"
                              >
                                🗑 Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          );
        })}
        {!groups.length && (
          <article className="card"><p className="empty-state">No users found.</p></article>
        )}
      </div>
      <Pagination {...groupsPg} />
    </section>
  );
}

function GroupedLogEntries({ entries, actionColor, onDelete }) {
  const pg = usePagination(entries, 20);
  return (
    <>
      <table>
        <thead>
          <tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Detail</th><th></th></tr>
        </thead>
        <tbody>
          {pg.slice.map(l => (
            <tr key={l.id}>
              <td style={{ whiteSpace:'nowrap', color:'var(--muted)', fontSize:12 }}>
                {new Date(l.created_at).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' })}
              </td>
              <td><b>{l.user_name}</b></td>
              <td><span className="role-badge">{l.role}</span></td>
              <td>
                <span style={{ background: actionColor(l.action), padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
                  {l.action}
                </span>
              </td>
              <td style={{ color:'var(--muted)', fontSize:12 }}>{l.detail}</td>
              <td>
                <button className="btn-delete" style={{ fontSize:11, padding:'3px 8px' }} onClick={() => onDelete(l.id)} title="Delete this entry">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination {...pg} />
    </>
  );
}

function AdminActivityTab({ actLog, stores, selStore, setSelStore, onDelete, onClear }) {
  const [search,    setSearch]    = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [viewMode,  setViewMode]  = useState('grouped'); // 'grouped' | 'flat'

  const filtered = actLog.filter(l => {
    if (selStore && l.store_id !== selStore) return false;
    if (search && !`${l.user_name} ${l.action} ${l.detail}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Flat paginated view
  const flatPg = usePagination(filtered, 30);

  // Group by date (today, yesterday, then each date)
  const grouped = filtered.reduce((acc, l) => {
    const d = l.created_at ? isoDate(l.created_at) : 'Unknown';
    if (!acc[d]) acc[d] = [];
    acc[d].push(l);
    return acc;
  }, {});

  const dateLabel = d => {
    const t = today();
    const yest = isoDate(new Date(Date.now() - 86400000));
    if (d === t)    return '📅 Today';
    if (d === yest) return '📅 Yesterday';
    return `📅 ${new Date(d).toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}`;
  };

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const toggle = d => setCollapsed(c => ({ ...c, [d]: !c[d] }));

  // Action colour mapping
  const actionColor = a => {
    if (a === 'login' || a === 'logout')          return '#e0f2fe';
    if (a?.includes('add') || a?.includes('create')) return '#dcfce7';
    if (a?.includes('edit') || a?.includes('update')) return '#fef9c3';
    if (a?.includes('delete') || a?.includes('dismiss')) return '#fee2e2';
    if (a === 'sale')                             return '#ede9fe';
    return 'var(--wash)';
  };

  return (
    <section className="view">
      <div className="sectionhead">
        <h2>Activity log <span className="count-badge">{filtered.length}</span></h2>
        <div style={{ display:'flex', gap:8 }}>
          <select
            value={selStore || ''}
            onChange={e => setSelStore(e.target.value || null)}
            style={{ border:'1.5px solid var(--line)', borderRadius:'var(--radius-sm)', padding:'8px 12px', background:'var(--card-bg)', fontSize:13 }}
          >
            <option value="">All stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            className="btn-delete"
            onClick={() => onClear(selStore || null)}
            title={selStore ? 'Clear log for this store' : 'Clear entire log'}
          >
            🗑 Clear{selStore ? ' store' : ' all'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom:14, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <input
          className="search"
          style={{ maxWidth:340 }}
          value={search}
          placeholder="Search by user, action or detail…"
          onChange={e => setSearch(e.target.value)}
        />
        <div className="filter-tabs" style={{marginBottom:0}}>
          <button className={viewMode==='grouped'?'active':''} onClick={()=>setViewMode('grouped')}>📅 By date</button>
          <button className={viewMode==='flat'?'active':''} onClick={()=>setViewMode('flat')}>📋 All entries</button>
        </div>
      </div>

      {/* ── Flat paginated view ─────────────────────────────── */}
      {viewMode === 'flat' && (
        <>
          <article className="card table">
            <table>
              <thead>
                <tr><th>Date/Time</th><th>Store</th><th>User</th><th>Role</th><th>Action</th><th>Detail</th><th></th></tr>
              </thead>
              <tbody>
                {flatPg.slice.map(l => (
                  <tr key={l.id}>
                    <td style={{whiteSpace:'nowrap', color:'var(--muted)', fontSize:11}}>
                      {new Date(l.created_at).toLocaleDateString('en-KE', {day:'numeric', month:'short'})}{' '}
                      {new Date(l.created_at).toLocaleTimeString('en-KE', {hour:'2-digit', minute:'2-digit'})}
                    </td>
                    <td style={{fontSize:12}}>{stores.find(s=>s.id===l.store_id)?.name || '—'}</td>
                    <td><b>{l.user_name}</b></td>
                    <td><span className="role-badge">{l.role}</span></td>
                    <td>
                      <span style={{background:actionColor(l.action), padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:'nowrap'}}>
                        {l.action}
                      </span>
                    </td>
                    <td style={{color:'var(--muted)', fontSize:12}}>{l.detail}</td>
                    <td>
                      <button className="btn-delete" style={{fontSize:11, padding:'3px 8px'}} onClick={() => onDelete(l.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          <Pagination {...flatPg} />
        </>
      )}

      {/* ── Grouped by date view ────────────────────────────── */}
      {viewMode === 'grouped' && (
        <>
          {sortedDates.length === 0 && (
            <article className="card"><p className="empty-state">No activity recorded.</p></article>
          )}
          <div className="store-groups">
            {sortedDates.map(d => {
              const entries = grouped[d];
              const isOpen  = !collapsed[d];

          return (
            <article key={d} className="card store-group">
              <button type="button" className="store-group-header" onClick={() => toggle(d)}>
                <div className="store-group-title">
                  <span className="store-group-chevron">{isOpen ? '▾' : '▸'}</span>
                  <span className="store-group-name">{dateLabel(d)}</span>
                  <span className="count-badge">{entries.length} events</span>
                </div>
                <button
                  type="button"
                  className="btn-delete"
                  style={{ fontSize:11, padding:'3px 9px' }}
                  onClick={e => { e.stopPropagation(); onClear(null); }}
                  title={`Delete all entries for ${d}`}
                  onClick={e => {
                    e.stopPropagation();
                    if (!window.confirm(`Delete all ${entries.length} entries for ${dateLabel(d)}?`)) return;
                    entries.forEach(l => onDelete(l.id));
                  }}
                >
                  🗑 Delete day
                </button>
              </button>

              {isOpen && (
                <div className="store-group-body">
                  <GroupedLogEntries entries={entries} actionColor={actionColor} onDelete={onDelete} />
                </div>
              )}
            </article>
          );
        })}
        </div>
        </>
      )}
    </section>
  );
}

function AdminRevenueTab({ allSales, fmt, totalRevenue, stores }) {
  const pg = usePagination(allSales, 25);
  return (
    <section className="view">
      <div className="metrics" style={{ marginBottom:16 }}>
        <Metric label="Total revenue" value={fmt(totalRevenue)} note="All stores all time" />
        <Metric label="Total sales"   value={allSales.length}   note="Transactions" />
        <Metric label="Today"         value={fmt(allSales.filter(s=>s.sale_date===today()).reduce((a,s)=>a+s.total,0))} note="All stores today" accent="green" />
        <Metric label="Avg per store" value={fmt(stores.length ? totalRevenue/stores.length : 0)} note="Per store" accent="amber" />
      </div>
      <article className="card table">
        <table>
          <thead><tr><th>Receipt</th><th>Store</th><th>Cashier</th><th>Customer</th><th>Method</th><th>Date</th><th>Amount</th></tr></thead>
          <tbody>
            {pg.slice.map(s=>(
              <tr key={s.id}>
                <td><code>#{String(s.id).slice(-6)}</code></td>
                <td>{s.stores?.name||'—'}</td>
                <td>{s.cashier_name}</td>
                <td>{s.customer_name}</td>
                <td><span className={`method-badge ${(s.method||'').toLowerCase().replace(/[^a-z]/g,'')}`}>{s.method}</span></td>
                <td>{s.sale_date}</td>
                <td><b>{fmt(s.total)}</b></td>
              </tr>
            ))}
            {!allSales.length&&<tr><td colSpan={7} className="empty-td">No sales recorded.</td></tr>}
          </tbody>
        </table>
      </article>
      <Pagination {...pg} />
    </section>
  );
}

function NewStoreModal({ save, close }) {
  const [d, setD] = useState({ name:'', address:'', phone:'', currency:'KSh', taxRate:16, businessType:'retail', managerName:'', managerEmail:'', managerPassword:'' });
  const set = (k,v) => setD(x=>({...x,[k]:v}));
  
  const businessTypes = [
    { value: 'retail', label: '🛒 Retail Store' },
    { value: 'hotel', label: '🍽️ Hotel/Restaurant' },
    { value: 'pharmacy', label: '💊 Pharmacy' },
    { value: 'electronics', label: '📱 Electronics' },
    { value: 'fashion', label: '👗 Fashion/Clothing' },
    { value: 'hardware', label: '🔧 Hardware Store' },
    { value: 'beauty', label: '💄 Beauty/Salon' },
    { value: 'auto', label: '🚗 Auto Parts' },
    { value: 'bookshop', label: '📚 Bookshop/Stationery' },
    { value: 'other', label: '🏪 Other' }
  ];
  
  return (
    <div className="modal">
      <form onSubmit={e=>{e.preventDefault();save(d);}}>
        <button type="button" className="close" onClick={close}>×</button>
        <p>NEW STORE</p>
        <h2>Add store & manager</h2>
        <label>Store name      <input required value={d.name}        onChange={e=>set('name',e.target.value)} /></label>
        <label>Address         <input value={d.address}     onChange={e=>set('address',e.target.value)} /></label>
        <label>Phone           <input value={d.phone}       onChange={e=>set('phone',e.target.value)} /></label>
        <label>
          Business Type
          <select value={d.businessType} onChange={e=>set('businessType',e.target.value)} required>
            {businessTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </label>
        <label>Currency        <input value={d.currency}    onChange={e=>set('currency',e.target.value)} /></label>
        <label>Tax rate (%)    <input type="number" value={d.taxRate} onChange={e=>set('taxRate',e.target.value)} /></label>
        <hr style={{border:'none',borderTop:'1px solid var(--line)'}}/>
        <p style={{fontSize:11,letterSpacing:'.1em',color:'var(--violet)',fontWeight:800}}>MANAGER ACCOUNT</p>
        <label>Manager name     <input required value={d.managerName}     onChange={e=>set('managerName',e.target.value)} /></label>
        <label>Manager email    <input required type="email" value={d.managerEmail}    onChange={e=>set('managerEmail',e.target.value)} placeholder="manager@store.com" /></label>
        <label>Manager password <input required type="password" minLength={6} value={d.managerPassword} onChange={e=>set('managerPassword',e.target.value)} placeholder="Min. 6 characters" /></label>
        <button className="primary">Create store</button>
      </form>
    </div>
  );
}

function ApprovalSuccessModal({ data, onClose, onSendWhatsApp }) {
  const message = formatCredentialsMessage(
    data.businessName,
    data.ownerName,
    data.email,
    data.password,
    data.plan
  );

  return (
    <div className="modal">
      <div className="modal-content" style={{maxWidth:520}}>
        <button type="button" className="close" onClick={onClose}>×</button>
        <div style={{textAlign:'center', marginBottom:20}}>
          <div style={{fontSize:48, marginBottom:8}}>✅</div>
          <h2 style={{marginBottom:6}}>Request Approved!</h2>
          <p style={{color:'var(--muted)', fontSize:14}}>Store created successfully</p>
        </div>

        <div className="approval-details">
          <div className="approval-row">
            <strong>Business:</strong>
            <span>{data.businessName}</span>
          </div>
          <div className="approval-row">
            <strong>Manager:</strong>
            <span>{data.ownerName}</span>
          </div>
          <div className="approval-row">
            <strong>Plan:</strong>
            <span className="role-badge">{data.plan}</span>
          </div>
          <hr style={{border:'none', borderTop:'1px solid var(--line)', margin:'16px 0'}} />
          <div className="approval-row">
            <strong>📧 Email:</strong>
            <code style={{fontSize:13, background:'var(--violet-lt)', padding:'4px 8px', borderRadius:6}}>{data.email}</code>
          </div>
          <div className="approval-row">
            <strong>🔑 Password:</strong>
            <code style={{fontSize:13, background:'var(--violet-lt)', padding:'4px 8px', borderRadius:6}}>{data.password}</code>
          </div>
        </div>

        <div style={{display:'flex', gap:10, marginTop:24}}>
          <button
            className="primary"
            style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8}}
            onClick={() => {
              onSendWhatsApp(data.phone, message);
              onClose();
            }}
          >
            <span style={{fontSize:18}}>📱</span>
            Send via WhatsApp
          </button>
          <button
            className="secondary"
            onClick={() => {
              navigator.clipboard.writeText(`Email: ${data.email}\nPassword: ${data.password}`);
              alert('Credentials copied to clipboard!');
            }}
          >
            📋 Copy
          </button>
        </div>
        <p style={{fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:12}}>
          ⚠️ Customer should change password after first login
        </p>
      </div>
    </div>
  );
}

function StaffAddedModal({ data, onClose, onSendWhatsApp }) {
  const message = `🎉 *Welcome to ${data.storeName}!*

You've been added as a ${data.role}.

*Your Login Credentials:*
📧 Email: ${data.email}
🔑 Password: ${data.password}

*Login here:* ${window.location.origin}/login

⚠️ *Please change your password after first login*

Questions? Contact your manager.`;

  return (
    <div className="modal">
      <div className="modal-content" style={{maxWidth:520}}>
        <button type="button" className="close" onClick={onClose}>×</button>
        <div style={{textAlign:'center', marginBottom:20}}>
          <div style={{fontSize:48, marginBottom:8}}>✅</div>
          <h2 style={{marginBottom:6}}>Staff Added!</h2>
          <p style={{color:'var(--muted)', fontSize:14}}>{data.staffName} has been added to your team</p>
        </div>

        <div className="approval-details">
          <div className="approval-row">
            <strong>Name:</strong>
            <span>{data.staffName}</span>
          </div>
          <div className="approval-row">
            <strong>Role:</strong>
            <span className="role-badge">{data.role}</span>
          </div>
          <hr style={{border:'none', borderTop:'1px solid var(--line)', margin:'16px 0'}} />
          <div className="approval-row">
            <strong>📧 Email:</strong>
            <code style={{fontSize:13, background:'var(--violet-lt)', padding:'4px 8px', borderRadius:6}}>{data.email}</code>
          </div>
          <div className="approval-row">
            <strong>🔑 Password:</strong>
            <code style={{fontSize:13, background:'var(--violet-lt)', padding:'4px 8px', borderRadius:6}}>{data.password}</code>
          </div>
        </div>

        <div style={{display:'flex', gap:10, marginTop:24}}>
          <button
            className="primary"
            style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8}}
            onClick={() => {
              onSendWhatsApp(data.phone, message);
              onClose();
            }}
          >
            <span style={{fontSize:18}}>📱</span>
            Send via WhatsApp
          </button>
          <button
            className="secondary"
            onClick={() => {
              navigator.clipboard.writeText(`Email: ${data.email}\nPassword: ${data.password}`);
              alert('Credentials copied!');
            }}
          >
            📋 Copy
          </button>
        </div>
        <p style={{fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:12}}>
          ⚠️ Staff should change password after first login
        </p>
      </div>
    </div>
  );
}

function StoreCreatedModal({ data, onClose, onSendWhatsApp }) {
  const message = `🎉 *Welcome to Vyro POS!*

Your store has been created.

*Store:* ${data.storeName}

*Manager Login Credentials:*
👤 Manager: ${data.managerName}
📧 Email: ${data.email}
🔑 Password: ${data.password}

*Login here:* ${window.location.origin}/login

⚠️ *Please change your password after first login*

Need help? Contact support.`;

  return (
    <div className="modal">
      <div className="modal-content" style={{maxWidth:520}}>
        <button type="button" className="close" onClick={onClose}>×</button>
        <div style={{textAlign:'center', marginBottom:20}}>
          <div style={{fontSize:48, marginBottom:8}}>🏪</div>
          <h2 style={{marginBottom:6}}>Store Created!</h2>
          <p style={{color:'var(--muted)', fontSize:14}}>{data.storeName} is ready to use</p>
        </div>

        <div className="approval-details">
          <div className="approval-row">
            <strong>Store:</strong>
            <span>{data.storeName}</span>
          </div>
          <div className="approval-row">
            <strong>Manager:</strong>
            <span>{data.managerName}</span>
          </div>
          <hr style={{border:'none', borderTop:'1px solid var(--line)', margin:'16px 0'}} />
          <div className="approval-row">
            <strong>📧 Email:</strong>
            <code style={{fontSize:13, background:'var(--violet-lt)', padding:'4px 8px', borderRadius:6}}>{data.email}</code>
          </div>
          <div className="approval-row">
            <strong>🔑 Password:</strong>
            <code style={{fontSize:13, background:'var(--violet-lt)', padding:'4px 8px', borderRadius:6}}>{data.password}</code>
          </div>
        </div>

        <div style={{display:'flex', gap:10, marginTop:24}}>
          <button
            className="primary"
            style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8}}
            onClick={() => {
              onSendWhatsApp(data.phone, message);
              onClose();
            }}
          >
            <span style={{fontSize:18}}>📱</span>
            Send via WhatsApp
          </button>
          <button
            className="secondary"
            onClick={() => {
              navigator.clipboard.writeText(`Email: ${data.email}\nPassword: ${data.password}`);
              alert('Credentials copied!');
            }}
          >
            📋 Copy
          </button>
        </div>
        <p style={{fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:12}}>
          ⚠️ Manager should change password after first login
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   M-PESA SETTINGS COMPONENT
───────────────────────────────────────────────────────────── */
function MpesaSettings({ storeId, notify }) {
  const [creds, setCreds] = useState(null);
  const [form, setForm] = useState({
    consumerKey: '',
    consumerSecret: '',
    businessShortcode: '',
    accountType: 'till',
    passkey: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (supabase && storeId) {
      loadCredentials();
      loadStats();
    }
  }, [storeId]);

  const loadCredentials = async () => {
    setLoading(true);
    const { data, error } = await getMpesaCredentials(storeId);
    if (data && !error) {
      setCreds(data);
      setForm({
        consumerKey: data.consumer_key || '',
        consumerSecret: data.consumer_secret || '',
        businessShortcode: data.business_shortcode || '',
        accountType: data.account_type || 'till',
        passkey: data.passkey || ''
      });
    }
    setLoading(false);
  };

  const loadStats = async () => {
    const { data } = await getMpesaStats(storeId);
    if (data) setStats(data);
  };

  const handleSave = async () => {
    if (!form.consumerKey || !form.consumerSecret || !form.businessShortcode) {
      notify('⚠️ Please fill all required fields');
      return;
    }

    setSaving(true);
    const { error } = await saveMpesaCredentials(
      storeId,
      form.consumerKey,
      form.consumerSecret,
      form.businessShortcode,
      form.accountType,
      form.passkey || null
    );
    setSaving(false);

    if (error) {
      notify(`❌ Error: ${error}`);
    } else {
      notify('✅ M-Pesa credentials saved successfully!');
      loadCredentials();
      loadStats();
    }
  };

  const handleTest = async () => {
    if (!form.consumerKey || !form.consumerSecret) {
      notify('⚠️ Enter Consumer Key and Secret first');
      return;
    }

    setTesting(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/mpesa/test-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumerKey: form.consumerKey,
          consumerSecret: form.consumerSecret
        })
      });

      const data = await response.json();
      if (data.success) {
        notify('✅ Credentials are valid!');
      } else {
        notify(`❌ ${data.error}`);
      }
    } catch (error) {
      notify(`❌ Error: ${error.message}`);
    }
    setTesting(false);
  };

  const handleRegisterUrls = async () => {
    // Check storeId is available
    if (!storeId) {
      notify('⚠️ Store ID not found. Please re-login.');
      return;
    }

    // Allow if we have creds saved OR if business_shortcode is filled
    const hasCreds = creds?.is_active || form.businessShortcode;
    if (!hasCreds) {
      notify('⚠️ Save your credentials first');
      return;
    }

    if (!confirm('Register callback URLs with M-Pesa? This tells M-Pesa where to send payment confirmations.')) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      console.log('Registering callbacks:', { backendUrl, storeId });

      const response = await fetch(`${backendUrl}/api/mpesa/register-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId })
      });

      const data = await response.json();
      console.log('Register response:', data);

      if (data.success) {
        notify('✅ Callback URLs registered successfully!');
      } else {
        notify(`❌ ${data.error}`);
      }
    } catch (error) {
      console.error('Register URLs error:', error);
      notify(`❌ Error: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <article className="card wide">
        <h2>💳 M-Pesa Lipa Na M-Pesa (C2B)</h2>
        <p style={{color:'var(--muted)',fontSize:13}}>Loading...</p>
      </article>
    );
  }

  return (
    <article className="card wide">
      <div className="cat-manager-head">
        <div>
          <h2>💳 M-Pesa Lipa Na M-Pesa (C2B)</h2>
          <p style={{color:'var(--muted)',fontSize:12,marginTop:4}}>
            Configure your own till number to accept M-Pesa payments directly
          </p>
        </div>
        <button
          className="btn-edit"
          onClick={() => setExpanded(!expanded)}
          style={{minWidth:100}}
        >
          {expanded ? 'Hide' : 'Configure'}
        </button>
      </div>

      {/* Stats preview */}
      {stats && !expanded && (
        <div style={{display:'flex',gap:16,marginTop:16,flexWrap:'wrap'}}>
          <div className="stat-mini">
            <small>Total Transactions</small>
            <strong>{stats.total_transactions || 0}</strong>
          </div>
          <div className="stat-mini">
            <small>Completed</small>
            <strong style={{color:'var(--green)'}}>{stats.completed_transactions || 0}</strong>
          </div>
          <div className="stat-mini">
            <small>Total Amount</small>
            <strong>{money(stats.total_amount || 0)}</strong>
          </div>
          <div className="stat-mini">
            <small>Today</small>
            <strong>{money(stats.today_amount || 0)}</strong>
          </div>
        </div>
      )}

      {/* Configuration form */}
      {expanded && (
        <>
          <div className="settings-fields" style={{marginTop:20}}>
            <div style={{background:'var(--blue-lt)',padding:12,borderRadius:8,marginBottom:16}}>
              <p style={{fontSize:13,margin:0}}>
                <strong>📘 How to get credentials:</strong><br/>
                1. Go to <a href="https://developer.safaricom.co.ke" target="_blank" style={{color:'var(--blue)'}}>Daraja Portal</a><br/>
                2. Create an app (sandbox or production)<br/>
                3. Copy Consumer Key, Consumer Secret, and Passkey<br/>
                4. Enter your till number below
              </p>
            </div>

            <label>
              Consumer Key *
              <input
                type="text"
                value={form.consumerKey}
                onChange={e => setForm({...form, consumerKey: e.target.value})}
                placeholder="Get from Daraja Portal"
              />
            </label>

            <label>
              Consumer Secret *
              <input
                type="password"
                value={form.consumerSecret}
                onChange={e => setForm({...form, consumerSecret: e.target.value})}
                placeholder="Get from Daraja Portal"
              />
            </label>

            <label>
              Till Number / Business Shortcode *
              <input
                type="text"
                value={form.businessShortcode}
                onChange={e => setForm({...form, businessShortcode: e.target.value})}
                placeholder="e.g. 174379 or 123456"
              />
              <small style={{color:'var(--muted)',fontSize:11}}>
                Your M-Pesa till number or paybill number
              </small>
            </label>

            <label>
              Account Type
              <select
                value={form.accountType}
                onChange={e => setForm({...form, accountType: e.target.value})}
              >
                <option value="till">Till Number</option>
                <option value="paybill">Paybill</option>
              </select>
            </label>

            <label>
              Passkey (for STK Push)
              <input
                type="password"
                value={form.passkey}
                onChange={e => setForm({...form, passkey: e.target.value})}
                placeholder="Optional - for online checkout"
              />
              <small style={{color:'var(--muted)',fontSize:11}}>
                Required only for STK Push (customer enters phone number on POS)
              </small>
            </label>
          </div>

          <div style={{display:'flex',gap:10,marginTop:20,flexWrap:'wrap'}}>
            <button
              className="primary"
              onClick={handleSave}
              disabled={saving}
              style={{minWidth:150}}
            >
              {saving ? 'Saving...' : '💾 Save Credentials'}
            </button>
            <button
              className="btn-edit"
              onClick={handleTest}
              disabled={testing}
              style={{minWidth:130}}
            >
              {testing ? 'Testing...' : '🧪 Test'}
            </button>
            {(creds?.is_active || form.businessShortcode) && (
              <button
                className="btn-view"
                onClick={handleRegisterUrls}
                style={{minWidth:160}}
              >
                🔗 Register Callbacks
              </button>
            )}
          </div>

          {(creds?.is_active || form.businessShortcode) && (
            <div style={{marginTop:16,padding:12,background:'var(--green-lt)',borderRadius:8}}>
              <small style={{fontSize:12,color:'var(--green)'}}>
                ✓ M-Pesa integration is active. Credentials are configured and ready to use.
              </small>
            </div>
          )}
        </>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
   SETTINGS — manager can add/manage cashiers
───────────────────────────────────────────────────────────── */
function SettingsPage({ settings, storeId, session, saveSettings, notify }) {
  const [s, setS]           = useState({...settings});
  const [storeUsers, setStoreUsers] = useState([]);
  const [modal, setModal]   = useState(null);
  const [showRenewal, setShowRenewal] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [plans, setPlans] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const changed = JSON.stringify(s) !== JSON.stringify(settings);

  // My Account state
  const [acct, setAcct] = useState({ email: '', password: '', confirmPassword: '' });
  const [acctBusy, setAcctBusy] = useState(false);

  useEffect(() => {
    if (supabase && storeId) {
      fetchStoreUsers(storeId).then(setStoreUsers);
      getPaymentConfig().then(setPaymentConfig);
      getSubscriptionPlans().then(p => setPlans(p.filter(x => x.id !== 'trial')));
      getStorePaymentHistory(storeId).then(setPaymentHistory);
    }
  }, [storeId]);

  const handleAddCashier = async data => {
    if (!supabase) { notify('Supabase required to add users.'); return; }
    if (!data.email || !data.password) { notify('Email and password are required.'); return; }
    if (!data.phone) { notify('Phone number is required to send credentials.'); return; }
    
    const { error } = await createUser({ store_id: storeId, name: data.name, email: data.email, password: data.password, role: data.role || 'cashier', active: true });
    if (error) { notify(`Error: ${error}`); return; }
    
    fetchStoreUsers(storeId).then(setStoreUsers);
    await logActivity(storeId, session?.userId, session?.name, session?.role, 'user_add', `Added ${data.role} ${data.name}`);
    
    // Show WhatsApp share modal
    setModal({
      type: 'staffAdded',
      data: {
        staffName: data.name,
        role: data.role || 'cashier',
        email: data.email,
        password: data.password,
        phone: data.phone,
        storeName: settings.storeName,
      },
    });
  };

  const handleDismiss = async (id, name) => {
    if (!window.confirm(`Dismiss ${name}?`)) return;
    await dismissUser(id);
    notify(`${name} dismissed.`);
    fetchStoreUsers(storeId).then(setStoreUsers);
    await logActivity(storeId, session?.userId, session?.name, session?.role, 'user_dismiss', `Dismissed ${name}`);
  };

  const handleUpdateAccount = async e => {
    e.preventDefault();
    if (!acct.email && !acct.password) { notify('Enter a new email or password to update.'); return; }
    if (acct.password && acct.password !== acct.confirmPassword) { notify('Passwords do not match.'); return; }
    if (acct.password && acct.password.length < 6) { notify('Password must be at least 6 characters.'); return; }
    setAcctBusy(true);
    const err = await userUpdateCredentials(session.userId, {
      email:    acct.email    || null,
      password: acct.password || null,
    });
    setAcctBusy(false);
    if (err) { notify(`Error: ${err}`); return; }
    notify('✅ Account updated successfully!');
    setAcct({ email: '', password: '', confirmPassword: '' });
    await logActivity(storeId, session?.userId, session?.name, session?.role, 'account_update', 'Updated email/password');
  };

  return (
    <section className="view">
      <div className="sectionhead">
        <h2>Settings</h2>
        {changed && <button className="primary" onClick={() => saveSettings(s)}>Save changes</button>}
      </div>

      <div className="settings-grid">
        {/* My Account card */}
        <article className="card wide" style={{marginBottom:4}}>
          <h2>🔐 My Account</h2>
          <p style={{color:'var(--muted)',fontSize:13,marginBottom:18}}>
            Logged in as <b>{session.name}</b> · Update your email or password below.
          </p>
          <form onSubmit={handleUpdateAccount}>
            <div className="settings-fields" style={{maxWidth:520}}>
              <label>
                New email address
                <input
                  type="email"
                  value={acct.email}
                  onChange={e=>setAcct({...acct,email:e.target.value})}
                  placeholder="Leave blank to keep current email"
                  autoComplete="email"
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  value={acct.password}
                  onChange={e=>setAcct({...acct,password:e.target.value})}
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                  minLength={6}
                />
              </label>
              {acct.password && (
                <label>
                  Confirm new password
                  <input
                    type="password"
                    value={acct.confirmPassword}
                    onChange={e=>setAcct({...acct,confirmPassword:e.target.value})}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />
                </label>
              )}
              <button
                type="submit"
                className="primary"
                disabled={acctBusy || (!acct.email && !acct.password)}
                style={{width:'fit-content', minHeight:44}}
              >
                {acctBusy ? 'Saving…' : 'Update account'}
              </button>
            </div>
          </form>
        </article>

        <article className="card">
          <h2>Store information</h2>          <div className="settings-fields">
            <label>Store name    <input value={s.storeName}    onChange={e=>setS({...s,storeName:e.target.value})} /></label>
            <label>Address       <input value={s.storeAddress} onChange={e=>setS({...s,storeAddress:e.target.value})} /></label>
            <label>Phone         <input value={s.storePhone}   onChange={e=>setS({...s,storePhone:e.target.value})} /></label>
            <label>Currency      <input value={s.currency}     onChange={e=>setS({...s,currency:e.target.value})} /></label>
            <label>Tax rate (%)  <input type="number" min="0" max="100" value={s.taxRate} onChange={e=>setS({...s,taxRate:+e.target.value})} /></label>
          </div>
        </article>

        <article className="card">
          <h2>Loyalty & appearance</h2>
          <div className="settings-fields">
            <label>KSh spent per point
              <input type="number" min="1" value={s.loyaltySpend||1000} onChange={e=>setS({...s,loyaltySpend:+e.target.value})} />
              <small style={{color:'var(--muted)',fontSize:11}}>e.g. 1000 = 1 point per KSh 1,000 spent</small>
            </label>
            <label>Points to redeem KSh 1
              <input type="number" min="1" value={s.loyaltyRedeem||100} onChange={e=>setS({...s,loyaltyRedeem:+e.target.value})} />
              <small style={{color:'var(--muted)',fontSize:11}}>e.g. 100 = 100 points = KSh 1 discount</small>
            </label>
            <label>Minimum points to redeem
              <input type="number" min="1" value={s.loyaltyMinRedeem||100} onChange={e=>setS({...s,loyaltyMinRedeem:+e.target.value})} />
              <small style={{color:'var(--muted)',fontSize:11}}>Customer needs at least this many points before redemption is allowed</small>
            </label>
          </div>
          <label className="toggle-label" style={{marginTop:16}}>
            Dark mode
            <button className={`toggle ${s.darkMode?'on':''}`} onClick={()=>setS({...s,darkMode:!s.darkMode})}>{s.darkMode?'ON':'OFF'}</button>
          </label>
        </article>

        {/* M-Pesa Configuration */}
        <MpesaSettings storeId={storeId} notify={notify} />

        <article className="card wide">
          <div className="cat-manager-head">
            <h2>Staff <span className="count-badge">{storeUsers.length}</span></h2>
            <button className="primary" onClick={() => setModal('addUser')}>+ Add staff</button>
          </div>
          <p style={{color:'var(--muted)',fontSize:12,marginBottom:14}}>
            Managers can add and dismiss cashiers for their store. Cashiers can process sales and view customers.
          </p>
          <div className="staff-list">
            {storeUsers.map(u => (
              <div key={u.id} className="staff-card">
                <div className="staff-card-info">
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:38,height:38,borderRadius:'50%',background:'var(--violet-lt)',display:'grid',placeItems:'center',fontSize:16,flexShrink:0}}>
                      {u.role==='manager'?'🏪':'💳'}
                    </div>
                    <div>
                      <b style={{fontSize:15}}>{u.name}</b>
                      <div style={{display:'flex',gap:6,marginTop:3,flexWrap:'wrap'}}>
                        <span className="role-badge">{u.role}</span>
                        <span className={`stock-pill ${u.active?'green':'danger'}`} style={{fontSize:10}}>{u.active?'Active':'Dismissed'}</span>
                      </div>
                    </div>
                  </div>
                  <small style={{color:'var(--muted)',fontSize:11,marginTop:4,display:'block',paddingLeft:48}}>
                    Last login: {u.last_login ? new Date(u.last_login).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Never'}
                  </small>
                </div>
                {u.id !== session.userId && (
                  <button
                    className={u.active?'btn-delete':'btn-edit'}
                    style={{alignSelf:'flex-start',marginTop:4}}
                    onClick={() => u.active ? handleDismiss(u.id,u.name) : reinstateUser(u.id).then(()=>fetchStoreUsers(storeId).then(setStoreUsers))}
                  >
                    {u.active ? 'Dismiss' : 'Reinstate'}
                  </button>
                )}
              </div>
            ))}
            {!storeUsers.length && <p className="empty-state">No staff yet. Add cashiers above.</p>}
          </div>
        </article>
      </div>

      {modal === 'addUser' && (
        <div className="modal">
          <form onSubmit={e=>{e.preventDefault();handleAddCashier(Object.fromEntries(new FormData(e.target)));}}>
            <button type="button" className="close" onClick={()=>setModal(null)}>×</button>
            <p>ADD STAFF</p><h2>New staff member</h2>
            <label>Full name      <input name="name"     required placeholder="e.g. Jane Doe" /></label>
            <label>Phone number   <input name="phone"    required type="tel" placeholder="e.g. 0712345678" /></label>
            <label>Email address  <input name="email"    required type="email" placeholder="jane@store.com" /></label>
            <label>Password       <input name="password" required type="password" minLength={6} placeholder="Min. 6 characters" /></label>
            <label>Role
              <select name="role">
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
              </select>
            </label>
            <button className="primary">Add staff member</button>
          </form>
        </div>
      )}

      {/* Staff added success modal with WhatsApp */}
      {modal?.type === 'staffAdded' && (
        <StaffAddedModal
          data={modal.data}
          onClose={() => setModal(null)}
          onSendWhatsApp={(phone, message) => sendWhatsApp(phone, message)}
        />
      )}

      {/* Store created success modal with WhatsApp */}
      {modal?.type === 'storeCreated' && (
        <StoreCreatedModal
          data={modal.data}
          onClose={() => setModal(null)}
          onSendWhatsApp={(phone, message) => sendWhatsApp(phone, message)}
        />
      )}

      {/* ── Subscription & Billing ─────────────────────────── */}
      {supabase && (
        <article className="card wide" style={{marginTop: 24}}>
          <h2>📋 Subscription &amp; Billing</h2>

          {/* Status strip */}
          <div className="subscription-status" style={{marginBottom: 20}}>
            <h3>Current Plan</h3>
            <div className="status-grid">
              <div className="status-item">
                <small>Plan</small>
                <div><b>{session.subscription_plan || 'trial'}</b></div>
              </div>
              <div className="status-item">
                <small>Status</small>
                <div>
                  <span className={`stock-pill ${session.subscription_status === 'expired' ? 'danger' : session.days_remaining <= 7 && session.days_remaining > 0 ? 'warning' : 'green'}`}>
                    {session.subscription_status || 'active'}
                  </span>
                </div>
              </div>
              <div className="status-item">
                <small>Expires</small>
                <div>
                  {session.subscription_ends_at
                    ? new Date(session.subscription_ends_at).toLocaleDateString('en-KE')
                    : '—'}
                  {session.days_remaining != null && (
                    <small style={{display:'block', color:'var(--muted)', fontSize:11}}>
                      {session.days_remaining} days left
                    </small>
                  )}
                </div>
              </div>
              <div className="status-item">
                <small>Cashier limit</small>
                <div><b>{session.cashier_limit || 3}</b></div>
              </div>
            </div>
          </div>

          {/* Expiry banners */}
          {session.subscription_status === 'expired' && (
            <div className="alert-banner danger" style={{marginBottom: 16}}>
              ⚠️ Your subscription has expired. Renew now to continue using the system.
            </div>
          )}
          {session.days_remaining <= 7 && session.days_remaining > 0 && (
            <div className="alert-banner warning" style={{marginBottom: 16}}>
              ⏰ Subscription expires in <b>{session.days_remaining} day{session.days_remaining !== 1 ? 's' : ''}</b>. Renew to avoid interruption.
            </div>
          )}

          <button className="primary" style={{width:'100%', marginBottom: 20, minHeight: 48}} onClick={() => setShowRenewal(true)}>
            🔄 Renew / Upgrade Subscription
          </button>

          {/* Payment history */}
          <h3 style={{marginBottom: 12, fontSize: 14, fontWeight: 700}}>Payment History</h3>

          {/* Desktop table */}
          <div className="settings-pay-table">
            <table style={{width:'100%'}}>
              <thead>
                <tr><th>Date</th><th>Plan</th><th>Amount</th><th>M-Pesa Code</th><th>Status</th></tr>
              </thead>
              <tbody>
                {paymentHistory.map(p => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleDateString('en-KE')}</td>
                    <td>{p.plan}</td>
                    <td><b>KSh {Number(p.amount).toLocaleString()}</b></td>
                    <td><code>{p.mpesa_code || '—'}</code></td>
                    <td>
                      <span className={`stock-pill ${p.status === 'approved' ? 'green' : p.status === 'rejected' ? 'danger' : 'amber'}`}>
                        {p.status}
                      </span>
                      {p.status === 'rejected' && p.rejection_reason && (
                        <small style={{display:'block', color:'var(--coral)', fontSize:11}}>{p.rejection_reason}</small>
                      )}
                    </td>
                  </tr>
                ))}
                {!paymentHistory.length && (
                  <tr><td colSpan={5} className="empty-td">No payment history yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="settings-pay-cards">
            {paymentHistory.length === 0 && (
              <p style={{color:'var(--muted)', fontSize:13, textAlign:'center', padding:'16px 0'}}>No payment history yet.</p>
            )}
            {paymentHistory.map(p => (
              <div key={p.id} style={{
                background:'var(--wash)', borderRadius:12, padding:'14px 16px',
                border:'1.5px solid var(--line)', marginBottom: 8,
              }}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
                  <div>
                    <b style={{fontSize:14, display:'block'}}>{p.plan?.replace(/_/g,' ')}</b>
                    <small style={{color:'var(--muted)', fontSize:12}}>
                      {new Date(p.created_at).toLocaleDateString('en-KE', {day:'numeric', month:'short', year:'numeric'})}
                    </small>
                  </div>
                  <span className={`stock-pill ${p.status === 'approved' ? 'green' : p.status === 'rejected' ? 'danger' : 'amber'}`}>
                    {p.status === 'approved' ? '✓ Approved' : p.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                  </span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <b style={{fontSize:18, color:'var(--violet)'}}>KSh {Number(p.amount).toLocaleString()}</b>
                  {p.mpesa_code && (
                    <code style={{fontSize:12, background:'var(--violet-lt)', color:'var(--violet)', padding:'3px 8px', borderRadius:6, letterSpacing:1}}>
                      {p.mpesa_code}
                    </code>
                  )}
                </div>
                {p.status === 'rejected' && p.rejection_reason && (
                  <p style={{marginTop:6, fontSize:12, color:'var(--coral)'}}>{p.rejection_reason}</p>
                )}
              </div>
            ))}
          </div>
        </article>
      )}

      {showRenewal && (
        <ManagerRenewalModal
          storeId={storeId}
          userId={session.userId}
          paymentConfig={paymentConfig}
          plans={plans}
          onClose={() => setShowRenewal(false)}
          onSuccess={() => {
            setShowRenewal(false);
            getStorePaymentHistory(storeId).then(setPaymentHistory);
            notify('✅ Renewal request submitted! Awaiting admin approval.');
          }}
          notify={notify}
        />
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────────────────────────── */
function Dashboard({ sales, customers, expenses, products, money, total, setPage, open, todaySalesAmt, lowStock, session, restaurantOrders=[], roomBookings=[] }) {
  // ── Date helpers ──
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); };
  const salesInRange = (from, to) => sales.filter(s => s.isoDate >= from && s.isoDate <= to);

  // ── Unified revenue calculation (Retail + Restaurant + Room Bookings) ──
  const todayStr   = today();
  
  // Calculate today's revenue from all sources
  const todayRestaurantRev = restaurantOrders
    .filter(o => (o.status === 'completed' || o.status === 'paid'))
    .filter(o => {
      const d = o.created_at ? isoDate(new Date(o.created_at)) : todayStr;
      return d === todayStr;
    })
    .reduce((sum, o) => sum + (o.total || 0), 0);
  
  const todayRoomRev = roomBookings
    .filter(b => b.booking_status === 'checked_out')
    .filter(b => {
      const d = b.check_out_date ? isoDate(new Date(b.check_out_date)) : todayStr;
      return d === todayStr;
    })
    .reduce((sum, b) => sum + (b.total || 0), 0);
  
  const todayUnifiedRev = todaySalesAmt + todayRestaurantRev + todayRoomRev;

  // ── KPI: compare this period vs last ──
  const weekStart  = daysAgo(6);
  const prevWeekS  = daysAgo(13);
  const prevWeekE  = daysAgo(7);
  const monthStart = todayStr.slice(0,7) + '-01';
  const prevMoEnd  = new Date(new Date(monthStart) - 1);
  const prevMoStart = isoDate(new Date(prevMoEnd.getFullYear(), prevMoEnd.getMonth(), 1));

  const thisWeekSales = salesInRange(weekStart, todayStr);
  const prevWeekSales = salesInRange(prevWeekS, prevWeekE);
  const thisMoSales   = sales.filter(s => s.isoDate >= monthStart);
  const prevMoSales   = salesInRange(prevMoStart, isoDate(prevMoEnd));

  const thisWeekRev = total(thisWeekSales);
  const prevWeekRev = total(prevWeekSales);
  const thisMoRev   = total(thisMoSales);
  const prevMoRev   = total(prevMoSales);

  const weekChg  = prevWeekRev > 0 ? ((thisWeekRev - prevWeekRev) / prevWeekRev) * 100 : null;
  const monthChg = prevMoRev   > 0 ? ((thisMoRev   - prevMoRev)   / prevMoRev)   * 100 : null;

  // ── 30-day trend ──
  const days30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    const iso = isoDate(d);
    return { iso, label: d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }), shortLabel: d.getDate() === 1 || i === 0 || i === 29 ? d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : (i % 7 === 0 ? d.toLocaleDateString('en-KE', { day: 'numeric' }) : '') };
  });
  const trend30 = days30.map((d, i) => ({
    // Only show label on first, last, and every 7th bar
    label: (i === 0 || i === 29 || i % 7 === 0) ? d.shortLabel : '',
    value: total(sales.filter(s => s.isoDate === d.iso)),
  }));

  // ── Spark data (last 7 days per metric) ──
  const sparkRevenue = Array.from({length:7}, (_,i) => total(sales.filter(s => s.isoDate === daysAgo(6-i))));
  const sparkTx      = Array.from({length:7}, (_,i) => sales.filter(s => s.isoDate === daysAgo(6-i)).length);

  // ── Payment method split ──
  const methods = {};
  thisWeekSales.forEach(s => { methods[s.method] = (methods[s.method] || 0) + s.total; });
  const methodColors = { 'M-Pesa':'#10b981', 'Cash':'#f59e0b', 'Card':'#3b82f6', 'Credit':'#ef4444' };
  const methodData = Object.entries(methods).map(([k,v]) => ({ label:k, value:v, color: methodColors[k]||'#7c3aed' })).sort((a,b)=>b.value-a.value);

  // ── Top products by revenue (all time) ──
  const prodRev = {};
  sales.forEach(s => s.items?.forEach(item => {
    prodRev[item.id] = (prodRev[item.id] || { name: item.name, icon: item.icon || '🏷️', rev: 0, qty: 0 });
    prodRev[item.id].rev += item.price * item.qty;
    prodRev[item.id].qty += item.qty;
  }));
  const topProds = Object.values(prodRev).sort((a,b) => b.rev - a.rev).slice(0,7).map(p => ({
    label: p.name, icon: p.icon, value: p.rev, sublabel: `${p.qty} sold`,
    color: 'var(--violet)',
  }));

  // ── Net revenue this month ──
  const monthExp = total(expenses.filter(e => e.isoDate >= monthStart));
  const monthRevStr = money(thisMoRev);

  return (
    <section className="view">
      {/* KPI Row */}
      <div className="bi-kpi-grid">
        <KpiCard label="Today's Revenue" value={money(todayUnifiedRev)}
          note={`Retail: ${money(todaySalesAmt)} + Restaurant: ${money(todayRestaurantRev)} + Rooms: ${money(todayRoomRev)}`}
          sparkData={sparkRevenue} color="#7c3aed" accent="violet" />
        <KpiCard label="This Week" value={money(thisWeekRev)}
          note={`${thisWeekSales.length} transactions`}
          change={weekChg} sparkData={sparkRevenue} color="#0ea5e9" accent="blue" />
        <KpiCard label="This Month" value={monthRevStr}
          note={`${thisMoSales.length} transactions`}
          change={monthChg} sparkData={sparkRevenue} color="#10b981" accent="green" />
        <KpiCard label="Monthly Expenses" value={money(monthExp)}
          note="Operating costs" sparkData={Array.from({length:7},(_,i)=>total(expenses.filter(e=>e.isoDate>=daysAgo(6-i)&&e.isoDate<=daysAgo(5-i))))}
          color="#ef4444" accent="coral" />
      </div>

      {/* 30-day trend */}
      <div className="card" style={{marginBottom:20,padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h2 style={{margin:0}}>Revenue — last 30 days</h2>
          <span style={{fontSize:12,color:'var(--muted)'}}>Daily totals</span>
        </div>
        <BarChart data={trend30} height={180} color="#7c3aed" />
      </div>

      <div className="bi-row wide-left">
        {/* Top products */}
        <article className="card">
          <h2>Top products by revenue</h2>
          <HBarChart data={topProds} color="#7c3aed" />
          {!topProds.length && <p className="empty-state">No sales data yet.</p>}
        </article>

        {/* Payment methods */}
        <article className="card">
          <h2>Payment methods</h2>
          <p style={{fontSize:12,color:'var(--muted)',marginTop:0,marginBottom:16}}>This week</p>
          {methodData.length > 0
            ? <DonutChart data={methodData} size={130} />
            : <p className="empty-state">No sales this week.</p>}
        </article>
      </div>

      <div className="bi-row">
        {/* Quick actions */}
        <article className="card">
          <h2>Quick actions</h2>
          <div className="actions">
            <button onClick={()=>setPage('pos')}>New sale</button>
            <button onClick={()=>open('purchase')}>Record purchase</button>
            <button onClick={()=>setPage('products')}>Manage products</button>
            <button onClick={()=>open('expense')}>Add expense</button>
          </div>
        </article>

        {/* Subscription status */}
        {session && (
          <article className={`card sub-card ${session.subscription_status==='expired'?'sub-card-danger':session.days_remaining!=null&&session.days_remaining<=7?'sub-card-warn':''}`}>
            <div className="sub-card-header">
              <span className="sub-card-icon">💳</span>
              <h2>Subscription</h2>
              {session.subscription_status==='expired'
                ? <span className="stock-pill danger">Expired</span>
                : <span className="stock-pill green">Active</span>}
            </div>
            <div className="sub-card-body">
              <div className="sub-card-stat"><small>Plan</small><b>{(session.subscription_plan||'trial').replace(/_/g,' ')}</b></div>
              <div className="sub-card-stat"><small>Cashier limit</small><b>{session.cashier_limit||3}</b></div>
              <div className="sub-card-stat"><small>Expires</small><b>{session.subscription_ends_at?new Date(session.subscription_ends_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}):'—'}</b></div>
              <div className="sub-card-stat"><small>Days left</small><b style={{color:session.days_remaining<=7?'var(--coral)':'inherit'}}>{session.days_remaining!=null?session.days_remaining:'—'}</b></div>
            </div>
            {session.subscription_status==='expired'&&<p className="sub-card-msg danger">⚠️ Your subscription has expired. Renew now to avoid losing access.</p>}
            {session.subscription_status!=='expired'&&session.days_remaining!=null&&session.days_remaining<=7&&<p className="sub-card-msg warn">⏰ Expiring in {session.days_remaining} day{session.days_remaining!==1?'s':''}. Renew before it's too late.</p>}
            <button className="primary sub-card-btn" onClick={()=>setPage('subscription')}>{session.subscription_status==='expired'?'🔄 Renew Now':'💳 Manage Subscription'}</button>
          </article>
        )}
      </div>

      {/* Low stock */}
      {lowStock.length > 0 && (
        <article className="card wide low-stock-card" style={{marginBottom:20}}>
          <h2>⚠ Low stock alerts</h2>
          {lowStock.map(p=>(
            <div className="line" key={p.id}>
              <span>{p.icon} {p.name} {p.brand&&<em>{p.brand}</em>}</span>
              <span className="stock-pill danger">{p.stock} left</span>
            </div>
          ))}
        </article>
      )}

      {/* Recent sales */}
      <article className="card wide">
        <h2>Recent sales</h2>
        {sales.slice(0,6).map(s=>(
          <div className="line" key={s.id}>
            <span>{s.customer}<small>{s.date} · {s.method} · by {s.cashier}</small></span>
            <b>{money(s.total)}</b>
          </div>
        ))}
        {!sales.length&&<p className="empty-state">No sales yet.</p>}
      </article>
    </section>
  );
}

function Metric({label,value,note,accent='violet'}) {
  return <article data-accent={accent}><small>{label}</small><strong>{value}</strong><em>{note}</em></article>;
}

/* ─────────────────────────────────────────────────────────────
   POS
───────────────────────────────────────────────────────────── */
function POS({products,categories,cart,addToCart,setCart,sub,discAmt,taxAmt,grand,discount,setDiscount,redeemPts,setRedeemPts,money,category,setCategory,query,setQuery,filtered,customers,checkout,open,notify,taxRate,loyaltySpend,loyaltyRedeem,loyaltyMin}) {
  const [customerId,setCustomerId]=useState('');
  const [method,setMethod]=useState('M-Pesa');
  const [custSearch,setCustSearch]=useState('');
  const [custOpen,setCustOpen]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [mobileTab,setMobileTab]=useState('catalog'); // 'catalog' | 'cart'
  const custRef=useRef(null);

  // Close dropdown when clicking outside
  useEffect(()=>{
    const h=e=>{if(custRef.current&&!custRef.current.contains(e.target))setCustOpen(false);};
    document.addEventListener('mousedown',h);
    return()=>document.removeEventListener('mousedown',h);
  },[]);

  const custFiltered = custSearch.trim()
    ? customers.filter(c=>`${c.name} ${c.phone||''}`.toLowerCase().includes(custSearch.toLowerCase()))
    : customers;

  const selectCustomer = c => {
    setCustomerId(c ? c.id : '');
    setCustSearch(c ? c.name : '');
    setCustOpen(false);
  };

  // Handle barcode detected from scanner
  const handleBarcodeScan = useCallback(code => {
    console.log('🔍 Barcode scanned:', code);
    const p = products.find(x => x.barcode === code);
    console.log('📦 Product found:', p);
    
    if (p) {
      addToCart(p.id);
      notify(`✓ ${p.name} added`);
      playBeep(); // Success beep
      setScanning(false); // Close scanner after successful scan
    } else {
      notify(`❌ No product found for barcode: ${code}`);
      playErrorBeep(); // Error beep
    }
  }, [products]);

  const allCats = [...new Set([...categories, ...products.map(p => p.category).filter(Boolean)])].sort();
  const cats=['All', ...allCats];
  const customer=customers.find(c=>c.id===customerId);
  const pts        = customer?.points || 0;
  const canRedeem  = pts >= loyaltyMin;
  const loyaltyDiscount = redeemPts && canRedeem ? Math.floor(pts / loyaltyRedeem) : 0;
  const finalTotal = Math.max(0, grand - loyaltyDiscount);
  const ptsToEarn  = Math.floor(grand / loyaltySpend);

  return (
    <section className="pos">
      {scanning && (
        <BarcodeScanner
          onDetect={handleBarcodeScan}
          onClose={() => setScanning(false)}
        />
      )}
      <div className={`catalog${mobileTab==='cart'?' pos-hidden':''}`}>
        <div className="sectionhead"><h2>New sale</h2><button onClick={()=>open('product')}>+ Product</button></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <input className="search" style={{flex:1}} value={query} placeholder="Search by name, brand or scan barcode…" onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){const p=products.find(x=>x.barcode===query);if(p){addToCart(p.id);setQuery('');}else notify('No product found for that barcode.');}}} />
          <button className="scan-btn" onClick={()=>setScanning(true)} title="Open camera scanner">
            <span className="scan-btn-icon">📷</span> Scan
          </button>
        </div>
        <div className="cats">{cats.map(c=><button key={c} className={c===category?'sel':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        <div className="products">
          {filtered.map(p=>(
            <button className={`product${(p.stock??Infinity)<=0?' out-of-stock':''}`} onClick={()=>addToCart(p.id)} key={p.id}>
              <i>{p.icon||'🏷️'}</i><b>{p.name}</b>
              {p.brand&&<span className="brand-tag">{p.brand}</span>}
              <small>{p.category}</small><strong>{money(p.price)}</strong>
              {p.stock!==undefined&&<span className={`stock-pill${p.stock<=(p.low_stock||p.lowStock||5)?' danger':''}`}>{p.stock<=0?'Out of stock':`${p.stock} left`}</span>}
            </button>
          ))}
          {!filtered.length&&<p className="empty-state">No products found.</p>}
        </div>
      </div>
      <aside className={`cart${mobileTab==='catalog'?' pos-hidden':''}`}>
        {/* ── Cart header ── */}
        <div className="cart-header">
          <h2>Current order</h2>
          {cart.length>0&&<span className="cart-count">{cart.reduce((s,x)=>s+x.qty,0)}</span>}
          {cart.length>0&&<button className="cart-clear-btn" onClick={()=>setCart([])}>Clear</button>}
        </div>

        {/* ── Item list ── */}
        <div className="cart-items">
          {cart.map(x=>(
            <div className="cart-line" key={x.id}>
              <div className="cart-item-info">
                <b>{x.name}</b>
                {x.brand&&<span className="cart-brand">{x.brand}</span>}
                <small>{money(x.price)} each</small>
              </div>
              <div className="cart-item-controls">
                <button onClick={()=>setCart(c=>c.map(y=>y.id===x.id?{...y,qty:Math.max(1,y.qty-1)}:y))}>−</button>
                <span>{x.qty}</span>
                <button onClick={()=>setCart(c=>c.map(y=>y.id===x.id?{...y,qty:y.qty+1}:y))}>+</button>
                <b>{money(x.qty*x.price)}</b>
                <button className="remove-btn" onClick={()=>setCart(c=>c.filter(y=>y.id!==x.id))}>✕</button>
              </div>
            </div>
          ))}
          {!cart.length&&(
            <div className="cart-empty-state">
              <span style={{fontSize:36}}>🛒</span>
              <p>Cart is empty</p>
              <small>Tap a product to add it</small>
            </div>
          )}
        </div>

        {/* ── Footer (only shown when cart has items) ── */}
        <div className="cart-footer">

          {/* Customer search */}
          <div className="cart-field">
            <label className="cart-label">Customer</label>
            <div ref={custRef} style={{position:'relative'}}>
              <div style={{position:'relative',display:'flex',alignItems:'center'}}>
                <input
                  className="cart-input"
                  style={{paddingRight:customerId?32:12}}
                  placeholder="Walk-in customer…"
                  value={custSearch}
                  onChange={e=>{setCustSearch(e.target.value);setCustOpen(true);if(!e.target.value)setCustomerId('');}}
                  onFocus={()=>setCustOpen(true)}
                  autoComplete="off"
                />
                {customerId&&<button type="button" onClick={()=>selectCustomer(null)} style={{position:'absolute',right:10,background:'none',color:'var(--muted)',fontSize:18,padding:0,lineHeight:1,border:'none',cursor:'pointer'}}>×</button>}
              </div>
              {custOpen&&(
                <div className="cust-dropdown">
                  <div className="cust-option cust-walkin" onMouseDown={()=>selectCustomer(null)}>Walk-in customer</div>
                  {custFiltered.length===0&&<div className="cust-option" style={{color:'var(--muted)'}}>No customers found</div>}
                  {custFiltered.map(c=>(
                    <div key={c.id} className={`cust-option${c.id===customerId?' selected':''}`} onMouseDown={()=>selectCustomer(c)}>
                      <span><b>{c.name}</b><span className="cust-phone">{c.phone||''}</span></span>
                      {c.points>0&&<span className="stock-pill" style={{fontSize:11}}>{c.points} pts</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Payment method + Discount row */}
          <div className="cart-row-2">
            <div className="cart-field">
              <label className="cart-label">Payment</label>
              <select className="cart-input" value={method} onChange={e=>setMethod(e.target.value)}>
                <option>M-Pesa</option><option>Cash</option><option>Card</option><option>Credit</option>
              </select>
            </div>
            <div className="cart-field">
              <label className="cart-label">Discount %</label>
              <input className="cart-input" type="number" min="0" max="100" value={discount} onChange={e=>setDiscount(Math.min(100,Math.max(0,+e.target.value)))} />
            </div>
          </div>

          {/* Totals */}
          <div className="cart-totals">
            <div className="totals-row"><span>Subtotal</span><span>{money(sub)}</span></div>
            {discount>0&&<div className="totals-row green"><span>Discount ({discount}%)</span><span>−{money(discAmt)}</span></div>}
            {taxRate>0&&<div className="totals-row"><span>Tax ({Math.round(taxRate*100)}%)</span><span>{money(taxAmt)}</span></div>}
            {loyaltyDiscount>0&&<div className="totals-row green"><span>Loyalty discount</span><span>−{money(loyaltyDiscount)}</span></div>}
            <div className="totals-grand"><span>Total</span><span>{money(finalTotal)}</span></div>
          </div>

          {/* Loyalty block */}
          {customer&&(
            <div className={`loyalty-block${canRedeem?' redeemable':''}`}>
              <div className="loyalty-info">
                <span>🎁 <b>{customer.name}</b></span>
                <span className={`loyalty-pts-badge${canRedeem?' ready':''}`}>{pts} pts</span>
              </div>
              {canRedeem?(
                <label className="loyalty-redeem-row">
                  <span>Redeem {pts} pts → <b>{money(Math.floor(pts/loyaltyRedeem))} off</b></span>
                  <button type="button" className={`toggle${redeemPts?' on':''}`} onClick={()=>setRedeemPts(r=>!r)}>{redeemPts?'ON':'OFF'}</button>
                </label>
              ):(
                <p className="loyalty-progress">Earns <b>+{ptsToEarn} pts</b> this sale · needs <b>{Math.max(0,loyaltyMin-pts)} more</b> to redeem</p>
              )}
              {!canRedeem&&pts>0&&(
                <div className="loyalty-bar-wrap">
                  <div className="loyalty-bar" style={{width:`${Math.min(100,Math.round(pts/loyaltyMin*100))}%`}}/>
                  <span>{pts}/{loyaltyMin} pts</span>
                </div>
              )}
            </div>
          )}
          {!customer&&cart.length>0&&(
            <p className="loyalty-note">🎁 Select a customer to earn loyalty points</p>
          )}

          {/* Charge button */}
          <button className="checkout" disabled={!cart.length} onClick={()=>checkout(method,customerId)}>
            Charge {method} · <span>{money(finalTotal)}</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile tab bar ── */}
      <div className="pos-mobile-tabs">
        <button
          className={`pos-tab${mobileTab==='catalog'?' active':''}`}
          onClick={()=>setMobileTab('catalog')}
        >
          🛍 Products
        </button>
        <button
          className={`pos-tab${mobileTab==='cart'?' active':''}`}
          onClick={()=>setMobileTab('cart')}
        >
          🛒 Cart
          {cart.length>0&&<span className="pos-tab-badge">{cart.reduce((s,x)=>s+x.qty,0)}</span>}
        </button>
      </div>

      {/* ── Floating cart button (catalog view, mobile) ── */}
      {mobileTab==='catalog' && cart.length>0 && (
        <button className="pos-cart-fab" onClick={()=>setMobileTab('cart')}>
          🛒 {cart.reduce((s,x)=>s+x.qty,0)} item{cart.reduce((s,x)=>s+x.qty,0)!==1?'s':''} · {money(finalTotal)}
        </button>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   RECEIPT MODAL
───────────────────────────────────────────────────────────── */
function ReceiptModal({sale,settings,close}) {
  const ref = useRef();
  const fmt = n => money(n, settings.currency);

  const print = () => {
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head>
<title>Receipt — ${settings.storeName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 12px;
    width: 320px;
    margin: 0 auto;
    color: #1e2035;
    background: #fff;
    padding: 24px 20px;
  }
  .rcpt-logo-wrap {
    text-align: center;
    margin-bottom: 12px;
  }
  .rcpt-logo-wrap img {
    height: 52px;
    width: auto;
    object-fit: contain;
  }
  .rcpt-logo-fallback {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 800;
    font-size: 18px;
  }
  .rcpt-logo-mark {
    width: 36px; height: 36px;
    background: linear-gradient(135deg,#6c4ff6,#f04f44);
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 17px;
    font-weight: 800;
  }
  .rcpt-store { text-align: center; margin-bottom: 14px; }
  .rcpt-store h2 { font-size: 16px; font-weight: 800; margin-bottom: 3px; }
  .rcpt-store p  { font-size: 11px; color: #666; line-height: 1.5; }
  .rcpt-divider  { border: none; border-top: 1px dashed #ccc; margin: 12px 0; }
  .rcpt-meta     { font-size: 11px; color: #444; line-height: 1.8; margin-bottom: 4px; }
  .rcpt-meta b   { color: #1e2035; }
  .rcpt-items    { margin: 8px 0; }
  .rcpt-item     { display: flex; justify-content: space-between; align-items: flex-start; padding: 5px 0; border-bottom: 1px solid #f0f0f0; font-size: 11.5px; gap: 8px; }
  .rcpt-item-name { flex: 1; }
  .rcpt-item-price { text-align: right; font-weight: 600; white-space: nowrap; }
  .rcpt-totals   { margin-top: 8px; }
  .rcpt-row      { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11.5px; }
  .rcpt-row.discount { color: #16a34a; }
  .rcpt-row.loyalty  { color: #16a34a; }
  .rcpt-row.grand    { font-size: 15px; font-weight: 800; padding: 10px 0 6px; border-top: 2px solid #1e2035; margin-top: 4px; }
  .rcpt-loyalty-earn { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 10px; font-size: 11px; color: #16a34a; font-weight: 600; margin-top: 10px; text-align: center; }
  .rcpt-footer   { text-align: center; margin-top: 14px; font-size: 11px; color: #888; line-height: 1.7; }
  .rcpt-footer b { color: #6c4ff6; }
  @media print {
    body { padding: 8px; }
    @page { margin: 0; }
  }
</style>
</head><body>
${ref.current.innerHTML}
<script>window.onload=()=>{ setTimeout(()=>{ window.print(); }, 300); }</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="modal">
      <div className="receipt-wrapper" style={{maxWidth:380}}>
        <button type="button" className="close" onClick={close}>×</button>

        {/* Printable receipt area */}
        <div ref={ref}>
          {/* ── Logo ── */}
          <div className="rcpt-logo-wrap">
            <img
              src="/logo.png"
              alt="Vyro POS"
              onError={e => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'inline-flex';
              }}
            />
            <span className="rcpt-logo-fallback" style={{display:'none'}}>
              <span className="rcpt-logo-mark">V</span>
              <span style={{fontWeight:800, fontSize:18}}>Vyro<span style={{color:'#6c4ff6'}}>POS</span></span>
            </span>
          </div>

          {/* ── Store info ── */}
          <div className="rcpt-store">
            <h2>{settings.storeName}</h2>
            {settings.storeAddress && <p>{settings.storeAddress}</p>}
            {settings.storePhone   && <p>{settings.storePhone}</p>}
          </div>

          <hr className="rcpt-divider"/>

          {/* ── Sale meta ── */}
          <div className="rcpt-meta">
            <div><b>Receipt:</b> #{String(sale.id).slice(-6)}</div>
            <div><b>Date:</b> {sale.date}</div>
            <div><b>Customer:</b> {sale.customer}</div>
            <div><b>Served by:</b> {sale.cashier}</div>
            <div><b>Payment:</b> {sale.method}</div>
          </div>

          <hr className="rcpt-divider"/>

          {/* ── Items ── */}
          <div className="rcpt-items">
            {sale.items?.map((item, i) => (
              <div key={i} className="rcpt-item">
                <div className="rcpt-item-name">
                  {item.icon && <span style={{marginRight:4}}>{item.icon}</span>}
                  {item.name}{item.brand ? ` (${item.brand})` : ''}
                  <div style={{fontSize:'10px',color:'#888',marginTop:1}}>
                    {item.qty} × {fmt(item.price)}
                  </div>
                </div>
                <div className="rcpt-item-price">{fmt(item.qty * item.price)}</div>
              </div>
            ))}
          </div>

          {/* ── Totals ── */}
          <div className="rcpt-totals">
            <div className="rcpt-row"><span>Subtotal</span><span>{fmt(sale.sub)}</span></div>
            {sale.discount > 0 && (
              <div className="rcpt-row discount">
                <span>Discount</span><span>−{fmt(sale.discount)}</span>
              </div>
            )}
            {sale.tax > 0 && (
              <div className="rcpt-row">
                <span>Tax ({settings.taxRate}%)</span><span>{fmt(sale.tax)}</span>
              </div>
            )}
            {sale.loyaltyDiscount > 0 && (
              <div className="rcpt-row loyalty">
                <span>Loyalty ({sale.pointsUsed} pts)</span>
                <span>−{fmt(sale.loyaltyDiscount)}</span>
              </div>
            )}
            <div className="rcpt-row grand">
              <span>TOTAL</span><span>{fmt(sale.total)}</span>
            </div>
          </div>

          {/* ── Loyalty earned ── */}
          {sale.loyaltyEarned > 0 && (
            <div className="rcpt-loyalty-earn">
              🎁 +{sale.loyaltyEarned} loyalty points earned!
            </div>
          )}

          <hr className="rcpt-divider" style={{marginTop:14}}/>

          {/* ── Footer ── */}
          <div className="rcpt-footer">
            <p>Thank you for shopping at</p>
            <p><b>{settings.storeName}</b></p>
            <p style={{marginTop:8, fontSize:'10px'}}>Powered by <b>Vyro POS</b> · Sell · Track · Grow</p>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="receipt-actions" style={{marginTop:16}}>
          <button className="primary" onClick={print}>🖨 Print receipt</button>
          <button
            style={{background:'#25D366',color:'#fff',border:'none',borderRadius:8,padding:'11px 18px',fontWeight:700,cursor:'pointer',fontSize:14}}
            onClick={() => { import('./receiptPDF').then(m => m.shareSaleReceiptPDF({ sale, settings })); }}
          >
            📄 Share PDF
          </button>
          <button className="btn-edit" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   REMAINING PAGES (Sales, Products, Purchases, Customers,
   Contacts, Payments, Expenses, Reports)
   — same as previous version, copied verbatim below ──────── */

function SalesPage({sales,money,total,setPage,setReceipt}) {
  const [from,setFrom]=useState('');const [to,setTo]=useState('');const [meth,setMeth]=useState('All');
  const f=sales.filter(s=>{const d=s.isoDate||isoDate(s.date);if(from&&d<from)return false;if(to&&d>to)return false;if(meth!=='All'&&s.method!==meth)return false;return true;});
  const net=total(f);
  const pg = usePagination(f, 25);
  return (
    <section className="view">
      <div className="sectionhead">
        <h2>Sales <span className="count-badge">{f.length}</span></h2>
        <button className="primary" onClick={()=>setPage('pos')}>+ New sale</button>
      </div>
      <div className="filter-bar">
        <label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>To   <input type="date" value={to}   onChange={e=>setTo(e.target.value)}/></label>
        <label>Method <select value={meth} onChange={e=>setMeth(e.target.value)}><option>All</option><option>M-Pesa</option><option>Cash</option><option>Card</option><option>Credit</option></select></label>
        {(from||to||meth!=='All')&&<button onClick={()=>{setFrom('');setTo('');setMeth('All');}}>✕ Clear</button>}
        <span className="filter-total">Total: <b>{money(net)}</b></span>
      </div>
      <div className="list-cards">
        {pg.slice.map(s=>(
          <div key={s.id} className="list-card">
            <div className="lc-top">
              <div>
                <div className="lc-title">{s.customer}</div>
                <div className="lc-meta">{s.date} · by {s.cashier}</div>
              </div>
              <div className="lc-right">
                <div className="lc-amount">{money(s.total)}</div>
                <span className={`method-badge ${(s.method||'').toLowerCase().replace(/[^a-z]/g,'')}`}>{s.method}</span>
              </div>
            </div>
            <div className="lc-bottom">
              <code className="lc-ref">#{String(s.id).slice(-6)}</code>
              <button className="btn-edit" onClick={()=>setReceipt(s)}>Receipt</button>
            </div>
          </div>
        ))}
        {!f.length&&<p className="empty-state">No sales in this period.</p>}
      </div>
      <Pagination {...pg} />
    </section>
  );
}

function ProductsPage({products,categories,money,onAdd,onEdit,onDelete,onAddCategory,onDeleteCategory}) {
  const [search,setSearch]=useState('');const [cat,setCat]=useState('All');const [newCat,setNewCat]=useState('');const [catError,setCatError]=useState('');
  const visible=products.filter(p=>(cat==='All'||p.category===cat)&&`${p.name} ${p.brand} ${p.barcode}`.toLowerCase().includes(search.toLowerCase()));
  const pg = usePagination(visible, 20);
  const handleAddCat=e=>{e.preventDefault();if(!newCat.trim())return;if(categories.map(c=>c.toLowerCase()).includes(newCat.trim().toLowerCase())){setCatError('Already exists.');return;}onAddCategory(newCat.trim());setNewCat('');setCatError('');};
  return (
    <section className="view">
      <div className="sectionhead"><h2>Products <span className="count-badge">{products.length}</span></h2><button className="primary" onClick={onAdd}>+ Add product</button></div>
      <article className="card cat-manager">
        <div className="cat-manager-head">
          <h2>Categories <span className="count-badge">{categories.length}</span></h2>
          <form className="cat-add-form" onSubmit={handleAddCat}>
            <div className="cat-input-wrap"><input value={newCat} onChange={e=>{setNewCat(e.target.value);setCatError('');}} placeholder="New category name…"/>{catError&&<span className="cat-error">{catError}</span>}</div>
            <button className="primary" type="submit">Add</button>
          </form>
        </div>
        <div className="cat-chips">{categories.map(c=><div className="cat-chip" key={c}><span>{c}</span><button className="cat-chip-del" onClick={()=>onDeleteCategory(c)}>×</button></div>)}{!categories.length&&<p style={{color:'#b0b5cd',fontSize:13}}>No categories yet.</p>}</div>
      </article>
      <div className="product-filters"><input className="search" style={{maxWidth:320}} value={search} placeholder="Search…" onChange={e=>setSearch(e.target.value)}/><div className="cats">{['All',...categories].map(c=><button key={c} className={c===cat?'sel':''} onClick={()=>setCat(c)}>{c}</button>)}</div></div>
      <div className="list-cards">
        {pg.slice.map(p=>(
          <div key={p.id} className="list-card">
            <div className="lc-top" style={{alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1}}>
                <span style={{fontSize:26,flexShrink:0,lineHeight:1}}>{p.icon||'🏷️'}</span>
                <div style={{minWidth:0}}>
                  <div className="lc-title" style={{display:'flex',flexWrap:'wrap',gap:4,alignItems:'center'}}>
                    <span style={{wordBreak:'break-word'}}>{p.name}</span>
                    {p.brand&&<span className="brand-tag">{p.brand}</span>}
                  </div>
                  <div className="lc-meta">{p.category}{p.barcode?` · #${p.barcode}`:''}</div>
                </div>
              </div>
              <div className="lc-right" style={{flexShrink:0,marginLeft:8}}>
                <div className="lc-amount lc-amount-coral">{money(p.price)}</div>
                <span className={`stock-pill${(p.stock||0)<=(p.low_stock||p.lowStock||5)?' danger':''}`}>{p.stock??'—'} in stock</span>
              </div>
            </div>
            <div className="lc-bottom">
              <span className="lc-ref">{p.category}</span>
              <div style={{display:'flex',gap:6}}>
                <button className="btn-edit" onClick={()=>onEdit(p)}>Edit</button>
                <button className="btn-delete" onClick={()=>onDelete(p.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {!visible.length&&<p className="empty-state">No products found.</p>}
      </div>
      <Pagination {...pg} />
    </section>
  );
}

function PurchasesPage({purchases,products,suppliers,money,open}) {
  const pg = usePagination(purchases, 20);
  return (
    <section className="view">
      <div className="sectionhead"><h2>Purchases <span className="count-badge">{purchases.length}</span></h2><button className="primary" onClick={()=>open('purchase')}>+ Record purchase</button></div>
      <div className="list-cards">
        {pg.slice.map(x=>(
          <div key={x.id} className="list-card">
            <div className="lc-top">
              <div>
                <div className="lc-title">{x.productName||x.product_name||x.note||'General purchase'}</div>
                <div className="lc-meta">{x.date} · {x.supplier||x.supplier_name||'Unknown supplier'}</div>
              </div>
              <div className="lc-right">
                <div className="lc-amount">{money(x.cost)}</div>
                {x.qty&&<span className="stock-pill">{x.qty} units</span>}
              </div>
            </div>
            <div className="lc-bottom">
              <code className="lc-ref">#{String(x.id).slice(-6)}</code>
            </div>
          </div>
        ))}
        {!purchases.length&&<p className="empty-state">No purchases.</p>}
      </div>
      <Pagination {...pg} />
    </section>
  );
}

function CustomerModal({customer, sales, restaurantOrders=[], money, total, onClose, businessType='retail'}) {
  const cs = sales.filter(s => s.customerId === customer.id || s.customer_id === customer.id);
  // Match restaurant orders by phone number OR customer name
  const phone = customer.phone?.replace(/\D/g,'');
  const ro = restaurantOrders.filter(o => {
    const completed = o.status === 'completed' || o.status === 'paid';
    if (!completed) return false;
    // Match by phone
    if (phone) {
      const oPhone = (o.customer_phone || '').replace(/\D/g,'');
      if (oPhone && (oPhone === phone || oPhone.endsWith(phone.slice(-9)))) return true;
    }
    // Fallback: match by name (case-insensitive)
    if (customer.name && o.customer_name) {
      return o.customer_name.toLowerCase() === customer.name.toLowerCase();
    }
    return false;
  });

  const isHotel = businessType === 'hotel';
  const allOrders = isHotel ? ro : cs;
  const pg = usePagination(allOrders, 10);
  const spent = isHotel
    ? ro.reduce((s, o) => s + (o.total || 0), 0)
    : total(cs);
  const pts = customer.points || 0;
  const lastVisit = isHotel
    ? (ro[0]?.created_at ? new Date(ro[0].created_at).toLocaleDateString() : 'Never')
    : (cs[0]?.date || 'Never');

  const handleBackdrop = e => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div className="modal" onClick={handleBackdrop}>
      <div style={{position:'relative',background:'var(--card-bg)',width:'min(640px,96%)',borderRadius:'var(--radius-xl)',boxShadow:'var(--shadow-lg)',maxHeight:'90vh',overflowY:'auto',padding:'28px 24px 24px'}}>
        <button type="button" className="close" onClick={onClose}>×</button>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20}}>
          <div className="contact-avatar" style={{width:52,height:52,fontSize:22,flexShrink:0}}>{customer.name[0]}</div>
          <div>
            <h2 style={{margin:0,fontSize:20}}>{customer.name}</h2>
            <p style={{margin:0,color:'var(--muted)',fontSize:13}}>{customer.phone||'No phone number'}</p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:20}}>
          {[
            {label:'Total spent',   value: money(spent),   note:`${allOrders.length} order${allOrders.length!==1?'s':''}`},
            {label:'Loyalty points',value: pts,            note: pts>=100?'✓ Ready to redeem':'Collecting'},
            {label:'Last visit',    value: lastVisit,      note:''},
          ].map(m=>(
            <div key={m.label} style={{background:'var(--wash)',borderRadius:'var(--radius-sm)',padding:'12px 14px'}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--muted)',marginBottom:4}}>{m.label}</div>
              <div style={{fontSize:18,fontWeight:700,color: m.label==='Loyalty points'&&pts>=100?'var(--green, #16a34a)':'var(--ink)'}}>{m.value}</div>
              {m.note&&<div style={{fontSize:11,color: m.label==='Loyalty points'&&pts>=100?'var(--green,#16a34a)':'var(--muted)',marginTop:2}}>{m.note}</div>}
            </div>
          ))}
        </div>

        {/* Order history */}
        <h3 style={{margin:'0 0 10px',fontSize:14,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--muted)'}}>
          {isHotel ? 'Restaurant order history' : 'Purchase history'}
        </h3>
        <div style={{overflowX:'auto'}}>
          {isHotel ? (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:'1.5px solid var(--line)'}}>
                  {['Order','Date','Table','Method','Amount'].map(h=>(
                    <th key={h} style={{padding:'7px 8px',textAlign:'left',fontWeight:600,color:'var(--muted)',fontSize:11,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.slice.map(o=>(
                  <tr key={o.id} style={{borderBottom:'1px solid var(--line)'}}>
                    <td style={{padding:'9px 8px'}}><code style={{fontSize:12}}>#{o.order_number||String(o.id).slice(-6)}</code></td>
                    <td style={{padding:'9px 8px',color:'var(--muted)',fontSize:12}}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{padding:'9px 8px'}}>{o.tables?.table_number ? `Table ${o.tables.table_number}` : '—'}</td>
                    <td style={{padding:'9px 8px'}}>
                      <span className={`method-badge ${(o.payment_method||'').toLowerCase().replace(/[^a-z]/g,'')}`}>{o.payment_method||'—'}</span>
                    </td>
                    <td style={{padding:'9px 8px'}}><b>{money(o.total||0)}</b></td>
                  </tr>
                ))}
                {!ro.length&&(
                  <tr><td colSpan={5} style={{padding:'20px 8px',textAlign:'center',color:'var(--muted)'}}>No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:'1.5px solid var(--line)'}}>
                  {['Receipt','Date','Cashier','Method','Amount'].map(h=>(
                    <th key={h} style={{padding:'7px 8px',textAlign:'left',fontWeight:600,color:'var(--muted)',fontSize:11,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.slice.map(s=>(
                  <tr key={s.id} style={{borderBottom:'1px solid var(--line)'}}>
                    <td style={{padding:'9px 8px'}}><code style={{fontSize:12}}>#{String(s.id).slice(-6)}</code></td>
                    <td style={{padding:'9px 8px',color:'var(--muted)',fontSize:12}}>{s.date}</td>
                    <td style={{padding:'9px 8px'}}>{s.cashier}</td>
                    <td style={{padding:'9px 8px'}}>
                      <span className={`method-badge ${(s.method||'').toLowerCase().replace(/[^a-z]/g,'')}`}>{s.method||'—'}</span>
                    </td>
                    <td style={{padding:'9px 8px'}}><b>{money(s.total)}</b></td>
                  </tr>
                ))}
                {!cs.length&&(
                  <tr><td colSpan={5} style={{padding:'20px 8px',textAlign:'center',color:'var(--muted)'}}>No purchases yet.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {allOrders.length > 10 && <Pagination {...pg} />}
      </div>
    </div>
  );
}
function CustomersPage({customers, sales, restaurantOrders=[], money, total, open, businessType='retail'}) {
  const [sel,setSel]=useState(null);
  const [search,setSearch]=useState('');
  const filtered = customers.filter(c => `${c.name} ${c.phone||''}`.toLowerCase().includes(search.toLowerCase()));
  const pg = usePagination(filtered, 20);
  const selCustomer = sel ? customers.find(x=>x.id===sel) : null;

  return(
    <section className="view">
      <div className="sectionhead"><h2>Customers <span className="count-badge">{customers.length}</span></h2><button className="primary" onClick={()=>open('customer')}>+ Add customer</button></div>
      <div style={{marginBottom:14}}><input className="search" style={{maxWidth:320}} value={search} placeholder="Search customers…" onChange={e=>setSearch(e.target.value)}/></div>
      <div className="contacts">{pg.slice.map(x=>(
        <article className="card contact-card" key={x.id} onClick={()=>setSel(x.id)} style={{cursor:'pointer'}}>
          <div className="contact-avatar">{x.name[0]}</div>
          <h3>{x.name}</h3>
          <p>{x.phone||'No phone'}</p>
          {x.points>0&&<span className="stock-pill" style={{marginTop:6}}>{x.points} pts</span>}
        </article>
      ))}{!filtered.length&&<article className="card">No customers found.</article>}</div>
      <Pagination {...pg} />

      {selCustomer && (
        <CustomerModal
          customer={selCustomer}
          sales={sales}
          restaurantOrders={restaurantOrders}
          money={money}
          total={total}
          businessType={businessType}
          onClose={()=>setSel(null)}
        />
      )}
    </section>
  );
}

function Contacts({title,items,open}) {
  const [search,setSearch]=useState('');
  const filtered = items.filter(x => `${x.name} ${x.company||''} ${x.phone||''}`.toLowerCase().includes(search.toLowerCase()));
  const pg = usePagination(filtered, 20);
  return(<section className="view">
    <div className="sectionhead"><h2>{title} <span className="count-badge">{items.length}</span></h2><button className="primary" onClick={open}>+ Add {title.slice(0,-1)}</button></div>
    <div style={{marginBottom:14}}><input className="search" style={{maxWidth:320}} value={search} placeholder={`Search ${title.toLowerCase()}…`} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="contacts">{pg.slice.map(x=><article className="card contact-card" key={x.id}><div className="contact-avatar">{x.name[0]}</div><h3>{x.name}</h3>{x.company&&<p style={{color:'var(--violet)',fontWeight:600}}>{x.company}</p>}<p>{x.phone||'No phone'}</p><p>{x.email||'No email'}</p></article>)}{!filtered.length&&<article className="card">No contacts found.</article>}</div>
    <Pagination {...pg} />
  </section>);
}

function Payments({sales,money,total}) {
  const pg = usePagination(sales, 25);
  return(<section className="view">
    <div className="sectionhead"><h2>Payments</h2></div>
    <div className="metrics mini" style={{marginBottom:16}}>
      <Metric label="Total" value={money(total(sales))} note={`${sales.length} sales`}/>
      <Metric label="M-Pesa" value={money(total(sales.filter(s=>s.method==='M-Pesa')))} note="Mobile"/>
      <Metric label="Cash"   value={money(total(sales.filter(s=>s.method==='Cash')))}   note="Cash"/>
      <Metric label="Card"   value={money(total(sales.filter(s=>s.method==='Card')))}   note="Card"/>
    </div>
    <div className="list-cards">
      {pg.slice.map(s=>(
        <div key={s.id} className="list-card">
          <div className="lc-top">
            <div>
              <div className="lc-title">{s.customer}</div>
              <div className="lc-meta">{s.date} · {s.cashier}</div>
            </div>
            <div className="lc-right">
              <div className="lc-amount">{money(s.total)}</div>
              <span className={`method-badge ${(s.method||'').toLowerCase().replace(/[^a-z]/g,'')}`}>{s.method}</span>
            </div>
          </div>
          <div className="lc-bottom">
            <code className="lc-ref">#{String(s.id).slice(-6)}</code>
          </div>
        </div>
      ))}
      {!sales.length&&<p className="empty-state">No payments.</p>}
    </div>
    <Pagination {...pg} />
  </section>);
}

// Unified Payments view that combines Retail POS, Restaurant, and Room Bookings
function UnifiedPayments({sales,restaurantOrders,roomBookings,money,total,session,businessType='retail'}) {
  const isHotel = businessType === 'hotel';
  const [filter, setFilter] = useState('all');
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Transform all payment sources into unified format
  const allPayments = [
    ...(isHotel ? [] : sales.map(s => ({
      id: `retail-${s.id}`,
      type: 'retail',
      typeLabel: '🛒 Retail',
      customer: s.customer || 'Walk-in',
      date: s.date,
      isoDate: s.isoDate || isoDate(s.date),
      cashier: s.cashier,
      total: s.total,
      method: s.method,
      reference: `#${String(s.id).slice(-6)}`,
    }))),
    ...(isHotel ? restaurantOrders
      .filter(o => o.status === 'completed' || o.status === 'paid')
      .map(o => ({
        id: `restaurant-${o.id}`,
        type: 'restaurant',
        typeLabel: '🍽️ Restaurant',
        customer: o.customer_name || (o.tables?.table_number ? `Table ${o.tables.table_number}` : `Order ${o.order_number || String(o.id).slice(-4)}`),
        date: o.created_at ? new Date(o.created_at).toLocaleDateString() : today(),
        isoDate: o.created_at ? isoDate(new Date(o.created_at)) : today(),
        cashier: o.cashier_name || 'Staff',
        total: o.total || 0,
        method: o.payment_method || 'Cash',
        reference: `#${o.order_number || String(o.id).slice(-6)}`,
      })) : []),
    ...(isHotel ? roomBookings
      .filter(b => b.booking_status === 'checked_out')
      .map(b => ({
        id: `booking-${b.id}`,
        type: 'room',
        typeLabel: '🏨 Room',
        customer: b.guest_name || 'Guest',
        date: b.check_out_date ? new Date(b.check_out_date).toLocaleDateString() : (b.created_at ? new Date(b.created_at).toLocaleDateString() : today()),
        isoDate: b.check_out_date || (b.created_at ? isoDate(new Date(b.created_at)) : today()),
        cashier: b.checked_out_by_name || 'Staff',
        total: b.total || 0,
        method: b.payment_method || 'Cash',
        reference: b.booking_number || `#${String(b.id).slice(-6)}`,
      })) : []),
  ].sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));

  // Date range filter
  const inRange = (p) => {
    const d = p.isoDate || '';
    const now = new Date();
    if (range === 'today')  return d === today();
    if (range === 'week')   { const w = new Date(now); w.setDate(w.getDate()-6); return d >= isoDate(w); }
    if (range === 'month')  return d.startsWith(today().slice(0,7));
    if (range === 'year')   return d.startsWith(today().slice(0,4));
    if (range === 'custom') return (!from || d >= from) && (!to || d <= to);
    return true;
  };

  // Type filter + date range
  const filtered = allPayments
    .filter(p => filter === 'all' || p.type === filter)
    .filter(inRange);

  // Reset page when filter/range changes
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, totalPages || 1);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Group page items by isoDate for day headers
  const grouped = pageItems.reduce((acc, p) => {
    const key = p.isoDate || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Pretty date header
  const formatDayHeader = (iso) => {
    if (!iso || iso === 'Unknown') return 'Unknown date';
    const d = new Date(iso + 'T12:00:00');
    const t = today();
    if (iso === t) return 'Today — ' + d.toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long' });
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    if (iso === isoDate(yesterday)) return 'Yesterday — ' + d.toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long' });
    return d.toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  };

  // ── Downloads ────────────────────────────────────────────
  const downloadCSV = () => {
    const rows = [
      ['Date', 'Reference', 'Customer', 'Type', 'Method', 'Cashier/Staff', 'Amount'],
      ...filtered.map(p => [p.isoDate, p.reference, p.customer, p.typeLabel, p.method, p.cashier, p.total]),
      [],
      ['SUMMARY'],
      ['Total transactions', filtered.length],
      ['Total revenue', filtered.reduce((s,p) => s+p.total, 0)],
      ['M-Pesa', filtered.filter(p=>p.method==='M-Pesa').reduce((s,p)=>s+p.total,0)],
      ['Cash',   filtered.filter(p=>p.method==='Cash').reduce((s,p)=>s+p.total,0)],
      ['Card',   filtered.filter(p=>p.method==='Card').reduce((s,p)=>s+p.total,0)],
    ];
    const csv = rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `payments-${range === 'custom' ? `${from}_to_${to}` : range}-${today()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    const grandTotal = filtered.reduce((s,p) => s+p.total, 0);
    const rangeLabel = range === 'custom' ? `${from} to ${to}` : range;
    const byMethod = ['M-Pesa','Cash','Card'].map(m =>
      `${m}: ${money(filtered.filter(p=>p.method===m).reduce((s,p)=>s+p.total,0))}`
    ).join(' | ');

    const rows = days.map(day => {
      const dayPayments = grouped[day] || [];
      const dayTotal = dayPayments.reduce((s,p)=>s+p.total,0);
      const header = `\n${formatDayHeader(day)}  (${dayPayments.length} transactions — ${money(dayTotal)})\n${'─'.repeat(72)}\n`;
      const lines = dayPayments.map(p =>
        `  ${p.reference.padEnd(14)} ${p.customer.slice(0,22).padEnd(23)} ${p.typeLabel.replace(/[^\w\s]/g,'').trim().padEnd(12)} ${(p.method||'').padEnd(10)} ${money(p.total).padStart(14)}`
      ).join('\n');
      return header + lines;
    }).join('\n');

    const content = `PAYMENTS REPORT — ${rangeLabel.toUpperCase()}\nGenerated: ${new Date().toLocaleString('en-KE')}\n${'═'.repeat(72)}\nTotal: ${money(grandTotal)} across ${filtered.length} transactions\n${byMethod}\n${rows}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const w = window.open(''); 
    w.document.write(`<pre style="font-family:monospace;font-size:12px;padding:24px">${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`);
    w.document.title = 'Payments Report';
    setTimeout(() => { w.print(); URL.revokeObjectURL(url); }, 300);
  };

  return (
    <section className="view">
      <div className="sectionhead">
        <h2>{isHotel ? '💰 Payments' : '◉ Payments'}</h2>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-edit" onClick={downloadCSV}>⬇ CSV</button>
          <button className="btn-edit" onClick={downloadPDF}>🖨 PDF</button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="metrics mini" style={{marginBottom:16}}>
        <Metric label="Total" value={money(filtered.reduce((s,p)=>s+p.total,0))} note={`${filtered.length} transactions`} accent="violet"/>
        <Metric label="M-Pesa" value={money(filtered.filter(p=>p.method==='M-Pesa').reduce((s,p)=>s+p.total,0))} note="Mobile" accent="green"/>
        <Metric label="Cash"   value={money(filtered.filter(p=>p.method==='Cash').reduce((s,p)=>s+p.total,0))}   note="Cash" accent="amber"/>
        <Metric label="Card"   value={money(filtered.filter(p=>p.method==='Card').reduce((s,p)=>s+p.total,0))}   note="Card" accent="blue"/>
      </div>

      {/* Date range filter */}
      <div className="filter-bar" style={{marginBottom:12,flexWrap:'wrap',gap:6}}>
        {['today','week','month','year','all'].map(r=>(
          <button key={r} className={range===r?'sel-filter':'out-filter'} onClick={()=>{setRange(r);setPage(1);}}>
            {r[0].toUpperCase()+r.slice(1)}
          </button>
        ))}
        <button className={range==='custom'?'sel-filter':'out-filter'} onClick={()=>setRange('custom')}>Custom</button>
        {range==='custom' && <>
          <input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1);}} style={{padding:'6px 10px',borderRadius:6,border:'1.5px solid var(--line)',fontSize:13}} />
          <span style={{alignSelf:'center',color:'var(--muted)'}}>to</span>
          <input type="date" value={to}   onChange={e=>{setTo(e.target.value);setPage(1);}}   style={{padding:'6px 10px',borderRadius:6,border:'1.5px solid var(--line)',fontSize:13}} />
        </>}
      </div>

      {/* Type tabs — hotel only */}
      {isHotel && (
        <div className="filter-tabs" style={{marginBottom:16}}>
          <button className={filter==='all'?'active':''} onClick={()=>{setFilter('all');setPage(1);}}>All ({allPayments.length})</button>
          <button className={filter==='restaurant'?'active':''} onClick={()=>{setFilter('restaurant');setPage(1);}}>
            🍽️ Restaurant ({restaurantOrders.filter(o=>o.status==='completed'||o.status==='paid').length})
          </button>
          <button className={filter==='room'?'active':''} onClick={()=>{setFilter('room');setPage(1);}}>
            🏨 Rooms ({roomBookings.filter(b=>b.booking_status==='checked_out').length})
          </button>
        </div>
      )}

      {/* Grouped by day */}
      {days.length === 0 && <p className="empty-state">No payments for this period.</p>}

      {days.map(day => {
        const dayPayments = grouped[day];
        const dayTotal = dayPayments.reduce((s,p)=>s+p.total,0);
        return (
          <div key={day}>
            {/* Day header */}
            <div style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 0 8px', borderBottom:'2px solid var(--line)',
              marginBottom:8, marginTop:16,
            }}>
              <span style={{fontWeight:700, fontSize:13, color:'var(--ink)'}}>
                📅 {formatDayHeader(day)}
              </span>
              <span style={{fontSize:13, fontWeight:600, color:'var(--violet)'}}>
                {money(dayTotal)} · {dayPayments.length} tx
              </span>
            </div>

            {/* Payments for this day */}
            <div className="list-cards" style={{marginBottom:0}}>
              {dayPayments.map(p=>(
                <div key={p.id} className="list-card">
                  <div className="lc-top">
                    <div>
                      <div className="lc-title">{p.customer}</div>
                      <div className="lc-meta">
                        {isHotel && <span className="stock-pill" style={{marginRight:6,fontSize:10}}>{p.typeLabel}</span>}
                        {p.cashier}
                      </div>
                    </div>
                    <div className="lc-right">
                      <div className="lc-amount">{money(p.total)}</div>
                      <span className={`method-badge ${(p.method||'').toLowerCase().replace(/[^a-z]/g,'')}`}>{p.method}</span>
                    </div>
                  </div>
                  <div className="lc-bottom">
                    <code className="lc-ref">{p.reference}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination" style={{marginTop:20}}>
          <span className="pg-info">{filtered.length} total · page {safePage} of {totalPages}</span>
          <div className="pg-controls">
            <button className="pg-btn" disabled={safePage===1} onClick={()=>setPage(1)}>«</button>
            <button className="pg-btn" disabled={safePage===1} onClick={()=>setPage(p=>p-1)}>‹</button>
            {Array.from({length:Math.min(5,totalPages)},(_,i)=>{
              const start = Math.max(1, Math.min(safePage-2, totalPages-4));
              const n = start+i;
              return n <= totalPages ? (
                <button key={n} className={`pg-btn${n===safePage?' active':''}`} onClick={()=>setPage(n)}>{n}</button>
              ) : null;
            })}
            <button className="pg-btn" disabled={safePage===totalPages} onClick={()=>setPage(p=>p+1)}>›</button>
            <button className="pg-btn" disabled={safePage===totalPages} onClick={()=>setPage(totalPages)}>»</button>
          </div>
        </div>
      )}
    </section>
  );
}

function ExpensesPage({expenses,money,total,open}) {
  const [from,setFrom]=useState('');const [to,setTo]=useState('');
  const f=expenses.filter(x=>{const d=x.isoDate||isoDate(x.date);if(from&&d<from)return false;if(to&&d>to)return false;return true;});
  const pg = usePagination(f, 20);
  const byCat={};f.forEach(x=>{byCat[x.category]=(byCat[x.category]||0)+ +x.amount;});
  const maxC=Math.max(...Object.values(byCat),1);
  return(<section className="view">
    <div className="sectionhead"><h2>Expenses</h2><button className="primary" onClick={()=>open('expense')}>+ Add expense</button></div>
    <div className="filter-bar">
      <label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>To <input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      {(from||to)&&<button onClick={()=>{setFrom('');setTo('');}}>✕</button>}
      <span className="filter-total">Total: <b>{money(total(f))}</b></span>
    </div>
    {Object.keys(byCat).length>0&&<article className="card" style={{marginBottom:14}}><h2>By category</h2><div className="exp-breakdown">{Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,a])=><div className="exp-row" key={c}><span>{c}</span><div className="exp-bar-wrap"><div className="exp-bar" style={{width:`${Math.round(a/maxC*100)}%`}}/></div><b>{money(a)}</b></div>)}</div></article>}
    <div className="list-cards">
      {pg.slice.map((x,i)=>(
        <div key={i} className="list-card lc-no-bottom">
          <div className="lc-top" style={{alignItems:'center'}}>
            <div style={{minWidth:0,flex:1}}>
              <div className="lc-title">{x.category}</div>
              <div className="lc-meta">{x.date}{x.note ? ` · ${x.note}` : ''}</div>
            </div>
            <div className="lc-right">
              <div className="lc-amount lc-amount-coral">{money(x.amount)}</div>
            </div>
          </div>
        </div>
      ))}
      {!f.length&&<p className="empty-state">No expenses.</p>}
    </div>
    <Pagination {...pg} />
  </section>);
}

/* ─────────────────────────────────────────────────────────────
   ERROR BOUNDARY (catches render crashes and shows them)
───────────────────────────────────────────────────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:32,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:12,margin:16}}>
          <h3 style={{color:'#dc2626',margin:'0 0 8px'}}>⚠ Page crashed</h3>
          <pre style={{fontSize:12,color:'#7f1d1d',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
            {this.state.error.message}{'\n\n'}{this.state.error.stack}
          </pre>
          <button style={{marginTop:12,padding:'8px 16px',background:'#dc2626',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'}} onClick={()=>this.setState({error:null})}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Reports({sales,expenses,purchases,products,money,total,restaurantOrders=[],roomBookings=[],businessType='retail'}) {
  return (
    <ErrorBoundary>
      <ReportsInner sales={sales} expenses={expenses} purchases={purchases} products={products} money={money} total={total} restaurantOrders={restaurantOrders} roomBookings={roomBookings} businessType={businessType} />
    </ErrorBoundary>
  );
}

function ReportsInner({sales,expenses,purchases,products,money,total,restaurantOrders=[],roomBookings=[],businessType='retail'}) {
  const [range,setRange]=useState('month');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [tab,setTab]=useState('overview'); // overview | products | customers | trends

  const rf = s => {
    const d = s.isoDate || (s.date ? (() => { try { const p = isoDate(s.date); return isNaN(new Date(p)) ? today() : p; } catch { return today(); } })() : today());
    const now = new Date();
    if (range==='today')  return d === today();
    if (range==='week')   { const w=new Date(now); w.setDate(w.getDate()-7); return d>=isoDate(w); }
    if (range==='month')  return d.startsWith(today().slice(0,7));
    if (range==='year')   return d.startsWith(today().slice(0,4));
    if (range==='custom') return (!from||d>=from)&&(!to||d<=to);
    return true;
  };

  // Filter all revenue sources
  const fs = sales.filter(rf);
  const fe = expenses.filter(rf);
  const fp = purchases.filter(rf);
  
  // Filter restaurant orders (paid/completed)
  const fr = restaurantOrders
    .filter(o => (o.status === 'completed' || o.status === 'paid'))
    .filter(o => {
      const d = o.created_at ? isoDate(new Date(o.created_at)) : today();
      const now = new Date();
      if (range==='today')  return d === today();
      if (range==='week')   { const w=new Date(now); w.setDate(w.getDate()-7); return d>=isoDate(w); }
      if (range==='month')  return d.startsWith(today().slice(0,7));
      if (range==='year')   return d.startsWith(today().slice(0,4));
      if (range==='custom') return (!from||d>=from)&&(!to||d<=to);
      return true;
    });
  
  // Filter room bookings (checked out)
  const fb = roomBookings
    .filter(b => b.booking_status === 'checked_out')
    .filter(b => {
      const d = b.check_out_date ? isoDate(new Date(b.check_out_date)) : today();
      const now = new Date();
      if (range==='today')  return d === today();
      if (range==='week')   { const w=new Date(now); w.setDate(w.getDate()-7); return d>=isoDate(w); }
      if (range==='month')  return d.startsWith(today().slice(0,7));
      if (range==='year')   return d.startsWith(today().slice(0,4));
      if (range==='custom') return (!from||d>=from)&&(!to||d<=to);
      return true;
    });

  // Calculate totals
  const retailRev = total(fs);
  const restaurantRev = fr.reduce((sum, o) => sum + (o.total || 0), 0);
  const roomRev = fb.reduce((sum, b) => sum + (b.total || 0), 0);
  const net = retailRev + restaurantRev + roomRev;
  const exp = total(fe);
  const pur = total(fp);
  const profit = net - exp - pur;

  // ── Previous period for comparison ──
  const prevRf = s => {
    const d = s.isoDate || (s.date ? (() => { try { const p = isoDate(s.date); return isNaN(new Date(p)) ? today() : p; } catch { return today(); } })() : today());
    const now = new Date();
    if (range==='today')  { const y=new Date(now); y.setDate(y.getDate()-1); return d===isoDate(y); }
    if (range==='week')   { const w1=new Date(now); w1.setDate(w1.getDate()-14); const w2=new Date(now); w2.setDate(w2.getDate()-7); return d>=isoDate(w1)&&d<isoDate(w2); }
    if (range==='month')  { const prev=new Date(today().slice(0,7)+'-01'); prev.setMonth(prev.getMonth()-1); return d.startsWith(isoDate(prev).slice(0,7)); }
    return false;
  };
  const prevSales = sales.filter(prevRf);
  const prevNet   = total(prevSales);
  const revChg    = prevNet > 0 ? ((net - prevNet) / prevNet) * 100 : null;
  const txChg     = prevSales.length > 0 ? ((fs.length - prevSales.length) / prevSales.length) * 100 : null;

  // ── Category breakdown ──
  const byCat = {};
  fs.forEach(s => s.items?.forEach(i => {
    if (!byCat[i.category]) byCat[i.category] = { rev: 0, qty: 0 };
    byCat[i.category].rev += i.price * i.qty;
    byCat[i.category].qty += i.qty;
  }));
  const catData = Object.entries(byCat).sort((a,b)=>b[1].rev-a[1].rev).map(([c,v], i) => ({
    label: c, value: v.rev,
    color: ['#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'][i%7],
    sublabel: `${v.qty} units`,
  }));

  // ── Top products ──
  const prodMap = {};
  fs.forEach(s => s.items?.forEach(i => {
    if (!prodMap[i.id]) prodMap[i.id] = { name: i.name, icon: i.icon||'🏷️', rev: 0, qty: 0 };
    prodMap[i.id].rev += i.price * i.qty;
    prodMap[i.id].qty += i.qty;
  }));
  const topProdData = Object.values(prodMap).sort((a,b)=>b.rev-a.rev).slice(0,10).map(p => ({
    label: p.name, icon: p.icon, value: p.rev, sublabel: `${p.qty} sold`,
    color: '#7c3aed',
  }));
  const topQtyData = Object.values(prodMap).sort((a,b)=>b.qty-a.qty).slice(0,10).map(p => ({
    label: p.name, icon: p.icon, value: p.qty, sublabel: `${p.qty} units`,
    color: '#0ea5e9',
  }));

  // ── Payment methods ──
  const payMethods = {};
  fs.forEach(s => { payMethods[s.method] = (payMethods[s.method]||0) + s.total; });
  const methodColors = { 'M-Pesa':'#10b981', 'Cash':'#f59e0b', 'Card':'#3b82f6', 'Credit':'#ef4444' };
  const payData = Object.entries(payMethods).map(([k,v])=>({label:k,value:v,color:methodColors[k]||'#7c3aed'})).sort((a,b)=>b.value-a.value);

  // ── Daily trend in selected period ──
  const periodDays = (() => {
    if (range === 'today')  return [today()];
    if (range === 'week')   return Array.from({length:7}, (_,i) => { const d=new Date(); d.setDate(d.getDate()-(6-i)); return isoDate(d); });
    if (range === 'month')  return Array.from({length: new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate()}, (_,i) => { const d = new Date(today().slice(0,8)+'01'); d.setDate(d.getDate()+i); return isoDate(d); }).filter(d => d <= today());
    if (range === 'year')   return Array.from({length:12}, (_,i) => `${today().slice(0,4)}-${String(i+1).padStart(2,'0')}`);
    if (range === 'custom' && from && to) {
      const days = []; const cur = new Date(from); const end = new Date(to);
      while (cur <= end && days.length < 365) { days.push(isoDate(cur)); cur.setDate(cur.getDate()+1); }
      return days;
    }
    return Array.from({length:7}, (_,i) => { const d=new Date(); d.setDate(d.getDate()-(6-i)); return isoDate(d); });
  })();

  const trendLabels = periodDays.map((d, i) => {
    if (range === 'year')  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i] || d;
    if (periodDays.length <= 7)  return new Date(d + 'T12:00:00').toLocaleDateString('en-KE', {weekday:'short'});
    if (periodDays.length <= 31) return String(new Date(d + 'T12:00:00').getDate());
    // many days: show every 7th
    return i % 7 === 0 ? new Date(d + 'T12:00:00').toLocaleDateString('en-KE', {day:'numeric', month:'short'}) : '';
  });
  const trendRevData = periodDays.map(d =>
    range === 'year'
      ? total(sales.filter(s => s.isoDate?.startsWith(d)))
      : total(sales.filter(s => s.isoDate === d))
  );
  const trendExpData = periodDays.map(d =>
    range === 'year'
      ? total(expenses.filter(e => e.isoDate?.startsWith(d)))
      : total(expenses.filter(e => e.isoDate === d))
  );

  // ── Expense categories ──
  const expCats = {};
  fe.forEach(e => { expCats[e.category] = (expCats[e.category]||0) + e.amount; });
  const expCatColors = ['#ef4444','#f59e0b','#ec4899','#8b5cf6','#0ea5e9','#10b981'];
  const expCatData = Object.entries(expCats).sort((a,b)=>b[1]-a[1]).map(([c,v],i)=>({ label:c, value:v, color:expCatColors[i%expCatColors.length] }));

  // ── Hourly heatmap (hour of day distribution) ──
  const hourly = Array(24).fill(0);
  fs.forEach(s => { if (s.date) { const h = new Date(s.date).getHours(); if (!isNaN(h)) hourly[h]++; } });
  const peakHour = hourly.indexOf(Math.max(...hourly));

  // ── Download report ──────────────────────────────────────
  const downloadReport = (format) => {
    const periodLabel = range === 'custom' ? `${from}_to_${to}` : range;
    const timestamp = new Date().toLocaleDateString('en-KE').replace(/\//g,'-');

    if (format === 'csv') {
      // Build CSV
      const rows = [
        ['VYRO POS — Sales Report'],
        [`Period: ${periodLabel}`, `Generated: ${timestamp}`],
        [],
        ['Receipt','Date','Customer','Cashier','Method','Subtotal','Discount','Tax','Total'],
        ...fs.map(s => [
          `#${String(s.id).slice(-6)}`,
          s.isoDate || '',
          s.customer || 'Walk-in',
          s.cashier || '',
          s.method || '',
          s.sub || s.subtotal || 0,
          s.discount || 0,
          s.tax || 0,
          s.total || 0,
        ]),
        [],
        ['SUMMARY'],
        ['Revenue', net],
        ['Expenses', exp],
        ['Purchases', pur],
        ['Net Profit', profit],
        [],
        ['EXPENSES'],
        ['Date','Category','Note','Amount'],
        ...fe.map(e => [e.date||e.isoDate, e.category, e.note||'', e.amount]),
        [],
        ['TOP PRODUCTS (by revenue)'],
        ['Product','Revenue','Units Sold'],
        ...topProdData.slice(0,10).map(p => [p.label, p.value, p.sublabel]),
      ];

      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `vyro-report-${periodLabel}-${timestamp}.csv`;
      a.click(); URL.revokeObjectURL(url);
    }

    if (format === 'pdf') {
      const w = window.open('', '_blank');
      const html = `
<!DOCTYPE html><html><head>
<title>Vyro POS Report — ${periodLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e2035; padding: 32px; }
  h1 { font-size: 22px; color: #6c4ff6; margin-bottom: 4px; }
  h2 { font-size: 14px; font-weight: 700; margin: 20px 0 8px; border-bottom: 2px solid #6c4ff6; padding-bottom: 4px; color: #6c4ff6; }
  .meta { color: #666; font-size: 11px; margin-bottom: 20px; }
  .kpis { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
  .kpi { background: #f4f5fb; border-radius: 8px; padding: 12px 16px; }
  .kpi small { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .08em; display: block; margin-bottom: 4px; }
  .kpi b { font-size: 18px; color: #1e2035; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f4f5fb; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; padding: 7px 10px; text-align: left; color: #666; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e7f0; font-size: 11px; }
  tr:last-child td { border-bottom: none; }
  .profit { color: ${profit >= 0 ? '#22c55e' : '#f04f44'}; font-weight: 700; }
  .footer { margin-top: 32px; text-align: center; color: #999; font-size: 10px; border-top: 1px solid #e5e7f0; padding-top: 16px; }
  @media print { body { padding: 16px; } }
</style></head><body>
<h1>Vyro POS — Sales Report</h1>
<div class="meta">Period: <b>${periodLabel}</b> &nbsp;|&nbsp; Generated: <b>${timestamp}</b> &nbsp;|&nbsp; ${fs.length} transactions</div>

<div class="kpis">
  <div class="kpi"><small>Revenue</small><b>KSh ${net.toLocaleString('en-KE')}</b></div>
  <div class="kpi"><small>Expenses</small><b>KSh ${exp.toLocaleString('en-KE')}</b></div>
  <div class="kpi"><small>Purchases</small><b>KSh ${pur.toLocaleString('en-KE')}</b></div>
  <div class="kpi"><small>Net Profit</small><b class="profit">KSh ${profit.toLocaleString('en-KE')}</b></div>
</div>

<h2>Sales (${fs.length} transactions)</h2>
<table>
  <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Method</th><th>Total</th></tr></thead>
  <tbody>
    ${fs.slice(0,100).map(s=>`<tr>
      <td>#${String(s.id).slice(-6)}</td>
      <td>${s.isoDate||''}</td>
      <td>${s.customer||'Walk-in'}</td>
      <td>${s.cashier||''}</td>
      <td>${s.method||''}</td>
      <td><b>KSh ${Number(s.total||0).toLocaleString('en-KE')}</b></td>
    </tr>`).join('')}
    ${fs.length > 100 ? `<tr><td colspan="6" style="color:#666;text-align:center">... and ${fs.length-100} more transactions</td></tr>` : ''}
  </tbody>
</table>

<h2>Expenses (${fe.length})</h2>
<table>
  <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>
  <tbody>
    ${fe.map(e=>`<tr>
      <td>${e.date||e.isoDate||''}</td>
      <td>${e.category||''}</td>
      <td>${e.note||'—'}</td>
      <td>KSh ${Number(e.amount||0).toLocaleString('en-KE')}</td>
    </tr>`).join('')}
    ${!fe.length ? '<tr><td colspan="4" style="color:#999;text-align:center">No expenses in this period.</td></tr>' : ''}
  </tbody>
</table>

<h2>Top Products by Revenue</h2>
<table>
  <thead><tr><th>#</th><th>Product</th><th>Revenue</th><th>Units Sold</th></tr></thead>
  <tbody>
    ${topProdData.slice(0,10).map((p,i)=>`<tr>
      <td>${i+1}</td>
      <td>${p.label}</td>
      <td>KSh ${Number(p.value||0).toLocaleString('en-KE')}</td>
      <td>${p.sublabel||'—'}</td>
    </tr>`).join('')}
    ${!topProdData.length ? '<tr><td colspan="4" style="color:#999;text-align:center">No sales data.</td></tr>' : ''}
  </tbody>
</table>

<div class="footer">Vyro POS &nbsp;·&nbsp; Sell · Track · Grow &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-KE')}</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
      w.document.write(html);
      w.document.close();
    }
  };

  // ── Today EOD ──
  const todaySales = sales.filter(s=>s.isoDate===today());
  const todayTotal = total(todaySales);
  const topToday = {};
  todaySales.forEach(s=>s.items?.forEach(i=>{topToday[i.name]=(topToday[i.name]||0)+i.qty;}));

  // Hotel today totals
  const todayRestaurantTotal = restaurantOrders
    .filter(o=>(o.status==='completed'||o.status==='paid') && isoDate(new Date(o.created_at||Date.now()))===today())
    .reduce((sum,o)=>sum+(o.total||0),0);
  const todayRoomTotal = roomBookings
    .filter(b=>b.booking_status==='checked_out' && isoDate(new Date(b.check_out_date||Date.now()))===today())
    .reduce((sum,b)=>sum+(b.total||0),0);

  return (
    <section className="view">
      <div className="sectionhead">
        <h2>Reports & Analytics</h2>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-edit" onClick={()=>downloadReport('csv')} title="Download as CSV spreadsheet">
            ⬇ CSV
          </button>
          <button className="btn-edit" onClick={()=>downloadReport('pdf')} title="Download/print as PDF">
            🖨 PDF
          </button>
        </div>
      </div>

      {/* Range filter */}
      <div className="reports-filter-row">
        <div className="filter-bar">
          {['today','week','month','year','custom'].map(r=>(
            <button key={r} className={range===r?'sel-filter':'out-filter'} onClick={()=>setRange(r)}>
              {r[0].toUpperCase()+r.slice(1)}
            </button>
          ))}
          {range==='custom'&&<>
            <label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
            <label>To   <input type="date" value={to}   onChange={e=>setTo(e.target.value)}/></label>
          </>}
        </div>
        <div className="filter-bar reports-tab-bar">
          {[
            ['overview','📊 Overview'],
            ...(businessType !== 'hotel' ? [['products','📦 Products']] : [['hotel','🏨 Hotel']]),
            ['trends','📈 Trends'],
          ].map(([id,lbl])=>(
            <button key={id} className={tab===id?'sel-filter':'out-filter'} onClick={()=>setTab(id)}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="bi-kpi-grid" style={{marginBottom:24}}>
        <KpiCard label="Total Revenue" value={money(net)} note={`${fs.length + fr.length + fb.length} transactions`}
          change={revChg} accent="violet" />
        {businessType !== 'hotel' && (
          <KpiCard label="Retail Sales" value={money(retailRev)} note={`${fs.length} transactions`}
            change={txChg} accent="blue" />
        )}
        {businessType === 'hotel' && (
          <KpiCard label="Restaurant" value={money(restaurantRev)} note={`${fr.length} orders`}
            accent="amber" />
        )}
        {businessType === 'hotel' && (
          <KpiCard label="Room Bookings" value={money(roomRev)} note={`${fb.length} checkouts`}
            accent="green" />
        )}
        {businessType !== 'hotel' && (
          <KpiCard label="Avg Order" value={money(fs.length?retailRev/fs.length:0)} note="Per transaction"
            accent="blue" />
        )}
        <KpiCard label="Expenses" value={money(exp)} note="In period" accent="coral" />
        <KpiCard label="Net Profit" value={money(profit)} note={profit>=0?'Surplus':'Deficit'}
          accent={profit>=0?'green':'coral'} />
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && <>
        <div className="bi-row wide-left">
          <article className="card">
            <h2>Revenue vs Expenses</h2>
            <p style={{fontSize:12,color:'var(--muted)',marginTop:0,marginBottom:16}}>Daily breakdown — {range}</p>
            <LineChart
              labels={trendLabels}
              series={[
                { name:'Revenue',  color:'#7c3aed', data: trendRevData },
                { name:'Expenses', color:'#ef4444', data: trendExpData },
              ]}
              height={200}
            />
          </article>
          <article className="card">
            <h2>Payment methods</h2>
            {payData.length>0 ? <DonutChart data={payData} size={130}/> : <p className="empty-state">No sales.</p>}
          </article>
        </div>

        <div className="bi-row">
          <article className="card">
            <h2>P&L Summary</h2>
            {[
              ['Sales income',      net,  '#7c3aed',  1],
              ...(businessType !== 'hotel' ? [['Cost of purchases', -pur, '#f59e0b', 1]] : []),
              ['Operating expenses',-exp, '#ef4444',  1],
              ['Net profit',  profit,     profit>=0?'#10b981':'#ef4444', 700],
            ].map(([label, val, color, fw]) => (
              <div className="line" key={label}>
                <span style={{fontWeight:fw}}>{label}</span>
                <b style={{color}}>{val >= 0 ? money(val) : `−${money(-val)}`}</b>
              </div>
            ))}
          </article>
          {businessType === 'hotel' ? (
            <article className="card">
              <h2>Revenue by source</h2>
              <DonutChart data={[
                { label:'Restaurant', value:restaurantRev, color:'#f59e0b' },
                { label:'Room Bookings', value:roomRev, color:'#10b981' },
              ].filter(d=>d.value>0)} size={130} />
              {restaurantRev===0&&roomRev===0&&<p className="empty-state">No revenue data.</p>}
            </article>
          ) : (
            <article className="card">
              <h2>Sales by category</h2>
              {catData.length>0 ? <HBarChart data={catData} /> : <p className="empty-state">No data.</p>}
            </article>
          )}
        </div>

        {/* End-of-day */}
        <article className="card wide">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
            <h2 style={{margin:0}}>End-of-day — {new Date().toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}</h2>
            <button className="btn-edit" onClick={()=>window.print()}>🖨 Print</button>
          </div>
          <div className="eod-grid">
            <div className="eod-col">
              <div className="eod-col-title">Totals</div>
              {businessType === 'hotel' ? <>
                {[
                  ['Restaurant revenue', money(todayRestaurantTotal)],
                  ['Room checkout revenue', money(todayRoomTotal)],
                  ['Total today', money(todayTotal + todayRestaurantTotal + todayRoomTotal)],
                ].map(([l,v])=>(
                  <div className="line" key={l}><span>{l}</span><b>{v}</b></div>
                ))}
              </> : <>
                {[['Total sales',money(todayTotal)],['Transactions',todaySales.length],['Avg order',money(todaySales.length?todayTotal/todaySales.length:0)]].map(([l,v])=>(
                  <div className="line" key={l}><span>{l}</span><b>{v}</b></div>
                ))}
              </>}
            </div>
            <div className="eod-col">
              <div className="eod-col-title">By method</div>
              {['M-Pesa','Cash','Card','Credit'].map(m=>(
                <div className="line" key={m}><span>{m}</span><b>{money(total(todaySales.filter(s=>s.method===m)))}</b></div>
              ))}
            </div>
            {businessType !== 'hotel' && (
            <div className="eod-col">
              <div className="eod-col-title">Top items today</div>
              {Object.entries(topToday).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,q])=>(
                <div className="line" key={n}><span>{n}</span><span className="stock-pill">{q} sold</span></div>
              ))}
              {!Object.keys(topToday).length&&<p style={{fontSize:13,color:'var(--muted)'}}>No sales today.</p>}
            </div>
            )}
            {businessType === 'hotel' && (
            <div className="eod-col">
              <div className="eod-col-title">Restaurant today</div>
              {(() => {
                const todayOrders = restaurantOrders.filter(o =>
                  (o.status==='completed'||o.status==='paid') &&
                  isoDate(new Date(o.created_at||Date.now()))===today()
                );
                return todayOrders.length
                  ? todayOrders.slice(0,5).map(o=>(
                      <div className="line" key={o.id}>
                        <span>{o.customer_name||(o.tables?.table_number?`Table ${o.tables.table_number}`:`Order ${o.order_number||String(o.id).slice(-4)}`)}</span>
                        <b>{money(o.total||0)}</b>
                      </div>
                    ))
                  : <p style={{fontSize:13,color:'var(--muted)'}}>No orders today.</p>;
              })()}
            </div>
            )}
          </div>
        </article>
      </>}

      {/* ── PRODUCTS TAB (retail only) ── */}
      {tab === 'products' && businessType !== 'hotel' && <>
        <div className="bi-row">
          <article className="card">
            <h2>Top by revenue</h2>
            <HBarChart data={topProdData} color="#7c3aed" />
            {!topProdData.length&&<p className="empty-state">No data.</p>}
          </article>
          <article className="card">
            <h2>Top by quantity sold</h2>
            <HBarChart data={topQtyData} color="#0ea5e9" />
            {!topQtyData.length&&<p className="empty-state">No data.</p>}
          </article>
        </div>
        <div className="bi-row">
          <article className="card">
            <h2>Revenue by category</h2>
            {catData.length>0?<DonutChart data={catData} size={130}/>:<p className="empty-state">No data.</p>}
          </article>
          <article className="card">
            <h2>Category breakdown</h2>
            <HBarChart data={catData} />
            {!catData.length&&<p className="empty-state">No data.</p>}
          </article>
        </div>
      </>}

      {/* ── HOTEL TAB ── */}
      {tab === 'hotel' && businessType === 'hotel' && (() => {
        // Top menu items from restaurant orders
        const menuItems = {};
        restaurantOrders
          .filter(o=>(o.status==='completed'||o.status==='paid') && rf({isoDate: isoDate(new Date(o.created_at||Date.now()))}))
          .forEach(o => (o.items||o.restaurant_order_items||[]).forEach(i => {
            const name = i.product_name || i.name || 'Item';
            if (!menuItems[name]) menuItems[name] = { rev: 0, qty: 0 };
            menuItems[name].rev += (i.price||0) * (i.quantity||i.qty||1);
            menuItems[name].qty += (i.quantity||i.qty||1);
          }));
        const topMenuData = Object.entries(menuItems)
          .sort((a,b)=>b[1].rev-a[1].rev).slice(0,10)
          .map(([name,v],i)=>({ label:name, value:v.rev, sublabel:`${v.qty} served`, color:['#f59e0b','#0ea5e9','#10b981','#7c3aed','#ef4444'][i%5] }));

        // Room type revenue breakdown
        const roomTypeRev = {};
        roomBookings
          .filter(b=>b.booking_status==='checked_out' && rf({isoDate: isoDate(new Date(b.check_out_date||Date.now()))}))
          .forEach(b => {
            const type = b.room_type || 'Other';
            roomTypeRev[type] = (roomTypeRev[type]||0) + (b.total||0);
          });
        const roomTypeData = Object.entries(roomTypeRev)
          .sort((a,b)=>b[1]-a[1])
          .map(([type,val],i)=>({ label: type.charAt(0).toUpperCase()+type.slice(1), value: val, color:['#10b981','#7c3aed','#0ea5e9','#f59e0b','#ef4444'][i%5] }));

        // Occupancy: bookings by status
        const statusCounts = {};
        roomBookings.forEach(b => { statusCounts[b.booking_status] = (statusCounts[b.booking_status]||0)+1; });

        return <>
          <div className="bi-row">
            <article className="card">
              <h2>Top menu items</h2>
              <HBarChart data={topMenuData} color="#f59e0b" />
              {!topMenuData.length&&<p className="empty-state">No restaurant data.</p>}
            </article>
            <article className="card">
              <h2>Revenue by room type</h2>
              {roomTypeData.length>0?<DonutChart data={roomTypeData} size={130}/>:<p className="empty-state">No checkout data.</p>}
            </article>
          </div>
          <div className="bi-row">
            <article className="card">
              <h2>Booking status breakdown</h2>
              {Object.entries(statusCounts).map(([status,count])=>(
                <div className="line" key={status}>
                  <span style={{textTransform:'capitalize'}}>{status.replace(/_/g,' ')}</span>
                  <b>{count} booking{count!==1?'s':''}</b>
                </div>
              ))}
              {!Object.keys(statusCounts).length&&<p className="empty-state">No bookings.</p>}
            </article>
            <article className="card">
              <h2>Room type revenue</h2>
              <HBarChart data={roomTypeData} color="#10b981" />
              {!roomTypeData.length&&<p className="empty-state">No checkout data.</p>}
            </article>
          </div>
        </>;
      })()}

      {/* ── TRENDS TAB ── */}
      {tab === 'trends' && <>
        <article className="card" style={{marginBottom:20}}>
          <h2>Revenue trend</h2>
          <BarChart
            data={trendRevData.map((v,i)=>({ label: trendLabels[i], value: v }))}
            height={200} color="#7c3aed"
          />
        </article>
        <div className="bi-row">
          <article className="card">
            <h2>Expense categories</h2>
            {expCatData.length>0?<DonutChart data={expCatData} size={130}/>:<p className="empty-state">No expenses.</p>}
          </article>
          <article className="card">
            <h2>Peak hours</h2>
            <p style={{fontSize:12,color:'var(--muted)',marginTop:0,marginBottom:12}}>
              Transactions by hour of day · Peak: <b>{peakHour}:00 – {peakHour+1}:00</b>
            </p>
            <BarChart
              data={hourly.map((v,i)=>({
                label: i%6===0?`${i}h`:'',
                value: v,
                color: i===peakHour?'#7c3aed':'#c4b5fd',
              }))}
              height={140} color="#7c3aed"
            />
          </article>
        </div>
        <article className="card">
          <h2>Revenue vs Expenses vs Profit</h2>
          <LineChart
            labels={trendLabels}
            series={[
              { name:'Revenue', color:'#7c3aed', data: trendRevData },
              { name:'Expenses', color:'#ef4444', data: trendExpData },
              { name:'Profit',  color:'#10b981', data: trendRevData.map((v,i)=>Math.max(0,v-trendExpData[i])) },
            ]}
            height={200}
          />
        </article>
      </>}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   EMOJI PICKER
───────────────────────────────────────────────────────────── */
const EMOJI_GROUPS = [
  { label: 'Drinks',      emojis: ['💧','🥤','🧃','☕','🍵','🧋','🍺','🍻','🥂','🍷','🍸','🍹','🧉','🫖','🥃','🍾'] },
  { label: 'Food',        emojis: ['🍞','🥐','🥖','🫓','🥨','🧀','🥚','🍳','🧇','🥞','🧈','🍖','🍗','🥩','🥓','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🫕','🥗','🥘','🫙','🍱','🍣','🍜','🍝','🥟','🍚','🍛','🍲'] },
  { label: 'Snacks',      emojis: ['🍿','🧂','🥜','🫘','🌰','🍫','🍬','🍭','🍮','🍯','🎂','🍰','🧁','🥧','🍡','🍢','🍧','🍨','🍦','🥠','🥮','🍤'] },
  { label: 'Fruits & Veg',emojis: ['🍎','🍊','🍋','🍋‍🟩','🍇','🍓','🫐','🍑','🥭','🍍','🥝','🍌','🍒','🍈','🫒','🥑','🍆','🥦','🥬','🥒','🌶️','🫑','🧄','🧅','🥕','🌽','🍠','🥔','🍅','🥑','🫛','🌿'] },
  { label: 'Dairy & Bakery',emojis:['🥛','🧈','🫙','🧁','🍰','🎂','🥧','🍮','🧆','🫓','🥖','🍞','🥐','🥨','🧀','🫕'] },
  { label: 'Alcohol',     emojis: ['🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾','🧉','🫗','🍶','🥛'] },
  { label: 'Pharmacy',    emojis: ['💊','💉','🩺','🩹','🩻','🧬','🔬','🩼','🧪','🫀','🫁','🩸','🧫','⚕️','🏥','💆'] },
  { label: 'Beauty & Personal',emojis:['💄','💅','🪞','🧴','🧼','🪥','🪒','🧻','🩱','👄','💋','🧖','💆','🧘','🛁','🪮'] },
  { label: 'Household',   emojis: ['🧹','🧺','🧻','🪣','🧽','🛒','🪤','🪣','🗑️','🧲','🔧','🪛','🔩','🪟','🚿','🛁','🪴','🕯️','🔌','💡','🔦','🧯'] },
  { label: 'Electronics', emojis: ['📱','💻','🖥️','🖨️','⌨️','🖱️','🖲️','💾','💿','📀','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','🔋','🔌','💡'] },
  { label: 'Clothing',    emojis: ['👔','👗','👘','🥻','🩱','🩲','🩳','👙','👚','👛','👜','👝','🎒','🛍️','👒','🎩','🧢','⛑️','👞','👟','🥾','🥿','👠','👡','👢','🧣','🧤','🧥','🧦','🕶️'] },
  { label: 'Hotels & Rooms',emojis:['🛏️','🛋️','🚿','🛁','🪒','🧴','🧻','🛎️','🔑','🗝️','🏨','🏩','🏪','🏫','🏬','🏭','🏰','🏯','⛩️','🛖','🏕️','⛺','🪞','🪑','🚪','🪟','🧳','🗺️'] },
  { label: 'Restaurant & Cafe',emojis:['🍽️','🥢','🍴','🥄','🔪','🫙','🧂','🍷','🥂','☕','🫖','🍵','🧁','🎂','🍰','🍮','🍯','🧆','🥗','🍱','🍜','🍝','🍲','🍛','🥘','🫕','🌮','🌯','🥙','🥪'] },
  { label: 'Club & Bar',  emojis: ['🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎷','🎤','🎧','🎼','🎙️','🕺','💃','🍹','🍸','🥃','🍾','🎉','🎊','🪩','🎭','🎪','🎮','🃏','🎲','🎯','🎱','🎳'] },
  { label: 'Stationery & Office',emojis:['📝','📒','📓','📔','📕','📗','📘','📙','📚','📖','📏','📐','✂️','🗃️','📌','📍','📎','🖇️','✏️','🖊️','🖋️','🖌️','🖍️','📋','🗒️','🗓️','🗑️','🗂️','🖥️','🖨️','🖱️'] },
  { label: 'Toys & Kids', emojis: ['🧸','🪆','🪅','🎎','🪀','🪁','🎯','🎮','🕹️','🎲','♟️','🧩','🎪','🎠','🎡','🎢','🤹','🎭','🎨','🖼️','🎠','⛸️','🛼','🛹','🚲','🛴','🪂'] },
  { label: 'Sports & Fitness',emojis:['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥅','⛳','🎣','🏋️','🤸','⛹️','🤺','🤼','🏇','🧘','🏊','🚴','🧗'] },
  { label: 'Other',       emojis: ['🏷️','📦','🛍️','🎁','💰','🪙','💳','🔑','⭐','✅','🔔','🆕','🆒','🆓','❤️','🔥','💯','✨','🎀','🎗️','🪄','🏅'] },
];

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(EMOJI_GROUPS[0].label);
  const current = EMOJI_GROUPS.find(g => g.label === group) || EMOJI_GROUPS[0];

  return (
    <div className="emoji-picker-wrap">
      <button
        type="button"
        className="emoji-trigger"
        onClick={() => setOpen(o => !o)}
        title="Pick an icon"
      >
        <span className="emoji-preview">{value || '🏷️'}</span>
        <span className="emoji-trigger-label">Change icon</span>
      </button>

      {open && (
        <div className="emoji-dropdown">
          <div className="emoji-groups">
            {EMOJI_GROUPS.map(g => (
              <button
                key={g.label}
                type="button"
                className={`emoji-group-btn ${g.label === group ? 'active' : ''}`}
                onClick={() => setGroup(g.label)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="emoji-grid">
            {current.emojis.map(e => (
              <button
                key={e}
                type="button"
                className={`emoji-btn ${value === e ? 'selected' : ''}`}
                onClick={() => { onChange(e); setOpen(false); }}
                title={e}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MODALS
───────────────────────────────────────────────────────────── */
function ProductModal({product={},categories,save,close}) {
  const [d,setD]=useState({name:product.name||'',brand:product.brand||'',category:product.category||'',barcode:product.barcode||'',price:product.price||'',stock:product.stock??'',lowStock:product.low_stock||product.lowStock||5,icon:product.icon||'🏷️'});
  const [scanning,setScanning]=useState(false);
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return(
    <div className="modal">
      {scanning && (
        <BarcodeScanner
          onDetect={code=>{ set('barcode', code); setScanning(false); }}
          onClose={()=>setScanning(false)}
        />
      )}
      <form onSubmit={e=>{e.preventDefault();save(d);}}>
        <button type="button" className="close" onClick={close}>×</button>
        <p>{product.id?'EDIT PRODUCT':'NEW PRODUCT'}</p>
        <h2>{product.id?`Edit ${product.name}`:'Add product'}</h2>

        <div className="icon-row">
          <div className="icon-preview-card">
            <span style={{fontSize:40}}>{d.icon||'🏷️'}</span>
            <small>Product icon</small>
          </div>
          <EmojiPicker value={d.icon} onChange={v => set('icon', v)} />
        </div>

        <div className="modal-grid">
          <label>Name <input required value={d.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Mineral Water 500ml"/></label>
          <label>Brand <small>(opt)</small><input value={d.brand} onChange={e=>set('brand',e.target.value)} placeholder="e.g. Dasani"/></label>
          <label>Category
            <select required value={d.category} onChange={e=>set('category',e.target.value)}>
              <option value="">— Select —</option>
              {categories.map(c=><option key={c}>{c}</option>)}
            </select>
          </label>

          <label style={{gridColumn:'1/-1'}}>
            Barcode
            <div className="barcode-field">
              <input
                required
                value={d.barcode}
                onChange={e=>set('barcode',e.target.value)}
                placeholder="Scan or enter barcode"
                className="barcode-input"
              />
              <button
                type="button"
                className="barcode-scan-btn"
                onClick={()=>setScanning(true)}
                title="Use camera to scan barcode"
              >
                📷 Scan
              </button>
              <button
                type="button"
                className="barcode-gen-btn"
                onClick={()=>set('barcode',genBarcode())}
                title="Auto-generate a barcode"
              >
                <span className="barcode-gen-icon">⚡</span>
                Generate
              </button>
            </div>
            {d.barcode && (
              <div className="barcode-preview">
                <div className="barcode-bars">
                  {Array.from({length:32}).map((_,i)=>(
                    <span key={i} style={{
                      width: i%4===0?3:i%3===0?2:1,
                      background:'var(--ink)',
                      display:'inline-block',
                      height: i%5===0?32:i%3===0?24:28,
                      borderRadius:1,
                      opacity: i%7===0?.5:1,
                    }}/>
                  ))}
                </div>
                <span className="barcode-number">{d.barcode}</span>
              </div>
            )}
          </label>

          <label>Price (KSh)
            <input required type="number" min="0" step="0.01" value={d.price} onChange={e=>set('price',e.target.value)} placeholder="0.00"/>
          </label>
          <label>Stock qty
            <input type="number" min="0" value={d.stock} onChange={e=>set('stock',e.target.value)} placeholder="0"/>
          </label>
          <label>Low stock alert
            <input type="number" min="0" value={d.lowStock} onChange={e=>set('lowStock',e.target.value)} placeholder="5"/>
          </label>
        </div>

        <button className="primary" style={{marginTop:16}}>{product.id?'Save changes':'Add product'}</button>
      </form>
    </div>
  );
}

function PurchaseModal({products,suppliers,save,close}) {
  const [d,setD]=useState({supplier:'',productId:'',qty:'',cost:'',note:''});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  const sel=products.find(p=>p.id===d.productId);
  return(<div className="modal"><form onSubmit={e=>{e.preventDefault();save({...d,productName:sel?.name||d.note,cost:+d.cost,qty:+d.qty});}}>
    <button type="button" className="close" onClick={close}>×</button>
    <p>RECORD PURCHASE</p><h2>Add purchase</h2>
    <label>Supplier<input list="sl" required value={d.supplier} onChange={e=>set('supplier',e.target.value)}/><datalist id="sl">{suppliers.map(s=><option key={s.id} value={s.name}/>)}</datalist></label>
    <label>Product (to restock)<select value={d.productId} onChange={e=>set('productId',e.target.value)}><option value="">— Optional —</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}{p.brand?` (${p.brand})`:''}</option>)}</select></label>
    {sel&&<p style={{fontSize:12,color:'var(--muted)'}}>Current stock: {sel.stock??0}</p>}
    <label>Qty received <input type="number" min="0" value={d.qty} onChange={e=>set('qty',e.target.value)}/></label>
    <label>Note         <input value={d.note} onChange={e=>set('note',e.target.value)}/></label>
    <label>Cost (KSh)   <input required type="number" min="0" step="0.01" value={d.cost} onChange={e=>set('cost',e.target.value)}/></label>
    <button className="primary">Save purchase</button>
  </form></div>);
}

function RecordModal({type,save,close}) {
  const [d,setD]=useState({});
  const fields=type==='customer'?[['name','Customer name'],['phone','Phone']]:type==='supplier'?[['name','Supplier name'],['company','Company'],['phone','Phone'],['email','Email']]:[['category','Category'],['note','Description'],['amount','Amount (KSh)','number']];
  return(<div className="modal"><form onSubmit={e=>{e.preventDefault();save(type,{...d,amount:+d.amount||d.amount});}}>
    <button type="button" className="close" onClick={close}>×</button>
    <p>NEW RECORD</p><h2>Add {type}</h2>
    {fields.map(([k,l,t])=><label key={k}>{l}<input required type={t||'text'} onChange={e=>setD({...d,[k]:e.target.value})}/></label>)}
    <button className="primary">Save record</button>
  </form></div>);
}

/* ─────────────────────────────────────────────────────────────
   ADMIN SUBSCRIPTIONS TAB
───────────────────────────────────────────────────────────── */
function AdminSubscriptionsTab({ stores, allPayments, stats, fmt }) {
  const [filter, setFilter] = useState('all');
  
  const filtered = stores.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'active') return s.subscription_status === 'active' && s.subscription_plan !== 'trial';
    if (filter === 'expired') return s.subscription_status === 'expired';
    if (filter === 'trial') return s.subscription_plan === 'trial';
    return true;
  });

  const timelinePg = usePagination(filtered, 15);
  const paymentsPg = usePagination(allPayments, 20);

  return (
    <section className="view">
      <div className="metrics" style={{marginBottom: 20}}>
        <Metric 
          label="Monthly Revenue" 
          value={fmt(stats.monthly_revenue || 0)} 
          note="Recurring" 
          accent="green" 
        />
        <Metric 
          label="Yearly Revenue" 
          value={fmt(stats.yearly_revenue_potential || 0)} 
          note="Annual plans" 
          accent="emerald" 
        />
        <Metric 
          label="Active" 
          value={stats.active_subscriptions || 0} 
          note="Paid stores" 
          accent="blue" 
        />
        <Metric 
          label="Expired" 
          value={stats.expired_subscriptions || 0} 
          note="Need renewal" 
          accent="coral" 
        />
      </div>

      <div className="filter-tabs">
        {[
          ['all', 'All Stores'],
          ['active', 'Active'],
          ['trial', 'Trial'],
          ['expired', 'Expired']
        ].map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? 'active' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <article className="card" style={{marginBottom: 20}}>
        <h3>Subscription Timeline</h3>
        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', marginTop: 12}}>
            <thead>
              <tr>
                <th>Store</th>
                <th>Plan</th>
                <th>Started</th>
                <th>Expires</th>
                <th>Days Left</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {timelinePg.slice.map(s => {
                const isExpiring = s.days_remaining <= 7 && s.days_remaining > 0;
                const isExpired = s.subscription_status === 'expired';
                
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b></td>
                    <td>{s.subscription_plan}</td>
                    <td>
                      {s.subscription_starts_at ? 
                        new Date(s.subscription_starts_at).toLocaleDateString('en-KE') : '—'}
                    </td>
                    <td>
                      {s.subscription_ends_at ? 
                        new Date(s.subscription_ends_at).toLocaleDateString('en-KE') : '—'}
                    </td>
                    <td>
                      <span style={{
                        color: isExpired ? 'var(--coral)' : isExpiring ? 'var(--amber)' : 'inherit'
                      }}>
                        {s.days_remaining !== null ? `${s.days_remaining} days` : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`stock-pill ${isExpired ? 'danger' : isExpiring ? 'warning' : ''}`}>
                        {s.subscription_status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...timelinePg} />
      </article>

      <article className="card table">
        <h3 style={{marginBottom: 12}}>Recent Payments</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Store</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Code</th>
              <th>Period</th>
            </tr>
          </thead>
          <tbody>
            {paymentsPg.slice.map(p => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleDateString('en-KE')}</td>
                <td><b>{p.store_name}</b></td>
                <td>{p.plan}</td>
                <td><b>{fmt(p.amount)}</b></td>
                <td>{p.payment_method}</td>
                <td><code style={{fontSize: 11}}>{p.mpesa_code || '—'}</code></td>
                <td style={{fontSize: 11, color: 'var(--muted)'}}>
                  {new Date(p.starts_at).toLocaleDateString('en-KE', {month: 'short', day: 'numeric'})}
                  {' → '}
                  {new Date(p.ends_at).toLocaleDateString('en-KE', {month: 'short', day: 'numeric'})}
                </td>
              </tr>
            ))}
            {!allPayments.length && (
              <tr><td colSpan={7} className="empty-td">No payments yet.</td></tr>
            )}
          </tbody>
        </table>
      </article>
      <Pagination {...paymentsPg} />
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   SUBSCRIPTION MANAGEMENT MODAL
───────────────────────────────────────────────────────────── */
function SubscriptionManagementModal({ store, plans, onUpdate, onClose, notify }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('M-Pesa');
  const [mpesaCode, setMpesaCode] = useState('');
  const [loading, setLoading] = useState(false);

  const currentPlanInfo = plans.find(p => p.id === store.subscription_plan);

  const handleRenew = async () => {
    if (!selectedPlan) {
      notify('Please select a plan');
      return;
    }
    
    if (paymentMethod === 'M-Pesa' && !mpesaCode.trim()) {
      notify('Please enter M-Pesa transaction code');
      return;
    }

    setLoading(true);
    const plan = plans.find(p => p.id === selectedPlan);
    await onUpdate(store.id, selectedPlan, plan.price, paymentMethod, mpesaCode);
    setLoading(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2>Manage Subscription: {store.name}</h2>
        
        {/* Current Status */}
        <div className="subscription-status">
          <h3>Current Status</h3>
          <div className="status-grid">
            <div className="status-item">
              <small>Plan</small>
              <div><b>{currentPlanInfo?.name || store.subscription_plan}</b></div>
            </div>
            <div className="status-item">
              <small>Cashiers</small>
              <div><b>{store.cashier_count} / {store.cashier_limit}</b></div>
            </div>
            <div className="status-item">
              <small>Status</small>
              <div>
                <span className={`stock-pill ${store.subscription_status === 'expired' ? 'danger' : ''}`}>
                  {store.subscription_status}
                </span>
              </div>
            </div>
            <div className="status-item">
              <small>Expires</small>
              <div>
                {store.subscription_ends_at ? 
                  new Date(store.subscription_ends_at).toLocaleDateString('en-KE') : '—'}
                <small style={{display: 'block', color: 'var(--muted)', fontSize: 11}}>
                  {store.days_remaining !== null && `${store.days_remaining} days left`}
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Selection */}
        <h3 style={{marginBottom: 12}}>Renew / Upgrade Plan</h3>
        <div className="plan-grid">
          {plans.filter(p => p.id !== 'trial').map(plan => (
            <div
              key={plan.id}
              className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <div className="plan-name">{plan.name}</div>
              <div className="plan-price">KSh {plan.price.toLocaleString()}</div>
              <div className="plan-details">
                {plan.duration} • {plan.cashier_limit} cashiers
              </div>
              {plan.savings && (
                <div className="plan-savings">
                  💰 {plan.savings}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Payment Form */}
        {selectedPlan && (
          <div className="payment-section">
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="M-Pesa">M-Pesa</option>
              <option value="Card">Card</option>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>

            {paymentMethod === 'M-Pesa' && (
              <>
                <label>M-Pesa Transaction Code</label>
                <input
                  type="text"
                  placeholder="e.g. QDJ4KL9X2M"
                  value={mpesaCode}
                  onChange={e => setMpesaCode(e.target.value.toUpperCase())}
                  style={{textTransform: 'uppercase'}}
                />
                <small>
                  Send payment to: Paybill/Till number • Enter code above
                </small>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button onClick={onClose} disabled={loading}>Cancel</button>
          <button 
            className="primary" 
            onClick={handleRenew} 
            disabled={loading || !selectedPlan}
          >
            {loading ? 'Processing' : 'Process Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SUBSCRIPTION PAGE (Manager dedicated page)
───────────────────────────────────────────────────────────── */
function SubscriptionPage({ session, storeId, notify }) {
  const [plans,          setPlans]          = useState([]);
  const [paymentConfig,  setPaymentConfig]  = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [showModal,      setShowModal]      = useState(false);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    if (!supabase || !storeId) { setLoading(false); return; }
    Promise.all([
      getSubscriptionPlans(),
      getPaymentConfig(),
      getStorePaymentHistory(storeId),
    ]).then(([p, cfg, hist]) => {
      setPlans(p.filter(x => x.id !== 'trial'));
      setPaymentConfig(cfg);
      setPaymentHistory(hist);
      setLoading(false);
    });
  }, [storeId]);

  const histPg = usePagination(paymentHistory, 10);

  const isExpired   = session.subscription_status === 'expired';
  const isExpiring  = !isExpired && session.days_remaining != null && session.days_remaining <= 7 && session.days_remaining > 0;
  const planLabel   = (id) => ({ monthly_basic:'Monthly Basic', monthly_premium:'Monthly Premium', yearly_basic:'Yearly Basic', yearly_premium:'Yearly Premium', trial:'Free Trial' })[id] || id;

  const statusBadgeClass = isExpired ? 'danger' : isExpiring ? 'warning' : 'green';

  if (loading) return <section className="view"><div style={{padding:40,textAlign:'center',color:'var(--muted)'}}>Loading…</div></section>;

  return (
    <section className="view">
      <div className="sectionhead"><h2>Subscription &amp; Billing</h2></div>

      {/* ── Status card ─────────────────────────────────────── */}
      {isExpired && (
        <div className="alert-banner danger" style={{marginBottom:16}}>
          ⚠️ Your subscription has expired. Renew immediately to restore full access.
        </div>
      )}
      {isExpiring && (
        <div className="alert-banner warning" style={{marginBottom:16}}>
          ⏰ Your subscription expires in <b>{session.days_remaining} day{session.days_remaining !== 1 ? 's' : ''}</b>. Renew now to avoid interruption.
        </div>
      )}

      <div className="sub-page-grid">
        {/* Current plan */}
        <article className="card">
          <h3 style={{marginBottom:16}}>Current Plan</h3>
          <div className="status-grid">
            <div className="status-item">
              <small>Plan</small>
              <div><b>{planLabel(session.subscription_plan)}</b></div>
            </div>
            <div className="status-item">
              <small>Status</small>
              <div><span className={`stock-pill ${statusBadgeClass}`}>{session.subscription_status}</span></div>
            </div>
            <div className="status-item">
              <small>Expires</small>
              <div>
                <b>{session.subscription_ends_at ? new Date(session.subscription_ends_at).toLocaleDateString('en-KE', {day:'numeric', month:'long', year:'numeric'}) : '—'}</b>
              </div>
            </div>
            <div className="status-item">
              <small>Days remaining</small>
              <div style={{color: isExpired ? 'var(--coral)' : isExpiring ? 'var(--amber)' : 'inherit'}}>
                <b>{session.days_remaining != null ? session.days_remaining : '—'}</b>
              </div>
            </div>
            <div className="status-item">
              <small>Cashier limit</small>
              <div><b>{session.cashier_limit || 3} cashier{(session.cashier_limit || 3) !== 1 ? 's' : ''}</b></div>
            </div>
          </div>

          <button className="primary" style={{marginTop:20, width:'100%'}} onClick={() => setShowModal(true)}>
            🔄 {isExpired ? 'Renew Subscription' : 'Renew / Upgrade Plan'}
          </button>
        </article>

        {/* Payment instructions */}
        <article className="card">
          <h3 style={{marginBottom:16}}>How to Pay</h3>
          {paymentConfig ? (
            <ol className="payment-steps">
              <li>Open <b>M-Pesa</b> on your phone</li>
              {paymentConfig.mpesa_type === 'till' ? (
                <>
                  <li>Select <b>Buy Goods and Services</b></li>
                  <li>Enter Till Number:<br/>
                    <code className="mpesa-code">{paymentConfig.mpesa_number}</code>
                  </li>
                </>
              ) : (
                <>
                  <li>Select <b>Lipa Na M-Pesa → Paybill</b></li>
                  <li>Business No.:<br/>
                    <code className="mpesa-code">{paymentConfig.mpesa_number}</code>
                  </li>
                  {paymentConfig.account_number && (
                    <li>Account No.:<br/>
                      <code className="mpesa-code">{paymentConfig.account_number}</code>
                    </li>
                  )}
                </>
              )}
              <li>Enter the <b>amount</b> for your chosen plan</li>
              <li>Enter your <b>M-Pesa PIN</b> and confirm</li>
              <li>Copy the <b>transaction code</b> from the SMS</li>
              <li>Click <b>Renew</b> and paste the code</li>
            </ol>
          ) : (
            <div style={{color:'var(--muted)', fontSize:14, padding:'20px 0'}}>
              Payment details not configured yet.<br/>Contact your administrator to set up payment info.
            </div>
          )}
          {paymentConfig?.instructions && (
            <div className="alert-banner warning" style={{marginTop:16}}>
              ℹ️ {paymentConfig.instructions}
            </div>
          )}
        </article>

        {/* Plans overview */}
        <article className="card wide">
          <h3 style={{marginBottom:16}}>Available Plans</h3>
          <div className="plan-grid">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`plan-card ${session.subscription_plan === plan.id ? 'selected' : ''}`}
                onClick={() => setShowModal(true)}
              >
                {session.subscription_plan === plan.id && (
                  <div style={{fontSize:10, fontWeight:700, color:'var(--violet)', textTransform:'uppercase', letterSpacing:1, marginBottom:6}}>
                    ✓ Current plan
                  </div>
                )}
                <div className="plan-name">{plan.name}</div>
                <div className="plan-price">KSh {plan.price.toLocaleString()}</div>
                <div className="plan-details">{plan.duration} • up to {plan.cashier_limit} cashiers</div>
                {plan.savings && <div className="plan-savings">💰 {plan.savings}</div>}
              </div>
            ))}
          </div>
          <p style={{color:'var(--muted)', fontSize:12, marginTop:12}}>
            Click any plan to renew. Payments are reviewed and activated by the administrator.
          </p>
        </article>

        {/* Payment history — table for desktop, cards for mobile */}
        <article className="card wide">
          <h3 style={{marginBottom:12}}>Payment History</h3>
          <table style={{width:'100%'}}>
            <thead>
              <tr><th>Date</th><th>Plan</th><th>Amount</th><th>M-Pesa Code</th><th>Status</th><th>Note</th></tr>
            </thead>
            <tbody>
              {histPg.slice.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.created_at).toLocaleDateString('en-KE')}</td>
                  <td>{planLabel(p.plan)}</td>
                  <td><b>KSh {Number(p.amount).toLocaleString()}</b></td>
                  <td><code style={{fontSize:11, letterSpacing:1}}>{p.mpesa_code || '—'}</code></td>
                  <td>
                    <span className={`stock-pill ${p.status === 'approved' ? 'green' : p.status === 'rejected' ? 'danger' : 'amber'}`}>
                      {p.status === 'approved' ? '✓ Approved' : p.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                    </span>
                  </td>
                  <td style={{fontSize:12, color:'var(--muted)'}}>
                    {p.status === 'rejected' && p.rejection_reason
                      ? <span style={{color:'var(--coral)'}}>{p.rejection_reason}</span>
                      : p.status === 'pending' ? 'Awaiting admin review'
                      : p.status === 'approved' ? `Valid until ${new Date(p.ends_at).toLocaleDateString('en-KE')}`
                      : '—'}
                  </td>
                </tr>
              ))}
              {!paymentHistory.length && (
                <tr><td colSpan={6} className="empty-td">No payments yet. Click "Renew" to get started.</td></tr>
              )}
            </tbody>
          </table>

          {/* Mobile card view */}
          <div className="payment-history-cards">
            {histPg.slice.map(p => (
              <div key={p.id} style={{background:'var(--wash)',borderRadius:12,padding:'14px 16px',border:'1px solid var(--line)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <b style={{fontSize:15}}>{planLabel(p.plan)}</b>
                    <small style={{display:'block',color:'var(--muted)',fontSize:12,marginTop:2}}>
                      {new Date(p.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}
                    </small>
                  </div>
                  <span className={`stock-pill ${p.status==='approved'?'green':p.status==='rejected'?'danger':'amber'}`}>
                    {p.status==='approved'?'✓ Approved':p.status==='rejected'?'✗ Rejected':'⏳ Pending'}
                  </span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <b style={{fontSize:17,color:'var(--violet)'}}>KSh {Number(p.amount).toLocaleString()}</b>
                  {p.mpesa_code && <code style={{fontSize:12,letterSpacing:1,background:'var(--violet-lt)',color:'var(--violet)',padding:'3px 8px',borderRadius:6}}>{p.mpesa_code}</code>}
                </div>
                {p.status==='rejected'&&p.rejection_reason&&(
                  <p style={{margin:'8px 0 0',fontSize:12,color:'var(--coral)'}}>{p.rejection_reason}</p>
                )}
                {p.status==='approved'&&p.ends_at&&(
                  <p style={{margin:'8px 0 0',fontSize:12,color:'var(--muted)'}}>Valid until {new Date(p.ends_at).toLocaleDateString('en-KE')}</p>
                )}
              </div>
            ))}
            {!paymentHistory.length && (
              <p style={{textAlign:'center',color:'var(--muted)',fontSize:14,padding:'20px 0'}}>No payments yet. Click "Renew" to get started.</p>
            )}
          </div>

          <Pagination {...histPg} />
        </article>
      </div>

      {showModal && (
        <ManagerRenewalModal
          storeId={storeId}
          userId={session.userId}
          paymentConfig={paymentConfig}
          plans={plans}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            getStorePaymentHistory(storeId).then(setPaymentHistory);
            notify('✅ Renewal request submitted! Your admin will approve it shortly.');
          }}
          notify={notify}
        />
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   MANAGER RENEWAL MODAL
───────────────────────────────────────────────────────────── */
function ManagerRenewalModal({ storeId, userId, paymentConfig, plans, onClose, onSuccess, notify }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [mpesaCode, setMpesaCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selectedPlan) { notify('Please select a plan.'); return; }
    if (!mpesaCode.trim()) { notify('Please enter your M-Pesa transaction code.'); return; }
    const plan = plans.find(p => p.id === selectedPlan);
    setLoading(true);
    const { data, error } = await requestSubscriptionRenewal(storeId, selectedPlan, plan.price, mpesaCode, userId);
    setLoading(false);
    if (error) { notify(`Error: ${error}`); return; }
    onSuccess();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2>🔄 Renew Subscription</h2>

        {/* Payment instructions from admin */}
        {paymentConfig ? (
          <div className="subscription-status" style={{marginBottom: 24}}>
            <h3>Payment Instructions</h3>
            <ol style={{paddingLeft: 20, lineHeight: 2, fontSize: 14}}>
              <li>Open <b>M-Pesa</b> on your phone</li>
              {paymentConfig.mpesa_type === 'till' ? (
                <>
                  <li>Select <b>Buy Goods and Services</b></li>
                  <li>Enter Till Number: <code style={{fontSize:15, fontWeight:700, background:'var(--violet-lt)', padding:'2px 8px', borderRadius:6, color:'var(--violet)'}}>{paymentConfig.mpesa_number}</code></li>
                </>
              ) : (
                <>
                  <li>Select <b>Lipa Na M-Pesa → Paybill</b></li>
                  <li>Business No.: <code style={{fontSize:15, fontWeight:700, background:'var(--violet-lt)', padding:'2px 8px', borderRadius:6, color:'var(--violet)'}}>{paymentConfig.mpesa_number}</code></li>
                  {paymentConfig.account_number && (
                    <li>Account No.: <code style={{fontSize:15, fontWeight:700, background:'var(--violet-lt)', padding:'2px 8px', borderRadius:6, color:'var(--violet)'}}>{paymentConfig.account_number}</code></li>
                  )}
                </>
              )}
              <li>Enter the <b>amount</b> shown below</li>
              <li>Complete payment and <b>copy the M-Pesa code</b></li>
              <li>Paste the code in the field below and submit</li>
            </ol>
            {paymentConfig.instructions && (
              <p style={{marginTop: 10, fontSize: 13, color: 'var(--muted)', fontStyle: 'italic'}}>
                ℹ️ {paymentConfig.instructions}
              </p>
            )}
          </div>
        ) : (
          <div className="alert-banner warning" style={{marginBottom: 20}}>
            ⚠️ Payment details not configured yet. Contact your administrator.
          </div>
        )}

        {/* Plan Selection */}
        <h3 style={{marginBottom: 12}}>Select Plan</h3>
        <div className="plan-grid" style={{marginBottom: 24}}>
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <div className="plan-name">{plan.name}</div>
              <div className="plan-price">KSh {plan.price.toLocaleString()}</div>
              <div className="plan-details">{plan.duration} • {plan.cashier_limit} cashiers</div>
              {plan.savings && <div className="plan-savings">💰 {plan.savings}</div>}
            </div>
          ))}
        </div>

        {/* M-Pesa Code */}
        {selectedPlan && (
          <div className="payment-section">
            <label>M-Pesa Transaction Code</label>
            <input
              type="text"
              placeholder="e.g. QDJ4KL9X2M"
              value={mpesaCode}
              onChange={e => setMpesaCode(e.target.value.toUpperCase())}
              style={{textTransform: 'uppercase', letterSpacing: 2}}
              autoFocus
            />
            <small>Copy the SMS confirmation code from M-Pesa and paste it here</small>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose} disabled={loading}>Cancel</button>
          <button className="primary" onClick={handleSubmit} disabled={loading || !selectedPlan || !mpesaCode.trim()}>
            {loading ? 'Submitting…' : 'Submit Renewal Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ADMIN SUBSCRIPTION REQUESTS TAB
───────────────────────────────────────────────────────────── */
function AdminRequestsTab({ requests, onApprove, onReject, fmt }) {
  const [filter, setFilter] = useState('pending');
  
  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const pg = usePagination(filtered, 20);

  const planLabels = {
    trial: 'Free Trial',
    monthly_basic: 'Monthly Basic - KSh 850/mo',
    monthly_premium: 'Monthly Premium - KSh 1,500/mo',
    yearly_basic: 'Yearly Basic - KSh 8,500/yr',
    yearly_premium: 'Yearly Premium - KSh 15,000/yr',
  };

  const statusColors = {
    pending: 'amber',
    approved: 'green',
    rejected: 'red',
  };

  return (
    <section className="view">
      <div className="metrics" style={{marginBottom: 20}}>
        <Metric label="Total Requests" value={requests.length} note="All time" accent="violet" />
        <Metric label="Pending" value={requests.filter(r => r.status === 'pending').length} note="Awaiting review" accent="amber" />
        <Metric label="Approved" value={requests.filter(r => r.status === 'approved').length} note="Stores created" accent="green" />
        <Metric label="Rejected" value={requests.filter(r => r.status === 'rejected').length} note="Declined" accent="red" />
      </div>

      <article className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <h3 style={{margin:0}}>Subscription Requests</h3>
          <div style={{display:'flex', gap:8}}>
            {['all', 'pending', 'approved', 'rejected'].map(f => (
              <button 
                key={f}
                className={filter === f ? 'btn-edit' : ''}
                style={{
                  padding:'6px 14px', fontSize:13, fontWeight:600,
                  background: filter === f ? 'var(--violet)' : 'var(--wash)',
                  color: filter === f ? '#fff' : 'var(--muted)',
                  border:'none', borderRadius:6, cursor:'pointer'
                }}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {!filtered.length ? (
          <div style={{padding: '40px 20px', textAlign: 'center', color: 'var(--muted)'}}>
            <div style={{fontSize: 40, marginBottom: 12}}>📝</div>
            <p style={{fontSize: 16, fontWeight: 600}}>No {filter} requests</p>
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Business</th>
                  <th>Owner</th>
                  <th>Contact</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pg.slice.map(r => (
                  <tr key={r.id}>
                    <td style={{fontSize:12, color:'var(--muted)'}}>
                      {new Date(r.created_at).toLocaleDateString('en-KE', {month:'short', day:'numeric', year:'numeric'})}
                    </td>
                    <td>
                      <b>{r.business_name}</b>
                      {r.address && <div style={{fontSize:11, color:'var(--muted)', marginTop:2}}>{r.address}</div>}
                    </td>
                    <td>{r.owner_name}</td>
                    <td>
                      <div style={{fontSize:12}}>
                        <div>{r.phone}</div>
                        {r.email && <div style={{fontSize:11, color:'var(--muted)', marginTop:2}}>{r.email}</div>}
                      </div>
                    </td>
                    <td>
                      <span className={`stock-pill ${r.plan === 'trial' ? 'blue' : 'violet'}`}>
                        {planLabels[r.plan] || r.plan}
                      </span>
                    </td>
                    <td>
                      <span className={`stock-pill ${statusColors[r.status]}`}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                      {r.approved_at && (
                        <div style={{fontSize:10, color:'var(--muted)', marginTop:2}}>
                          {new Date(r.approved_at).toLocaleDateString('en-KE')}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.status === 'pending' ? (
                        <div className="row-actions">
                          <button 
                            className="btn-edit" 
                            style={{color:'var(--green)', borderColor:'var(--green)'}} 
                            onClick={() => onApprove(r)}
                            title="Approve and create store"
                          >
                            ✓ Approve
                          </button>
                          <button 
                            className="btn-delete" 
                            onClick={() => onReject(r)}
                            title="Reject request"
                          >
                            ✗ Reject
                          </button>
                        </div>
                      ) : (
                        <div style={{fontSize:11, color:'var(--muted)'}}>
                          {r.admin_notes && (
                            <div style={{maxWidth:200, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}} title={r.admin_notes}>
                              {r.admin_notes}
                            </div>
                          )}
                          {r.store_id && r.status === 'approved' && (
                            <div style={{color:'var(--green)', fontWeight:600, marginTop:2}}>
                              Store created
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination {...pg} />
          </>
        )}
      </article>

      {pg.slice.filter(r => r.notes).length > 0 && (
        <article className="card" style={{marginTop:20}}>
          <h3>Customer Notes</h3>
          {pg.slice.filter(r => r.notes).map(r => (
            <div key={r.id} style={{padding:'12px 0', borderBottom:'1px solid var(--line)'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                <b>{r.business_name}</b>
                <span style={{fontSize:11, color:'var(--muted)'}}>
                  {new Date(r.created_at).toLocaleDateString('en-KE')}
                </span>
              </div>
              <p style={{margin:0, fontSize:14, color:'var(--muted)', lineHeight:1.5}}>{r.notes}</p>
            </div>
          ))}
        </article>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   ADMIN PENDING PAYMENTS TAB
───────────────────────────────────────────────────────────── */
function AdminPendingPaymentsTab({ pendingPayments, onApprove, onReject, fmt }) {
  const pg = usePagination(pendingPayments, 20);

  const planLabels = {
    monthly_basic: 'Monthly Basic', monthly_premium: 'Monthly Premium',
    yearly_basic: 'Yearly Basic', yearly_premium: 'Yearly Premium', trial: 'Trial',
  };

  return (
    <section className="view">
      <div className="metrics" style={{marginBottom: 20}}>
        <Metric label="Pending Requests" value={pendingPayments.length} note="Awaiting approval" accent="amber" />
      </div>

      {!pendingPayments.length ? (
        <article className="card">
          <div style={{padding: '40px 20px', textAlign: 'center', color: 'var(--muted)'}}>
            <div style={{fontSize: 40, marginBottom: 12}}>✅</div>
            <p style={{fontSize: 16, fontWeight: 600}}>All clear!</p>
            <p style={{fontSize: 13, marginTop: 6}}>No pending payment requests at the moment.</p>
          </div>
        </article>
      ) : (
        <article className="card table">
          <h3 style={{marginBottom: 14}}>Payment Approval Queue</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Store</th>
                <th>Requested by</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>M-Pesa Code</th>
                <th>Period</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.slice.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.requested_at).toLocaleDateString('en-KE')}</td>
                  <td><b>{p.store_name}</b></td>
                  <td>{p.requested_by_name || '—'}</td>
                  <td><span className="stock-pill blue">{planLabels[p.plan] || p.plan}</span></td>
                  <td><b>{fmt(p.amount)}</b></td>
                  <td>
                    <code style={{fontSize: 12, letterSpacing: 1, background:'var(--violet-lt)', color:'var(--violet)', padding:'3px 8px', borderRadius:5}}>
                      {p.mpesa_code}
                    </code>
                  </td>
                  <td style={{fontSize: 11, color: 'var(--muted)'}}>
                    {new Date(p.starts_at).toLocaleDateString('en-KE', {month:'short', day:'numeric'})}
                    {' → '}
                    {new Date(p.ends_at).toLocaleDateString('en-KE', {month:'short', day:'numeric'})}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-edit" style={{color:'var(--green)', borderColor:'var(--green)'}} onClick={() => onApprove(p)}>
                        ✓ Approve
                      </button>
                      <button className="btn-delete" onClick={() => onReject(p)}>
                        ✗ Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination {...pg} />
        </article>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   PAYMENT CONFIG MODAL (Admin only)
───────────────────────────────────────────────────────────── */
function PaymentConfigModal({ currentConfig, onSave, onClose, notify }) {
  const [mpesaType, setMpesaType] = useState(currentConfig?.mpesa_type || 'paybill');
  const [mpesaNumber, setMpesaNumber] = useState(currentConfig?.mpesa_number || '');
  const [accountNumber, setAccountNumber] = useState(currentConfig?.account_number || '');
  const [businessName, setBusinessName] = useState(currentConfig?.business_name || '');
  const [instructions, setInstructions] = useState(currentConfig?.instructions || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!mpesaNumber.trim()) { notify('Please enter the M-Pesa number.'); return; }
    if (mpesaType === 'paybill' && !accountNumber.trim()) { notify('Please enter an account number for Paybill.'); return; }
    setLoading(true);
    await onSave({ mpesaType, mpesaNumber: mpesaNumber.trim(), accountNumber: mpesaType === 'paybill' ? accountNumber.trim() : null, businessName: businessName.trim(), instructions: instructions.trim() });
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2>⚙ Payment Settings</h2>
        <p style={{color:'var(--muted)', marginBottom:20, fontSize:13}}>
          This is the M-Pesa payment info managers will see when renewing their subscription.
        </p>

        <div className="payment-section">
          <label>Payment Type</label>
          <select value={mpesaType} onChange={e => setMpesaType(e.target.value)}>
            <option value="till">Till Number (Buy Goods)</option>
            <option value="paybill">Paybill</option>
          </select>

          <label>{mpesaType === 'paybill' ? 'Paybill Number' : 'Till Number'}</label>
          <input
            type="text"
            placeholder={mpesaType === 'paybill' ? 'e.g. 522533' : 'e.g. 123456'}
            value={mpesaNumber}
            onChange={e => setMpesaNumber(e.target.value)}
          />

          {mpesaType === 'paybill' && (
            <>
              <label>Account Number</label>
              <input
                type="text"
                placeholder="e.g. VYRPOS or leave blank"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
              />
              <small>Managers will enter this as the account number when paying via Paybill</small>
            </>
          )}

          <label>Business Name <span style={{color:'var(--muted)', fontWeight:400}}>(optional)</span></label>
          <input
            type="text"
            placeholder="e.g. Vyro POS Ltd"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
          />

          <label>Additional Instructions <span style={{color:'var(--muted)', fontWeight:400}}>(optional)</span></label>
          <textarea
            rows={3}
            placeholder="e.g. Use your store name as the reference"
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            style={{width:'100%', padding:'12px 14px', borderRadius: 8, border:'1px solid var(--line)', background:'var(--white)', fontFamily:'inherit', fontSize:14, resize:'vertical'}}
          />
        </div>

        <div className="modal-actions">
          <button onClick={onClose} disabled={loading}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
