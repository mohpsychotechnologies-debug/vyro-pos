# 🍽️ Restaurant Module - Quick Start (5 Minutes)

## Step 1: Setup Database (2 minutes)

1. **Open Supabase Dashboard** → SQL Editor
2. **Copy all contents** from `supabase/add_restaurant_module.sql`
3. **Paste and click "Run"**
4. **Verify:** Check that these tables exist in Table Editor:
   - ✅ `tables`
   - ✅ `restaurant_orders`
   - ✅ `restaurant_order_items`

✅ **10 sample tables will be created automatically!**

---

## Step 2: Start the App (1 minute)

```bash
npm run dev
```

Open: http://localhost:5175/

---

## Step 3: Test Restaurant Features (2 minutes)

### Login
- Email: admin@vyrosocial.com
- Password: Hussein@4

### Take Your First Order

1. **Click "Restaurant" in sidebar** 🍽️
   - You'll see 10 tables (Table 1-6, O1-O2, VIP1, BAR)

2. **Click "Table 1"** (should be green/available)
   - Order screen opens
   - New order created automatically

3. **Add menu items:**
   - Click any product from the menu
   - Items added to order on the right

4. **Send to kitchen:**
   - Click "Send to Kitchen 👨‍🍳" button
   - Order sent to kitchen display

5. **View in kitchen:**
   - Click "Kitchen" in sidebar 👨‍🍳
   - See your order appear
   - Click "Start" → then "Ready"

6. **Complete payment:**
   - Go back to "Restaurant"
   - Table 1 now shows as "Occupied" with order amount
   - Click Table 1 again
   - Click "Complete Order 💳"
   - Select payment method
   - Click "Complete Payment"

7. **Clean table:**
   - Table 1 now marked as "Dirty" (white)
   - Click "Clean" button
   - Table 1 becomes "Available" again (green)

---

## Features Overview

### 🪑 Table Management
- **Restaurant page** - Visual table grid
- **4 statuses:** Available, Occupied, Reserved, Dirty
- **Sections:** Main, Outdoor, VIP, Bar
- Click table → Start/view order

### 📝 Order Taking
- Browse menu by category
- Click items to add
- Real-time total calculation
- Send to kitchen when ready

### 👨‍🍳 Kitchen Display
- Real-time order queue
- Item status tracking
- Timer showing elapsed time
- Mark items as preparing/ready

### 💳 Payment
- View complete bill
- Multiple payment methods
- Table automatically marked dirty
- Clean table to make available

---

## Navigation

```
Dashboard
├── Restaurant 🍽️ (Take orders, view tables)
├── Kitchen 👨‍🍳 (Kitchen display for chefs)
├── POS ▣ (Quick retail sales - separate from restaurant)
└── Sales ↗ (View all sales including restaurant)
```

---

## Keyboard Shortcuts

- **F5** - Refresh tables/orders
- **Esc** - Close modals
- **Click table** - Quick access to orders

---

## Common Workflows

### New Guest Arrives
```
1. Click available table
2. Add items from menu
3. Send to kitchen
4. Kitchen prepares
5. Serve guests
6. Complete payment
7. Clean table
```

### Add Items to Existing Order
```
1. Click occupied table
2. Existing order loads
3. Add new items
4. Send to kitchen (only new items sent)
5. Complete when ready
```

### Kitchen Workflow
```
1. Open "Kitchen" page
2. New orders appear automatically
3. Click "Start" when beginning
4. Click "Ready" when done
5. Waiter notified
```

---

## Mobile Access

✅ Works great on tablets and phones!

1. Open http://[your-ip]:5175/ on mobile device
2. Login with same credentials
3. Waiters can take orders from tablets
4. Kitchen can use a dedicated tablet

---

## Default Tables Created

| Table | Capacity | Section |
|-------|----------|---------|
| 1-6   | 2-6 seats | Main |
| O1-O2 | 4-6 seats | Outdoor |
| VIP1  | 8 seats | VIP |
| BAR   | 10 seats | Bar |

**To add more tables:** See full documentation or use SQL:

```sql
INSERT INTO tables (store_id, table_number, capacity, section)
VALUES ('<your-store-id>', '7', 4, 'main');
```

---

## Troubleshooting

**No tables showing?**
→ Run the SQL migration from Step 1

**Can't send to kitchen?**
→ Make sure items are added to order

**Kitchen display empty?**
→ Orders must be sent to kitchen first

**Can't complete payment?**
→ Order must be marked "Ready" in kitchen

---

## Next Steps

✅ You're ready to use the restaurant module!

**Want more features?** I can add:
- Reservations
- Split bills
- Table merging
- QR code ordering
- Menu modifiers (size, spice)
- Advanced reports

Just ask! 🚀

---

## Need Help?

1. Check the full guide: `Restaurant Module - Complete Guide`
2. Review SQL migration: `supabase/add_restaurant_module.sql`
3. Test in development before production

**Happy serving!** 🎉🍽️
