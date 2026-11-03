import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

// ── Helper ───────────────────────────────────────────────────
async function rpc(fn, params = {}) {
  if (!supabase) return { data: null, error: 'No connection' };
  const { data, error } = await supabase.rpc(fn, params);
  if (error) console.warn(`RPC ${fn} error:`, error.message);
  return { data, error: error?.message || null };
}

// ── Session context (sets RLS vars for store-scoped queries) ──
export async function setSessionContext(storeId, role) {
  if (!supabase) return;
  await supabase.rpc('set_session_context', { store: storeId || '', role: role || '' });
}

// ── Login ────────────────────────────────────────────────────
export async function loginUser(email, password) {
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase
    .rpc('pos_login', { p_email: email.trim().toLowerCase(), p_password: password })
    .single();

  if (error) return { error: 'Invalid email or password.' };
  if (!data)  return { error: 'Invalid email or password.' };
  if (!data.active) return { error: 'This account has been deactivated. Contact your administrator.' };

  const user = {
    id:        data.id,
    store_id:  data.store_id,
    name:      data.name,
    role:      data.role,
    active:    data.active,
    last_login:data.last_login,
    subscription_plan:    data.subscription_plan,
    subscription_status:  data.subscription_status,
    subscription_ends_at: data.subscription_ends_at,
    cashier_limit:        data.cashier_limit,
    days_remaining:       data.days_remaining,
    stores: data.store_name ? {
      name:          data.store_name,
      address:       data.store_address,
      phone:         data.store_phone,
      currency:      data.store_currency,
      tax_rate:      data.store_tax_rate,
      loyalty_rate:  data.store_loyalty_rate,
      loyalty_redeem:data.store_loyalty_redeem,
      status:        data.store_status,
    } : null,
  };

  if (user.stores?.status === 'suspended') {
    return { error: 'This store has been suspended. Contact your administrator.' };
  }

  logActivity(data.store_id, data.id, data.name, data.role, 'login', 'Logged in');
  supabase.from('pos_users').update({ last_login: new Date().toISOString() }).eq('id', data.id);

  return { user };
}

// ── Activity logging ─────────────────────────────────────────
export async function logActivity(storeId, userId, userName, role, action, detail = '') {
  if (!supabase) return;
  await supabase.rpc('log_activity', {
    p_store_id: storeId || null,
    p_user_id:  userId  || null,
    p_user_name: userName || '',
    p_role:     role    || '',
    p_action:   action  || '',
    p_detail:   detail  || '',
  });
}

// ── Stores (admin) ───────────────────────────────────────────
export async function fetchAllStores() {
  const { data } = await rpc('get_all_stores_with_subscriptions');
  return data || [];
}

export async function createStore(store) {
  const { data, error } = await rpc('admin_create_store', {
    p_name:          store.name,
    p_address:       store.address  || null,
    p_phone:         store.phone    || null,
    p_currency:      store.currency || 'KSh',
    p_tax_rate:      store.tax_rate || 16,
    p_business_type: store.business_type || 'retail',
  });
  // data is the new store UUID
  return { data: data ? { id: data } : null, error };
}

export async function updateStore(id, updates) {
  if (!supabase) return { error: 'No connection' };
  console.log('📝 Updating store:', id, updates);
  const { data, error } = await supabase.from('stores').update(updates).eq('id', id).select();
  if (error) {
    console.error('❌ Update store error:', error);
    return { error: error.message };
  }
  console.log('✅ Store updated:', data);
  return { data, error: null };
}

export async function suspendStore(id, suspended) {
  await rpc('admin_set_store_status', { p_store_id: id, p_status: suspended ? 'suspended' : 'active' });
}

// ── Users (admin) ────────────────────────────────────────────
export async function fetchAllUsers() {
  const { data } = await rpc('admin_get_users_with_pins');
  return (data || []).map(u => ({ ...u, stores: u.store_name ? { name: u.store_name } : null }));
}

