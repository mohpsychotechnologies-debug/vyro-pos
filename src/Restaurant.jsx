import React, { useState, useEffect } from 'react';
import {
  fetchTables,
  fetchRestaurantOrders,
  fetchRestaurantOrderItems,
  createRestaurantOrder,
  addRestaurantOrderItem,
  sendOrderToKitchen,
  completeRestaurantOrder,
  updateTable,
  updateRestaurantOrder,
  deleteRestaurantOrderItem,
  getKitchenOrders,
  updateOrderItemStatus,
  createTable,
  updateTableInfo,
  deleteTable,
  setSessionContext,
  supabase,
} from './supabase';
import { sendWhatsApp } from './whatsappUtils';
import { shareOrderReceiptPDF } from './receiptPDF';

// ══════════════════════════════════════════════════════════════
// RESTAURANT - Table Management & Orders
// ══════════════════════════════════════════════════════════════

export function Restaurant({ storeId, session, products, money, notify, categories = [], onAddCategory, onDeleteCategory, initialOrders = [], storeName = 'Restaurant', storePhone = '', taxRate = 16, onOrderComplete, loyaltySpend = 1000, customers = [] }) {
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState(initialOrders);
  const [selectedTable, setSelectedTable] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [view, setView] = useState('tables'); // 'tables' | 'order' | 'manage-tables'
  const [section, setSection] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showTableForm, setShowTableForm] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [completedReceipt, setCompletedReceipt] = useState(null);
  // Quick-pay: open payment modal directly from table card without entering order view
  const [quickPayOrder, setQuickPayOrder] = useState(null); // {order, items, table}

  useEffect(() => {
    // Always load tables fresh; only fetch orders if App didn't pre-load them
    loadTables();
    if (initialOrders.length === 0) {
      loadOrders();
    }
  }, [storeId]);

  async function loadTables() {
    setLoading(true);
    const data = await fetchTables(storeId);    setTables(data);
    setLoading(false);
  }

  async function loadOrders() {
    const data = await fetchRestaurantOrders(storeId);
    setOrders(data);
  }

  async function handleTableClick(table) {
    setSelectedTable(table);
    
    // Check if table has ANY active order (open, sent to kitchen, or preparing)
    const existingOrder = orders.find(
      o => o.table_id === table.id && !['completed', 'cancelled', 'paid'].includes(o.status || o.order_status)
    );
    
    if (existingOrder) {
      setCurrentOrder(existingOrder);
      const items = await fetchRestaurantOrderItems(existingOrder.id);
      setOrderItems(items);
    } else {
      const { data, error } = await createRestaurantOrder(storeId, table.id, session.id, 1);
      
      if (error) {
        notify('Failed to create order: ' + error);
        return;
      }
      
      // Set table status to occupied
      await updateTable(table.id, { status: 'occupied' });
      await loadTables();
      
      setCurrentOrder({ id: data, table_id: table.id, status: 'open', subtotal: 0, total: 0 });
      setOrderItems([]);
    }
    
    setView('order');
  }

  async function handleAddItem(product, quantity = 1, notes = '') {
    if (!currentOrder) return;
    
    const { error } = await addRestaurantOrderItem(currentOrder.id, product.id, quantity, notes || null, null, product, taxRate);
    
    if (error) {
      notify('Failed to add item');
      return;
    }
    
    // Reload order items
    const items = await fetchRestaurantOrderItems(currentOrder.id);
    setOrderItems(items);
    
    // Fetch fresh order data with updated totals
    const { data: freshOrders } = await supabase
      .from('restaurant_orders')
      .select('*')
      .eq('id', currentOrder.id)
      .single();
    
    if (freshOrders) {
      console.log('📊 Updated order totals:', freshOrders);
      setCurrentOrder(freshOrders);
    }
    
    // Also reload all orders for table display
    await loadOrders();
    
    notify(`✓ ${product.name} added`);
    playBeep();
  }

  async function handleSendToKitchen() {
    if (!currentOrder || orderItems.length === 0) {
      notify('Add items before sending to kitchen');
      return;
    }
    
    const { error } = await sendOrderToKitchen(currentOrder.id);
    
    if (error) {
      notify('Failed to send order to kitchen');
      return;
    }

    // Immediately update the order status in local state so the badge refreshes
    // (Realtime will also fire, but this makes it instant)
    if (onOrderComplete) {
      // Reuse the refresh mechanism — just pass a sentinel that triggers a fetch
      fetchRestaurantOrders(storeId).then(fresh => {
        if (fresh) onOrderComplete({ orderId: null, _refresh: true, _fresh: fresh });
      }).catch(() => {});
    }
    
    notify('✓ Order sent to kitchen');
    setView('tables');
    setSelectedTable(null);
    setCurrentOrder(null);
    setOrderItems([]);
    loadTables();
    loadOrders();
  }

  async function handleQuickPay(table, order) {
    // Load items and open payment modal directly — no need to enter order view
    const items = await fetchRestaurantOrderItems(order.id);
    setQuickPayOrder({ table, order, items });
  }

  async function handleCompleteOrder(paymentMethod, customerPhone = '', customerName = '', overrideOrder = null, overrideItems = null, overrideTable = null) {
    const orderToComplete = overrideOrder || currentOrder;
    const itemsToReceipt  = overrideItems  || orderItems;
    const tableToReceipt  = overrideTable  || selectedTable;

    if (!orderToComplete) return;

    const { error } = await completeRestaurantOrder(orderToComplete.id, paymentMethod, customerName, customerPhone);

    if (error) {
      notify('Failed to complete order');
      return;
    }

    if (tableToReceipt) {
      await updateTable(tableToReceipt.id, { status: 'available' });
    }

    if (onOrderComplete) {
      const pointsEarned = Math.floor((orderToComplete.total || 0) / loyaltySpend);
      onOrderComplete({ customerPhone, customerName, orderId: orderToComplete.id, pointsEarned });
    }

    setCompletedReceipt({
      order: { ...orderToComplete, payment_method: paymentMethod, status: 'completed' },
      items: itemsToReceipt,
      table: tableToReceipt,
      paymentMethod,
      customerPhone,
      customerName,
    });

    setQuickPayOrder(null);

    // Only clear order view state if we came from the order view
    if (!overrideOrder) {
      setView('tables');
      setSelectedTable(null);
      setCurrentOrder(null);
      setOrderItems([]);
    }

    loadTables();
    loadOrders();
  }

  async function handleRemoveItem(itemId) {
    const { error } = await deleteRestaurantOrderItem(itemId);
    if (error) {
      notify('Failed to remove item');
      return;
    }
    
    const items = await fetchRestaurantOrderItems(currentOrder.id);
    setOrderItems(items);
    await loadOrders();
    notify('Item removed');
  }

  async function handleCleanTable(tableId) {
    // Cancel any lingering active orders on this table before marking available
    const activeOrder = orders.find(
      o => o.table_id === tableId && !['completed', 'cancelled', 'paid'].includes(o.status || o.order_status)
    );
    if (activeOrder) {
      await supabase
        .from('restaurant_orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', activeOrder.id);
    }

    const { error } = await updateTable(tableId, { status: 'available' });
    if (error) {
      notify('Failed to update table');
      return;
    }
    await loadOrders();
    loadTables();
    notify('Table marked as clean');
  }

  // ══════════════════════════════════════════════════════════════
  // TABLE MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async function handleSaveTable(formData) {
    if (editingTable) {
      // Update existing table
      const { error } = await updateTableInfo(editingTable.id, {
        table_number: formData.tableNumber,
        table_name: formData.tableName,
        capacity: parseInt(formData.capacity),
        section: formData.section || null,
      });
      
      if (error) {
        notify('Failed to update table: ' + error);
        return;
      }
      
      notify('✓ Table updated');
    } else {
      // Create new table
      const { error } = await createTable(
        storeId,
        formData.tableNumber,
        formData.tableName,
        parseInt(formData.capacity),
        formData.section || null
      );
      
      if (error) {
        notify('Failed to create table: ' + error);
        return;
      }
      
      notify('✓ Table created');
    }
    
    setShowTableForm(false);
    setEditingTable(null);
    loadTables();
  }

  async function handleDeleteTable(tableId) {
    if (!confirm('Delete this table? This cannot be undone.')) return;
    
    const { error } = await deleteTable(tableId);
    
    if (error) {
      notify('Failed to delete table: ' + error);
      return;
    }
    
    notify('✓ Table deleted');
    loadTables();
  }

  async function handleChangeTableStatus(tableId, newStatus) {
    // If marking available, cancel any active order on this table
    if (newStatus === 'available') {
      const activeOrder = orders.find(
        o => o.table_id === tableId && !['completed', 'cancelled', 'paid'].includes(o.status || o.order_status)
      );
      if (activeOrder) {
        await supabase
          .from('restaurant_orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', activeOrder.id);
        await loadOrders();
      }
    }

    const { error } = await updateTable(tableId, { status: newStatus });
    if (error) {
      notify('Failed to update table status');
      return;
    }
    
    notify('✓ Table status updated');
    loadTables();
  }

  const sections = ['all', ...new Set(tables.map(t => t.section))];
  const filteredTables = section === 'all' ? tables : tables.filter(t => t.section === section);

  const statusColors = {
    available: '#22c55e',
    occupied: '#f04f44',
    reserved: '#f59e0b',
    dirty: '#9ca3af',
  };

  const statusIcons = {
    available: '🟢',
    occupied: '🔴',
    reserved: '🟡',
    dirty: '⚪',
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading tables…</p></div>;
  }

  return (
    <div className="restaurant-container">
      {view === 'tables' && (
        <>
          <div className="restaurant-header">
            <h2>Tables</h2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Store ID: {storeId?.substring(0, 8)}...
              </span>
              {(session?.role === 'manager') && (
                <button className="secondary" onClick={() => setView('manage-tables')}>
                  ⚙️ Manage Tables
                </button>
              )}
              <button className="primary" onClick={loadTables}>🔄 Refresh</button>
            </div>
          </div>

          <div className="section-tabs">
            {sections.map(s => (
              <button
                key={s}
                className={`section-tab ${section === s ? 'active' : ''}`}
                onClick={() => setSection(s)}
              >
                {s === 'all' ? 'All Sections' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {filteredTables.length === 0 && (
            <div className="empty-state">
              <p style={{ fontSize: 48 }}>🍽️</p>
              <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No tables found</p>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
                Tables may need to be added to the database
              </p>
              <details style={{ textAlign: 'left', maxWidth: 500, margin: '0 auto', padding: 16, background: 'var(--card-bg)', borderRadius: 8 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>
                  📋 How to add tables
                </summary>
                <ol style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
                  <li>Go to Supabase Dashboard → SQL Editor</li>
                  <li>Copy contents of <code>supabase/add_sample_tables.sql</code></li>
                  <li>Paste and run the SQL</li>
                  <li>Click the Refresh button above</li>
                </ol>
                <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
                  Or check browser console (F12) for error messages
                </p>
              </details>
            </div>
          )}

          <div className="tables-grid">
            {filteredTables.map(table => {
              const tableOrder = orders.find(o => o.table_id === table.id && !['completed','cancelled'].includes(o.status));
              const isReady = tableOrder && (tableOrder.status === 'ready' || tableOrder.status === 'served');
              
              return (
                <div
                  key={table.id}
                  className={`table-card table-${table.status}${isReady ? ' table-ready-to-pay' : ''}`}
                  onClick={() => table.status !== 'reserved' && handleTableClick(table)}
                  style={{ cursor: table.status === 'reserved' ? 'not-allowed' : 'pointer' }}
                >
                  <div className="table-number">{table.table_number}</div>
                  <div className="table-status" style={{ color: statusColors[table.status] }}>
                    {statusIcons[table.status]} {table.status}
                  </div>
                  <div className="table-capacity">👥 {table.capacity} seats</div>
                  {tableOrder && (
                    <div className="table-amount">{money(tableOrder.total || 0)}</div>
                  )}
                  {isReady && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                      🍽 Food ready!
                    </div>
                  )}
                  {/* Quick pay button — visible on any occupied table with an order */}
                  {tableOrder && !['completed','cancelled'].includes(tableOrder.status) && (
                    <button
                      className="btn-quick-pay"
                      onClick={e => { e.stopPropagation(); handleQuickPay(table, tableOrder); }}
                    >
                      💳 Pay
                    </button>
                  )}
                  {table.status === 'dirty' && (
                    <button
                      className="btn-clean-table"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCleanTable(table.id);
                      }}
                    >
                      Clean
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === 'order' && selectedTable && (
        <OrderView
          table={selectedTable}
          order={currentOrder}
          items={orderItems}
          products={products}
          money={money}
          taxRate={taxRate}
          loyaltySpend={loyaltySpend}
          customers={customers}
          onAddItem={handleAddItem}
          onRemoveItem={handleRemoveItem}
          onSendToKitchen={handleSendToKitchen}
          onCompleteOrder={handleCompleteOrder}
          onBack={() => {
            setView('tables');
            setSelectedTable(null);
            setCurrentOrder(null);
            setOrderItems([]);
          }}
        />
      )}

      {view === 'manage-tables' && (
        <ManageTablesView
          tables={tables}
          showForm={showTableForm}
          editingTable={editingTable}
          onShowForm={() => {
            setEditingTable(null);
            setShowTableForm(true);
          }}
          onEditTable={(table) => {
            setEditingTable(table);
            setShowTableForm(true);
          }}
          onSaveTable={handleSaveTable}
          onDeleteTable={handleDeleteTable}
          onChangeStatus={handleChangeTableStatus}
          onCloseForm={() => {
            setShowTableForm(false);
            setEditingTable(null);
          }}
          onBack={() => setView('tables')}
        />
      )}

      {/* Quick-pay modal — opened directly from table card */}
      {quickPayOrder && (
        <QuickPayModal
          table={quickPayOrder.table}
          order={quickPayOrder.order}
          items={quickPayOrder.items}
          money={money}
          taxRate={taxRate}
          loyaltySpend={loyaltySpend}
          customers={customers}
          onComplete={(paymentMethod, customerPhone, customerName) =>
            handleCompleteOrder(paymentMethod, customerPhone, customerName, quickPayOrder.order, quickPayOrder.items, quickPayOrder.table)
          }
          onClose={() => setQuickPayOrder(null)}
        />
      )}

      {/* Order Receipt Modal — shown after successful payment */}
      {completedReceipt && (
        <OrderReceiptModal
          receipt={completedReceipt}
          money={money}
          storeName={storeName}
          storePhone={storePhone}
          taxRate={taxRate}
          onClose={() => setCompletedReceipt(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ORDER VIEW
// ══════════════════════════════════════════════════════════════

function OrderView({ table, order, items, products, money, taxRate = 16, loyaltySpend = 1000, customers = [], onAddItem, onRemoveItem, onSendToKitchen, onCompleteOrder, onBack }) {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('M-Pesa');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [itemNotes, setItemNotes] = useState({});

  const total = order?.total || 0;
  const pointsEarned = Math.floor(total / loyaltySpend);

  // Look up existing customer by phone as they type
  const matchedCustomer = customerPhone.length >= 9
    ? customers.find(c => (c.phone || '').replace(/\D/g,'').endsWith(customerPhone.replace(/\D/g,'').slice(-9)))
    : null;

  // Auto-fill name from existing customer
  const handlePhoneChange = (val) => {
    setCustomerPhone(val);
    const match = customers.find(c => (c.phone || '').replace(/\D/g,'').endsWith(val.replace(/\D/g,'').slice(-9)));
    if (match && !customerName) setCustomerName(match.name);
  };

  const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
  const filtered = products.filter(p =>
    (category === 'All' || p.category === category) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || (p.brand || '').toLowerCase().includes(search.toLowerCase()))
  );

  const canSendToKitchen = items.length > 0 && items.some(i => i.status === 'pending');
  // Allow completing payment at any point once there are items — don't require kitchen to mark ready
  const canComplete = order && items.length > 0 && !['completed','cancelled'].includes(order.status);

  return (
    <div className="order-view">
      <div className="order-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div>
          <h2>Table {table?.table_number ?? '—'}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Order #{order?.order_number || 'New'}
          </p>
        </div>
        <div className="order-header-actions">
          {canSendToKitchen && (
            <button className="primary" onClick={onSendToKitchen}>
              Send to Kitchen 👨‍🍳
            </button>
          )}
          {canComplete && (
            <button className="btn-complete" onClick={() => setShowPayment(true)}>
              Complete Order 💳
            </button>
          )}
        </div>
      </div>

      <div className="order-content">
        {/* Left: Menu */}
        <div className="order-menu">
          <div className="menu-filters">
            <input
              type="text"
              className="search"
              placeholder="Search menu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="category-pills">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`pill ${category === cat ? 'active' : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="menu-items">
            {filtered.map(product => (
              <div key={product.id} className="menu-item" onClick={() => onAddItem(product)}>
                <div className="menu-item-icon">{product.icon || '🍽️'}</div>
                <div className="menu-item-info">
                  <div className="menu-item-name">{product.name}</div>
                  {product.brand && <div className="menu-item-brand">{product.brand}</div>}
                  <div className="menu-item-price">{money(product.price)}</div>
                </div>
                {(product.stock !== undefined && product.stock <= 0) && (
                  <div className="menu-item-badge">Out of stock</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Order Items */}
        <div className="order-items">
          <h3>Order Items ({items.length})</h3>
          
          {items.length === 0 && (
            <div className="empty-state">
              <p>No items added yet</p>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Select items from the menu</p>
            </div>
          )}

          <div className="order-items-list">
            {items.map(item => (
              <div key={item.id} className="order-item">
                <div className="order-item-main">
                  <div>
                    <div className="order-item-name">
                      {item.quantity}× {item.item_name}
                    </div>
                    {item.notes && (
                      <div className="order-item-notes">📝 {item.notes}</div>
                    )}
                    <div className="order-item-status">
                      Status: <span className={`status-badge status-${item.status}`}>{item.status}</span>
                    </div>
                  </div>
                  <div className="order-item-price">{money(item.subtotal)}</div>
                </div>
                {item.status === 'pending' && (
                  <button
                    className="btn-remove-item"
                    onClick={() => onRemoveItem(item.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="order-totals">
            <div className="total-row">
              <span>Subtotal</span>
              <span>{money(order?.subtotal || 0)}</span>
            </div>
            <div className="total-row">
              <span>Tax ({taxRate}%)</span>
              <span>{money(order?.tax || 0)}</span>
            </div>
            <div className="total-row grand">
              <span>Total</span>
              <span>{money(order?.total || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal — simplified */}
      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💳 Checkout — Table {table?.table_number ?? '—'}</h3>
              <button onClick={() => setShowPayment(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Total — prominent */}
              <div style={{ background: 'var(--violet-lt)', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Total to pay</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--violet)', lineHeight: 1 }}>
                  {money(order?.total || 0)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  {money(order?.subtotal || 0)} + {taxRate}% tax
                </div>
              </div>

              {/* Payment method — big tap buttons */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Payment Method
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { id: 'M-Pesa', icon: '📱', color: '#00A86B' },
                    { id: 'Cash',   icon: '💵', color: '#f59e0b' },
                    { id: 'Card',   icon: '💳', color: '#3b82f6' },
                    { id: 'Room Charge', icon: '🏨', color: '#8b5cf6' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setPaymentMethod(m.id)}
                      style={{
                        padding: '12px 8px',
                        borderRadius: 10,
                        border: `2px solid ${paymentMethod === m.id ? m.color : 'var(--line)'}`,
                        background: paymentMethod === m.id ? m.color + '18' : 'var(--wash)',
                        color: paymentMethod === m.id ? m.color : 'var(--muted)',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all .15s',
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{m.icon}</span>
                      {m.id}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer — compact two-column */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-field">
                  <label>Customer name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Optional"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Phone {matchedCustomer ? <span style={{color:'var(--green)',fontWeight:600}}>✓ {matchedCustomer.name}</span> : ''}</label>
                  <input
                    type="tel"
                    className="input"
                    placeholder="For receipt & points"
                    value={customerPhone}
                    onChange={e => handlePhoneChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Loyalty points earned */}
              {pointsEarned > 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🎁</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#065f46', fontSize: 13 }}>+{pointsEarned} loyalty points</div>
                    <div style={{ color: '#059669', fontSize: 11 }}>
                      {matchedCustomer
                        ? `${matchedCustomer.name} will have ${(matchedCustomer.points || 0) + pointsEarned} points`
                        : `Enter phone to save points`}
                    </div>
                  </div>
                </div>
              )}

            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowPayment(false)}>Cancel</button>
              <button
                className="primary"
                style={{ flex: 1, fontSize: 15, padding: '13px' }}
                onClick={() => {
                  onCompleteOrder(paymentMethod, customerPhone, customerName);
                  setShowPayment(false);
                }}
              >
                ✓ Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// KITCHEN DISPLAY
// ══════════════════════════════════════════════════════════════

export function KitchenDisplay({ storeId, session, notify }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;

    // Set session context once on mount so RLS works, then load
    setSessionContext(storeId, session?.role || 'cashier').catch(() => {});
    loadOrders();

    // Use Supabase Realtime to react to new/updated order items instantly
    if (!supabase) return;
    const channel = supabase
      .channel(`kitchen-${storeId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restaurant_order_items',
      }, () => {
        loadOrders();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restaurant_orders',
      }, () => {
        loadOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId]);

  async function loadOrders() {
    const data = await getKitchenOrders(storeId);
    setOrders(data);
    setLoading(false);
  }

  async function handleUpdateStatus(itemId, status) {
    const { error } = await updateOrderItemStatus(itemId, status);
    if (error) {
      notify('Failed to update status');
      return;
    }
    loadOrders();
    if (status === 'ready') {
      playBeep();
    }
  }

  async function handleMarkAllReady(orderId) {
    // Mark all non-ready items on this order as ready
    const orderItems = orders.filter(i => i.order_id === orderId && i.status !== 'ready');
    for (const item of orderItems) {
      await updateOrderItemStatus(item.item_id, 'ready');
    }
    playBeep();
    loadOrders();
  }

  async function handleMarkServed(orderId) {
    // Mark all items as served — order goes back to restaurant for payment
    const orderItems = orders.filter(i => i.order_id === orderId);
    for (const item of orderItems) {
      await updateOrderItemStatus(item.item_id, 'served');
    }
    loadOrders();
    notify('✓ Order marked as served — ready for payment');
  }

  const groupedOrders = orders.reduce((acc, item) => {
    if (!acc[item.order_id]) {
      acc[item.order_id] = {
        order_number: item.order_number,
        table_number: item.table_number,
        items: []
      };
    }
    acc[item.order_id].items.push(item);
    return acc;
  }, {});

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading kitchen orders…</p></div>;
  }

  return (
    <div className="kitchen-display">
      <div className="kitchen-header">
        <h2>👨‍🍳 Kitchen Orders</h2>
        <button className="primary" onClick={loadOrders}>🔄 Refresh</button>
      </div>

      {Object.keys(groupedOrders).length === 0 && (
        <div className="empty-state">
          <p style={{ fontSize: 48 }}>✨</p>
          <p>No pending orders</p>
        </div>
      )}

      <div className="kitchen-orders">
        {Object.entries(groupedOrders).map(([orderId, orderData]) => {
          const allReady = orderData.items.every(i => i.status === 'ready');
          const someReady = orderData.items.some(i => i.status === 'ready');
          const elapsed = orderData.items[0]?.time_elapsed || 0;
          const mins = Math.floor(elapsed / 60);
          const isUrgent = mins >= 10;

          return (
            <div key={orderId} className={`kitchen-order-card${allReady ? ' order-ready' : ''}`}>
              <div className="kitchen-order-header">
                <div>
                  <div className="kitchen-order-number">#{orderData.order_number}</div>
                  <div className="kitchen-table">🪑 Table {orderData.table_number}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div className={`kitchen-time${isUrgent ? ' urgent' : ''}`}>
                    ⏱ {mins}m ago
                  </div>
                  {allReady ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: '#d1fae5', padding: '2px 8px', borderRadius: 20 }}>
                      ✅ ALL READY
                    </span>
                  ) : someReady ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: '#fef3c7', padding: '2px 8px', borderRadius: 20 }}>
                      ⏳ PARTIAL
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="kitchen-items">
                {orderData.items.map(item => (
                  <div key={item.item_id} className={`kitchen-item${item.status === 'ready' ? ' item-ready' : ''}`}>
                    <div className="kitchen-item-main">
                      <div className="kitchen-item-qty">{item.quantity}×</div>
                      <div style={{ flex: 1 }}>
                        <div className="kitchen-item-name">{item.item_name}</div>
                        {item.notes && (
                          <div className="kitchen-item-notes">📝 {item.notes}</div>
                        )}
                      </div>
                      <div className="kitchen-item-status-badge" data-status={item.status}>
                        {item.status === 'sent' && '🔵 New'}
                        {item.status === 'preparing' && '🟡 Cooking'}
                        {item.status === 'ready' && '🟢 Ready'}
                      </div>
                    </div>
                    <div className="kitchen-item-actions">
                      {item.status === 'sent' && (
                        <button
                          className="btn-preparing"
                          onClick={() => handleUpdateStatus(item.item_id, 'preparing')}
                        >
                          Start Cooking
                        </button>
                      )}
                      {item.status === 'preparing' && (
                        <button
                          className="btn-ready"
                          onClick={() => handleUpdateStatus(item.item_id, 'ready')}
                        >
                          Mark Ready ✓
                        </button>
                      )}
                      {item.status === 'ready' && (
                        <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                          Ready to serve
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Order-level action buttons */}
              <div className="kitchen-order-footer">
                {!allReady && (
                  <button
                    className="btn-mark-all-ready"
                    onClick={() => handleMarkAllReady(orderId)}
                  >
                    ✓ Mark All Ready
                  </button>
                )}
                {someReady && (
                  <button
                    className="btn-serve"
                    onClick={() => handleMarkServed(orderId)}
                  >
                    🍽 Serve Order → Payment
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper function (reuse from main.jsx)
function playBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 1200;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
  } catch (error) {
    console.warn('Audio beep failed:', error);
  }
}

// ══════════════════════════════════════════════════════════════
// QUICK PAY MODAL — opened directly from table card
// ══════════════════════════════════════════════════════════════

function QuickPayModal({ table, order, items, money, taxRate = 16, loyaltySpend = 1000, customers = [], onComplete, onClose }) {
  const [paymentMethod, setPaymentMethod] = useState('M-Pesa');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const total = order?.total || 0;
  const pointsEarned = Math.floor(total / loyaltySpend);

  const matchedCustomer = customerPhone.length >= 9
    ? customers.find(c => (c.phone || '').replace(/\D/g,'').endsWith(customerPhone.replace(/\D/g,'').slice(-9)))
    : null;

  const handlePhoneChange = (val) => {
    setCustomerPhone(val);
    const match = customers.find(c => (c.phone || '').replace(/\D/g,'').endsWith(val.replace(/\D/g,'').slice(-9)));
    if (match && !customerName) setCustomerName(match.name);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💳 Quick Pay — Table {table?.table_number}</h3>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Total */}
          <div style={{ background: 'var(--violet-lt)', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Total to pay</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--violet)', lineHeight: 1 }}>{money(total)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{money(order?.subtotal || 0)} + {taxRate}% tax · {items.length} item{items.length !== 1 ? 's' : ''}</div>
          </div>

          {/* Payment method buttons */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Payment Method</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { id: 'M-Pesa', icon: '📱', color: '#00A86B' },
                { id: 'Cash',   icon: '💵', color: '#f59e0b' },
                { id: 'Card',   icon: '💳', color: '#3b82f6' },
                { id: 'Room Charge', icon: '🏨', color: '#8b5cf6' },
              ].map(m => (
                <button key={m.id} onClick={() => setPaymentMethod(m.id)} style={{
                  padding: '12px 8px', borderRadius: 10,
                  border: `2px solid ${paymentMethod === m.id ? m.color : 'var(--line)'}`,
                  background: paymentMethod === m.id ? m.color + '18' : 'var(--wash)',
                  color: paymentMethod === m.id ? m.color : 'var(--muted)',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all .15s',
                }}>
                  <span style={{ fontSize: 20 }}>{m.icon}</span>
                  {m.id}
                </button>
              ))}
            </div>
          </div>

          {/* Customer fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-field">
              <label>Customer name</label>
              <input type="text" className="input" placeholder="Optional" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Phone {matchedCustomer ? <span style={{color:'var(--green)',fontWeight:600}}>✓ {matchedCustomer.name}</span> : ''}</label>
              <input type="tel" className="input" placeholder="For receipt & points" value={customerPhone} onChange={e => handlePhoneChange(e.target.value)} />
            </div>
          </div>

          {/* Loyalty */}
          {pointsEarned > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🎁</span>
              <div>
                <div style={{ fontWeight: 700, color: '#065f46', fontSize: 13 }}>+{pointsEarned} loyalty points</div>
                <div style={{ color: '#059669', fontSize: 11 }}>
                  {matchedCustomer ? `${matchedCustomer.name} → ${(matchedCustomer.points || 0) + pointsEarned} pts` : 'Enter phone to save points'}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="primary" style={{ flex: 1, fontSize: 15, padding: '13px' }}
            onClick={() => { onComplete(paymentMethod, customerPhone, customerName); onClose(); }}>
            ✓ Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ORDER RECEIPT MODAL
// ══════════════════════════════════════════════════════════════

function OrderReceiptModal({ receipt, money, storeName, storePhone, taxRate = 16, onClose }) {
  const { order, items, table, paymentMethod, customerPhone, customerName } = receipt;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

  function formatWhatsAppInvoice() {
    const itemLines = items.map(i =>
      `  ${i.quantity}× ${i.item_name} — ${money(i.subtotal)}`
    ).join('\n');

    return `🍽️ *Order Receipt*
*${storeName}*${storePhone ? `\n📞 ${storePhone}` : ''}

${customerName ? `👤 ${customerName}\n` : ''}📋 Order: *#${order.order_number || String(order.id).slice(-6)}*
🪑 Table: ${table?.table_number || '—'}
📅 ${dateStr} at ${timeStr}

*Items:*
${itemLines}

━━━━━━━━━━━━━━━━━━━
Subtotal:  ${money(order.subtotal || 0)}
Tax (${taxRate}%): ${money(order.tax || 0)}
*TOTAL:    ${money(order.total || 0)}*
━━━━━━━━━━━━━━━━━━━
💳 Paid via ${paymentMethod}

Thank you for dining with us! 🙏`;
  }

  const handleWhatsApp = () => {
    const phone = customerPhone?.trim();
    if (!phone) return;
    sendWhatsApp(phone, formatWhatsAppInvoice());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✅ Order Complete</h3>
          <button onClick={onClose}>×</button>
        </div>

        {/* Receipt body */}
        <div className="modal-body" style={{ fontFamily: 'monospace', fontSize: 13 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{storeName}</div>
            {storePhone && <div style={{ color: 'var(--muted)' }}>📞 {storePhone}</div>}
            <div style={{ color: 'var(--muted)', marginTop: 4 }}>{dateStr} · {timeStr}</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: 'var(--muted)' }}>
            <span>Order #{order.order_number || String(order.id).slice(-6)}</span>
            <span>Table {table?.table_number || '—'}</span>
          </div>
          {customerName && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>👤 {customerName}</div>
          )}

          <div style={{ borderTop: '1px dashed var(--line)', borderBottom: '1px dashed var(--line)', padding: '10px 0', margin: '8px 0' }}>
            {items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{item.quantity}× {item.item_name}</span>
                <span>{money(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
              <span>Subtotal</span><span>{money(order.subtotal || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
              <span>Tax ({taxRate}%)</span><span>{money(order.tax || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, marginTop: 6, color: 'var(--violet)' }}>
              <span>TOTAL</span><span>{money(order.total || 0)}</span>
            </div>
            <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
              💳 Paid via {paymentMethod}
            </div>
          </div>

          {/* PDF share */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16, display:'flex', flexDirection:'column', gap: 8 }}>
            <button
              style={{
                background: '#25D366', color: '#fff', border: 'none',
                borderRadius: 8, padding: '13px 16px', fontWeight: 700,
                cursor: 'pointer', fontSize: 14, width: '100%',
              }}
              onClick={() => shareOrderReceiptPDF({
                order, items, table, paymentMethod,
                customerName, customerPhone,
                storeName, storePhone, taxRate,
              })}
            >
              📄 Send PDF to Customer
            </button>
            <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
              {customerPhone
                ? 'PDF downloads, then customer\'s WhatsApp chat opens'
                : 'Enter phone above to send directly to their WhatsApp'}
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MANAGE TABLES VIEW
// ══════════════════════════════════════════════════════════════

function ManageTablesView({ tables, showForm, editingTable, onShowForm, onEditTable, onSaveTable, onDeleteTable, onChangeStatus, onCloseForm, onBack }) {
  const [formData, setFormData] = useState({
    tableNumber: '',
    tableName: '',
    capacity: '',
    section: '',
  });

  useEffect(() => {
    if (editingTable) {
      setFormData({
        tableNumber: editingTable.table_number,
        tableName: editingTable.table_name || '',
        capacity: editingTable.capacity.toString(),
        section: editingTable.section || '',
      });
    } else {
      setFormData({
        tableNumber: '',
        tableName: '',
        capacity: '',
        section: '',
      });
    }
  }, [editingTable]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveTable(formData);
  };

  return (
    <div className="manage-tables-view">
      <div className="manage-header">
        <button className="btn-back" onClick={onBack}>← Back to Tables</button>
        <h2>Manage Tables</h2>
        <button className="primary" onClick={onShowForm}>+ Add Table</button>
      </div>

      <div className="tables-list">
        {tables.map(table => (
          <div key={table.id} className="table-item">
            <div className="table-item-info">
              <div className="table-item-number">Table {table.table_number}</div>
              <div className="table-item-details">
                {table.table_name && <span>{table.table_name}</span>}
                <span>👥 {table.capacity} seats</span>
                {table.section && <span>📍 {table.section}</span>}
              </div>
            </div>
            
            <div className="table-item-status">
              <select
                value={table.status}
                onChange={(e) => onChangeStatus(table.id, e.target.value)}
                className="status-select"
              >
                <option value="available">🟢 Available</option>
                <option value="occupied">🔴 Occupied</option>
                <option value="reserved">🟡 Reserved</option>
                <option value="dirty">⚪ Dirty</option>
              </select>
            </div>

            <div className="table-item-actions">
              <button className="btn-edit" onClick={() => onEditTable(table)}>
                ✏️ Edit
              </button>
              <button className="btn-delete" onClick={() => onDeleteTable(table.id)}>
                🗑️ Delete
              </button>
            </div>
          </div>
        ))}

        {tables.length === 0 && (
          <div className="empty-state">
            <p style={{ fontSize: 48 }}>🍽️</p>
            <p style={{ fontSize: 16 }}>No tables yet</p>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Click "Add Table" to create your first table</p>
          </div>
        )}
      </div>

      {/* Table Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={onCloseForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTable ? 'Edit Table' : 'Add New Table'}</h3>
              <button onClick={onCloseForm}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-field">
                  <label>Table Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.tableNumber}
                    onChange={(e) => setFormData({ ...formData, tableNumber: e.target.value })}
                    placeholder="e.g., 1, A1, VIP-1"
                  />
                </div>

                <div className="form-field">
                  <label>Table Name (optional)</label>
                  <input
                    type="text"
                    value={formData.tableName}
                    onChange={(e) => setFormData({ ...formData, tableName: e.target.value })}
                    placeholder="e.g., Window View, Patio Corner"
                  />
                </div>

                <div className="form-field">
                  <label>Capacity (seats) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="20"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    placeholder="e.g., 4"
                  />
                </div>

                <div className="form-field">
                  <label>Section (optional)</label>
                  <input
                    type="text"
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    placeholder="e.g., Indoor, Outdoor, VIP"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary" onClick={onCloseForm}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  {editingTable ? 'Save Changes' : 'Create Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