export async function resetUserPin(userId, newPin) {
  const { error } = await rpc('admin_reset_pin', { p_user_id: userId, p_new_pin: newPin });
  return error;
}

export async function resetUserPassword(userId, newPassword) {
  const { error } = await rpc('admin_reset_password', { p_user_id: userId, p_new_password: newPassword });
  return error?.message || null;
}

export async function fetchStoreUsers(storeId) {
  if (!supabase || !storeId) return [];
  const { data } = await supabase.from('pos_users').select('*').eq('store_id', storeId).order('created_at');
  return data || [];
}

export async function createUser(user) {
  const { data, error } = await rpc('admin_create_user', {
    p_store_id: user.store_id || null,
    p_name:     user.name,
    p_email:    user.email,
    p_password: user.password,
    p_role:     user.role || 'cashier',
  });
  return { data, error };
}

export async function updateUser(id, updates) {
  if (!supabase) return;
  await supabase.from('pos_users').update(updates).eq('id', id);
}

export async function dismissUser(id) {
  await rpc('admin_set_user_active', { p_user_id: id, p_active: false });
}

export async function reinstateUser(id) {
  await rpc('admin_set_user_active', { p_user_id: id, p_active: true });
}

export async function deleteUser(id) {
  if (!supabase) return { error: 'No connection' };
  const { error } = await supabase.rpc('admin_delete_user', { p_user_id: id });
  return { error: error?.message || null };
}

export async function adminUpdateUserEmail(userId, email) {
  const { error } = await rpc('admin_update_user_email', { p_user_id: userId, p_email: email });
  return error;
}

export async function userUpdateCredentials(userId, { email, password }) {
  const { error } = await rpc('user_update_credentials', {
    p_user_id:  userId,
    p_email:    email    || null,
    p_password: password || null,
  });
  return error;
}

// ── Activity log ─────────────────────────────────────────────
export async function fetchActivityLog(storeId = null, limit = 500) {
  const { data } = await rpc('admin_get_activity', {
    p_store_id: storeId || null,
    p_limit:    limit,
  });
  return data || [];
}

export async function deleteLogEntry(id) {
  await rpc('admin_delete_log', { p_id: id });
}

export async function clearActivityLog(storeId = null) {
  await rpc('admin_clear_log', { p_store_id: storeId || null });
}

// ── Sales (admin cross-store) ────────────────────────────────
export async function fetchAllSales() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sales')
    .select('*, stores(name)')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) console.warn('fetchAllSales error:', error.message);
  return data || [];
}

// ── Store data (used by managers/cashiers) ───────────────────
export async function fetchTable(table, storeId) {
  if (!supabase || !storeId) return [];
  const { data } = await supabase.from(table).select('*').eq('store_id', storeId).order('created_at', { ascending: false });
  return data || [];
}

export async function upsertRow(table, row) {
  if (!supabase) return null;
  const { error } = await supabase.from(table).upsert(row);
  if (error) console.warn(`upsert ${table}:`, error.message);
  return error?.message || null;
}

export async function deleteRow(table, id) {
  if (!supabase) return;
  await supabase.from(table).delete().eq('id', id);
}

export async function saveProduct(product) {
  if (!supabase) return;
  const { id, ...rest } = product;
  if (id) {
    await supabase.from('products').update(rest).eq('id', id);
  } else {
    await supabase.from('products').insert(rest);
  }
}

export async function saveSale(sale) {
  if (!supabase) return;
  await supabase.from('sales').insert(sale);
}

export async function fetchSales(storeId) {
  if (!supabase) return [];
  const { data } = await supabase.from('sales').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
  return data || [];
}

// ── Categories (store-scoped, bypass RLS) ────────────────────
export async function fetchCategories(storeId, module = 'retail') {
  const { data, error } = await supabase
    .from('categories')
    .select('name')
    .eq('store_id', storeId)
    .eq('module', module);
  
  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
  return (data || []).map(r => r.name);
}

export async function addCategory(storeId, name, module = 'retail') {
  const { error } = await supabase
    .from('categories')
    .insert({ store_id: storeId, name, module });
  
  return error;
}

export async function deleteCategory(storeId, name, module = 'retail') {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('store_id', storeId)
    .eq('name', name)
    .eq('module', module);
  
  return error;
}

// ── Subscription Management ──────────────────────────────────
export async function getSubscriptionStats() {
  const { data } = await rpc('get_subscription_stats');
  return data || {};
}

export async function getSubscriptionPlans() {
  const { data } = await rpc('get_subscription_plans');
  return data?.plans || [];
}

export async function getPaymentConfig() {
  const { data } = await rpc('get_payment_config');
  return data || null;
}

export async function updatePaymentConfig(mpesaType, mpesaNumber, accountNumber, businessName, instructions) {
  const { data, error } = await rpc('update_payment_config', {
    p_mpesa_type: mpesaType,
    p_mpesa_number: mpesaNumber,
    p_account_number: accountNumber || null,
    p_business_name: businessName || null,
    p_instructions: instructions || null,
  });
  if (error) console.error('updatePaymentConfig error:', error);
  return { data, error };
}

// Manager: Request subscription renewal
export async function requestSubscriptionRenewal(storeId, plan, amount, mpesaCode, userId) {
  const { data, error } = await rpc('request_subscription_renewal', {
    p_store_id: storeId,
    p_plan: plan,
    p_amount: amount,
    p_mpesa_code: mpesaCode,
    p_user_id: userId,
  });
  return { data, error };
}

// Admin: Get pending payment requests
export async function getPendingPayments() {
  const { data } = await rpc('get_pending_payments');
  return data || [];
}

// Admin: Approve payment request
export async function approvePayment(paymentId, approvedBy) {
  const { data, error } = await rpc('approve_subscription_payment', {
    p_payment_id: paymentId,
    p_approved_by: approvedBy,
  });
  return { data, error };
}

// Admin: Reject payment request
export async function rejectPayment(paymentId, approvedBy, reason) {
  const { data, error } = await rpc('reject_subscription_payment', {
    p_payment_id: paymentId,
    p_approved_by: approvedBy,
    p_reason: reason,
  });
  return { data, error };
}

// Legacy function - now creates pending payment for admin approval
export async function updateSubscription(storeId, plan, amount, paymentMethod, mpesaCode) {
  const { data, error } = await rpc('update_subscription', {
    p_store_id: storeId,
    p_plan: plan,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_mpesa_code: mpesaCode,
  });
  return { data, error };
}

export async function changeSubscriptionPlan(storeId, newPlan) {
  const { data, error } = await rpc('change_subscription_plan', {
    p_store_id: storeId,
    p_new_plan: newPlan,
  });
  return { data, error };
}

export async function cancelSubscription(storeId) {
  const { data, error } = await rpc('cancel_subscription', { p_store_id: storeId });
  return { data, error };
}

export async function reactivateSubscription(storeId) {
  const { data, error } = await rpc('reactivate_subscription', { p_store_id: storeId });
  return { data, error };
}

export async function getStorePaymentHistory(storeId) {
  const { data } = await rpc('get_store_payment_history', { p_store_id: storeId });
  return data || [];
}

export async function getAllPayments() {
  const { data } = await rpc('get_all_payments');
  return data || [];
}

export async function checkCashierLimit(storeId) {
  const { data } = await rpc('check_cashier_limit', { p_store_id: storeId });
  return data === true;
}

export async function checkExpiredSubscriptions() {
  await rpc('check_expired_subscriptions');
}


// ─── Subscription Requests ────────────────────────────────────
export async function fetchSubscriptionRequests() {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return [];
  }
  
  const { data, error } = await supabase
    .from('subscription_requests')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching subscription requests:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    return [];
  }
  
  console.log('✅ Fetched subscription requests:', data?.length || 0);
  return data || [];
}


// ══════════════════════════════════════════════════════════════
// RESTAURANT MODULE
// ══════════════════════════════════════════════════════════════

// ── Tables ────────────────────────────────────────────────────
export async function fetchTables(storeId) {
  console.log('📡 fetchTables called with storeId:', storeId);
  console.log('📡 supabase client exists?', !!supabase);
  
  if (!supabase) {
    console.error('❌ No Supabase connection!');
    return [];
  }
  
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('store_id', storeId)
    .order('section', { ascending: true })
    .order('table_number', { ascending: true });
  
  if (error) {
    console.error('❌ fetchTables error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
  } else {
    console.log('✅ fetchTables success! Rows:', data?.length);
    console.log('Data:', data);
  }
  
  return data || [];
}

// ── Restaurant Orders ─────────────────────────────────────────
export async function fetchRestaurantOrders(storeId, status = null) {
  if (!supabase) return [];
  let query = supabase
    .from('restaurant_orders')
    .select(`
      *,
      tables (table_number, table_name)
    `)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  
  if (status) query = query.eq('status', status);
  
  const { data, error } = await query;
  if (error) console.warn('fetchRestaurantOrders error:', error);
  return data || [];
}
export async function createRestaurantOrder(storeId, tableId, waiterId, guestCount = 1) {
  console.log('📞 Creating restaurant order with:', { storeId, tableId, waiterId, guestCount });
  
  if (!supabase) return { error: 'No connection' };
  
  // Direct insert instead of RPC (bypasses cache issues)
  try {
    // Generate order number
    const orderNumber = 'ORD' + new Date().toISOString().slice(0,10).replace(/-/g,'') + 
                        Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    console.log('📝 Generated order number:', orderNumber);
    
    // Insert order directly
    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .insert({
        store_id: storeId,
        table_id: tableId,
        waiter_id: waiterId,
        order_number: orderNumber,
        guest_count: guestCount,
        status: 'open'
      })
      .select()
      .single();
    
    if (orderError) {
      console.error('❌ Insert error:', orderError);
      return { error: orderError.message };
    }
    
    console.log('✅ Order created:', orderData);
    
    // Update table status
    if (tableId) {
      await supabase
        .from('tables')
        .update({ status: 'occupied', updated_at: new Date().toISOString() })
        .eq('id', tableId);
    }
    
    return { data: orderData.id, error: null };
  } catch (err) {
    console.error('❌ Exception:', err);
    return { error: err.message };
  }
}

export async function addRestaurantOrderItem(orderId, productId, quantity, notes = null, course = null, productData = null, taxRate = 16) {
  if (!supabase) return { error: 'No connection' };
  
  try {
    let price, name;

    if (productData) {
      // Use caller-provided product data — no extra round trip
      price = productData.price;
      name  = productData.name;
    } else {
      // Fallback: fetch product if data wasn't passed
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('id', productId)
        .single();
      if (productError || !product) return { error: 'Product not found' };
      price = product.price;
      name  = product.name;
    }

    const subtotal = price * quantity;
    
    // Insert item
    const { data: itemData, error: itemError } = await supabase
      .from('restaurant_order_items')
      .insert({
        order_id: orderId,
        product_id: productId,
        item_name: name,
        quantity,
        price,
        subtotal,
        notes,
        course,
        status: 'pending'
      })
      .select()
      .single();
    
    if (itemError) return { error: itemError.message };
    
    // Update order totals with the store's tax rate
    await updateOrderTotals(orderId, taxRate);
    
    return { data: itemData.id, error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// Helper to update order totals
async function updateOrderTotals(orderId, taxRate = 16) {
  if (!supabase) return;

  const { data: items } = await supabase
    .from('restaurant_order_items')
    .select('subtotal, status')
    .eq('order_id', orderId)
    .neq('status', 'cancelled');

  const subtotal = items?.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0) || 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  await supabase
    .from('restaurant_orders')
    .update({
      subtotal,
      tax,
      total: subtotal + tax,
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId);
}

export async function fetchRestaurantOrderItems(orderId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('restaurant_order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) console.warn('fetchRestaurantOrderItems error:', error);
  return data || [];
}

export async function sendOrderToKitchen(orderId) {
  if (!supabase) return { error: 'No connection' };
  const { error } = await rpc('send_order_to_kitchen', { p_order_id: orderId });
  return { error };
}

export async function updateOrderItemStatus(itemId, status) {
  if (!supabase) return { error: 'No connection' };
  const { error } = await rpc('update_order_item_status', {
    p_item_id: itemId,
    p_status: status
  });
  return { error };
}

export async function completeRestaurantOrder(orderId, paymentMethod, customerName = null, customerPhone = null) {
  if (!supabase) return { error: 'No connection' };
  const { error } = await rpc('complete_restaurant_order', {
    p_order_id: orderId,
    p_payment_method: paymentMethod
  });
  // Save customer info onto the order record so it's queryable later
  if (!error && (customerName || customerPhone)) {
    await supabase
      .from('restaurant_orders')
      .update({
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
      })
      .eq('id', orderId);
  }
  return { error };
}

export async function getKitchenOrders(storeId) {
  if (!supabase) return [];
  const { data, error } = await rpc('get_kitchen_orders', { p_store_id: storeId });
  if (error) console.warn('getKitchenOrders error:', error);
  return data || [];
}

export async function updateRestaurantOrder(orderId, updates) {
  if (!supabase) return { error: 'No connection' };
  const { data, error } = await supabase
    .from('restaurant_orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function deleteRestaurantOrderItem(itemId) {
  if (!supabase) return { error: 'No connection' };
  const { error } = await supabase
    .from('restaurant_order_items')
    .delete()
    .eq('id', itemId);
  return { error: error?.message || null };
}


// ══════════════════════════════════════════════════════════════
// TABLE MANAGEMENT
// ══════════════════════════════════════════════════════════════

export async function createTable(storeId, tableNumber, tableName, capacity, section = null) {
  if (!supabase) return { error: 'No connection' };
  
  const { data, error } = await supabase
    .from('tables')
    .insert({
      store_id: storeId,
      table_number: tableNumber,
      table_name: tableName,
      capacity: capacity,
      section: section,
      status: 'available'
    })
    .select()
    .single();
  
  if (error) {
    console.error('❌ Failed to create table:', error);
    return { error: error.message };
  }
  
  return { data, error: null };
}

export async function updateTable(tableId, updates) {
  if (!supabase) return { error: 'No connection' };
  const { data, error } = await supabase
    .from('tables')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', tableId)
    .select()
    .single();
  return { data, error: error?.message || null };
}

export async function updateTableInfo(tableId, updates) {
  if (!supabase) return { error: 'No connection' };
  
  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', tableId)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Failed to update table:', error);
    return { error: error.message };
  }
  
  return { data, error: null };
}

export async function deleteTable(tableId) {
  if (!supabase) return { error: 'No connection' };
  
  // Check if table has active orders
  const { data: activeOrders } = await supabase
    .from('restaurant_orders')
    .select('id')
    .eq('table_id', tableId)
    .in('status', ['open', 'preparing', 'ready', 'served']);
  
  if (activeOrders && activeOrders.length > 0) {
    return { error: 'Cannot delete table with active orders' };
  }
  
  const { error } = await supabase
    .from('tables')
    .delete()
    .eq('id', tableId);
  
  if (error) {
    console.error('❌ Failed to delete table:', error);
    return { error: error.message };
  }
  
  return { error: null };
}

// ── Room Bookings Module ─────────────────────────────────────

// Rooms
export async function fetchRooms(storeId, status = null) {
  let query = supabase
    .from('rooms')
    .select('*')
    .eq('store_id', storeId)
    .order('room_number');
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching rooms:', error);
    return [];
  }
  return data || [];
}

export async function createRoom(storeId, roomData) {
  console.log('🔧 createRoom called with:', { storeId, roomData });
  
  if (!storeId) {
    console.error('❌ No store ID provided');
    return { data: null, error: { message: 'Store ID is required' } };
  }
  
  const insertData = {
    store_id: storeId,
    room_number: roomData.roomNumber,
    room_name: roomData.roomName || null,
    room_type: roomData.roomType,
    floor: roomData.floor || null,
    capacity: roomData.capacity || 2,
    price_per_night: roomData.pricePerNight,
    description: roomData.description || null,
    amenities: roomData.amenities || [],
    status: 'available'
  };
  
  console.log('📤 Inserting data:', insertData);
  
  const { data, error } = await supabase
    .from('rooms')
    .insert(insertData)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Supabase error:', error);
  } else {
    console.log('✅ Room created:', data);
  }
  
  return { data, error };
}

export async function updateRoom(roomId, updates) {
  const { error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', roomId);
  
  return error;
}

export async function deleteRoom(roomId) {
  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', roomId);
  
  return error;
}

// Bookings
export async function fetchBookings(storeId, filters = {}) {
  let query = supabase
    .from('room_bookings')
    .select(`
      *,
      rooms (
        room_number,
        room_name,
        room_type
      )
    `)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  
  if (filters.status) {
    query = query.eq('booking_status', filters.status);
  }
  
  if (filters.dateFrom) {
    query = query.gte('check_in_date', filters.dateFrom);
  }
  
  if (filters.dateTo) {
    query = query.lte('check_out_date', filters.dateTo);
  }
  
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching bookings:', error);
    return [];
  }
  return data || [];
}

export async function checkRoomAvailability(roomId, checkInDate, checkOutDate, excludeBookingId = null) {
  const { data, error } = await rpc('check_room_availability', {
    p_room_id: roomId,
    p_check_in: checkInDate,
    p_check_out: checkOutDate,
    p_exclude_booking_id: excludeBookingId
  });
  
  if (error) {
    console.error('Error checking availability:', error);
    return false;
  }
  return data;
}

export async function createBooking(storeId, bookingData, userId, userName) {
  // Generate booking number
  const { data: bookingNumber } = await rpc('generate_booking_number');
  
  const { data, error } = await supabase
    .from('room_bookings')
    .insert({
      store_id: storeId,
      room_id: bookingData.roomId,
      booking_number: bookingNumber || `BK${Date.now()}`,
      guest_name: bookingData.guestName,
      guest_email: bookingData.guestEmail || null,
      guest_phone: bookingData.guestPhone,
      guest_id_number: bookingData.guestIdNumber || null,
      guest_address: bookingData.guestAddress || null,
      check_in_date: bookingData.checkInDate,
      check_out_date: bookingData.checkOutDate,
      adults: bookingData.adults || 1,
      children: bookingData.children || 0,
      room_rate: bookingData.roomRate,
      extras: bookingData.extras || 0,
      discount: bookingData.discount || 0,
      total: bookingData.total,
      deposit_paid: bookingData.depositPaid || 0,
      payment_method: bookingData.paymentMethod || null,
      payment_status: bookingData.depositPaid >= bookingData.total ? 'paid' : 
                      bookingData.depositPaid > 0 ? 'partial' : 'pending',
      booking_status: 'confirmed',
      special_requests: bookingData.specialRequests || null,
      notes: bookingData.notes || null,
      booked_by: userId,
      booked_by_name: userName
    })
    .select()
    .single();
  
  return { data, error };
}

export async function updateBooking(bookingId, updates) {
  const { error } = await supabase
    .from('room_bookings')
    .update(updates)
    .eq('id', bookingId);
  
  return error;
}

export async function checkInBooking(bookingId) {
  const { error } = await supabase
    .from('room_bookings')
    .update({
      booking_status: 'checked_in',
      checked_in_at: new Date().toISOString()
    })
    .eq('id', bookingId);
  
  return error;
}

export async function checkOutBooking(bookingId) {
  const { error } = await supabase
    .from('room_bookings')
    .update({
      booking_status: 'checked_out',
      checked_out_at: new Date().toISOString()
    })
    .eq('id', bookingId);
  
  return error;
}

export async function cancelBooking(bookingId, refundAmount = 0) {
  const { error } = await supabase
    .from('room_bookings')
    .update({
      booking_status: 'cancelled',
      payment_status: refundAmount > 0 ? 'refunded' : 'pending'
    })
    .eq('id', bookingId);
  
  return error;
}

// Booking Extras
export async function fetchBookingExtras(bookingId) {
  const { data, error } = await supabase
    .from('booking_extras')
    .select('*')
    .eq('booking_id', bookingId)
    .order('charged_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching booking extras:', error);
    return [];
  }
  return data || [];
}

export async function addBookingExtra(bookingId, extraData) {
  const { data, error } = await supabase
    .from('booking_extras')
    .insert({
      booking_id: bookingId,
      description: extraData.description,
      category: extraData.category || null,
      amount: extraData.amount,
      quantity: extraData.quantity || 1
    })
    .select()
    .single();
  
  return { data, error };
}

export async function deleteBookingExtra(extraId) {
  const { error } = await supabase
    .from('booking_extras')
    .delete()
    .eq('id', extraId);
  
  return error;
}

// Room Maintenance
export async function fetchRoomMaintenance(storeId, status = null) {
  let query = supabase
    .from('room_maintenance')
    .select(`
      *,
      rooms (
        room_number,
        room_name
      )
    `)
    .order('created_at', { ascending: false });
  
  // Filter by store through rooms relationship
  query = query.in('room_id', 
    supabase.from('rooms').select('id').eq('store_id', storeId)
  );
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching maintenance:', error);
    return [];
  }
  return data || [];
}

export async function createMaintenanceLog(roomId, maintenanceData, userId, userName) {
  const { data, error } = await supabase
    .from('room_maintenance')
    .insert({
      room_id: roomId,
      issue_type: maintenanceData.issueType,
      description: maintenanceData.description,
      priority: maintenanceData.priority || 'normal',
      status: 'pending',
      reported_by: userId,
      reported_by_name: userName,
      assigned_to: maintenanceData.assignedTo || null,
      notes: maintenanceData.notes || null
    })
    .select()
    .single();
  
  return { data, error };
}

export async function updateMaintenanceLog(maintenanceId, updates) {
  const { error } = await supabase
    .from('room_maintenance')
    .update(updates)
    .eq('id', maintenanceId);
  
  return error;
}

// ── M-Pesa Integration ───────────────────────────────────────

// Save M-Pesa credentials
export async function saveMpesaCredentials(storeId, consumerKey, consumerSecret, businessShortcode, accountType = 'till', passkey = null) {
  return await rpc('save_mpesa_credentials', {
    p_store_id: storeId,
    p_consumer_key: consumerKey,
    p_consumer_secret: consumerSecret,
    p_business_shortcode: businessShortcode,
    p_account_type: accountType,
    p_passkey: passkey
  });
}

// Get M-Pesa credentials
export async function getMpesaCredentials(storeId) {
  const { data, error } = await rpc('get_mpesa_credentials', { p_store_id: storeId });
  if (error) return { data: null, error };
  try {
    return { data: typeof data === 'string' ? JSON.parse(data) : data, error: null };
  } catch {
    return { data, error: null };
  }
}

// Get M-Pesa transactions
export async function getMpesaTransactions(storeId) {
  if (!supabase) return { data: [], error: 'No connection' };
  const { data, error } = await supabase
    .from('mpesa_transactions')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

// Get M-Pesa stats
export async function getMpesaStats(storeId) {
  const { data, error } = await rpc('get_mpesa_stats', { p_store_id: storeId });
  if (error) return { data: null, error };
  try {
    return { data: typeof data === 'string' ? JSON.parse(data) : data, error: null };
  } catch {
    return { data, error: null };
  }
}
