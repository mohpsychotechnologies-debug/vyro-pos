# 🗄️ Supabase Migration Order

Run these SQL files in **this exact order** to set up your Vyro POS database:

## ✅ Required Migrations (Run First)

### 1. **schema.sql** ⭐ (REQUIRED FIRST)
**Purpose:** Creates all core tables (stores, users, products, sales, etc.)

**Run this first!** Everything else depends on this.

**Creates:**
- `stores` - Store/business information
- `users` - Staff accounts (managers, cashiers)
- `products` - Inventory/menu items
- `categories` - Product categories
- `sales` - Transaction records
- `customers` - Customer database
- `suppliers` - Supplier management
- `purchases` - Purchase orders
- `expenses` - Expense tracking

**How to run:**
1. Supabase Dashboard → SQL Editor
2. Copy all contents from `supabase/schema.sql`
3. Paste and click "Run"
4. Wait for success message

---

### 2. **add_email_auth.sql**
**Purpose:** Replaces PIN-based login with email/password authentication

**Creates/Modifies:**
- Adds `email` and `password_hash` columns to users
- New login function: `pos_login(email, password)`
- User management functions

**Run after:** schema.sql

---

### 3. **add_subscriptions.sql**
**Purpose:** Adds subscription billing system

**Creates:**
- `subscriptions` table
- `subscription_plans` table
- Subscription management functions

**Run after:** add_email_auth.sql

---

### 4. **add_payment_approval.sql**
**Purpose:** Payment approval workflow for subscriptions

**Creates:**
- `payment_approvals` table
- Payment request functions

**Run after:** add_subscriptions.sql

---

### 5. **add_subscription_requests.sql**
**Purpose:** Subscription renewal request system

**Creates:**
- `subscription_requests` table
- Request management functions

**Run after:** add_payment_approval.sql

---

### 6. **admin_functions.sql** (Optional)
**Purpose:** Additional admin utilities

**Run after:** add_subscription_requests.sql

---

### 7. **add_restaurant_module.sql** ⭐ (NEW)
**Purpose:** Restaurant/hotel food order management

**Creates:**
- `tables` - Table management
- `restaurant_orders` - Dine-in orders
- `restaurant_order_items` - Order line items
- Kitchen display functions

**Run after:** schema.sql (minimum) or all above migrations

---

## 🚀 Quick Setup (Fresh Database)

If you're setting up a **new/empty** database, run these in order:

```bash
# 1. Core schema (REQUIRED)
schema.sql

# 2. Authentication update
add_email_auth.sql

# 3. Subscriptions
add_subscriptions.sql

# 4. Payment approvals
add_payment_approval.sql

# 5. Subscription requests
add_subscription_requests.sql

# 6. Restaurant module
add_restaurant_module.sql
```

---

## 🔧 Existing Database

If you **already have** the core tables (stores, users, products), just run:

```bash
# Only if you don't have email auth yet
add_email_auth.sql

# NEW: Restaurant features
add_restaurant_module.sql
```

---

## ✅ Verification Checklist

After running migrations, verify these tables exist in Supabase Table Editor:

### Core Tables (from schema.sql):
- [ ] stores
- [ ] users
- [ ] products
- [ ] categories
- [ ] sales
- [ ] customers
- [ ] suppliers
- [ ] purchases
- [ ] expenses

### Restaurant Tables (from add_restaurant_module.sql):
- [ ] tables
- [ ] restaurant_orders
- [ ] restaurant_order_items

---

## ❌ Common Errors

### Error: "relation 'users' does not exist"
**Solution:** Run `schema.sql` first! This creates the users table.

### Error: "relation 'stores' does not exist"
**Solution:** Run `schema.sql` first! This creates the stores table.

### Error: "function does not exist"
**Solution:** You might have skipped a migration. Follow the order above.

### Error: "column already exists"
**Solution:** You've already run this migration. It's safe to skip.

---

## 🔄 Reset Database (Nuclear Option)

If you want to start fresh:

1. **Backup your data first!**
2. Supabase Dashboard → Database → Tables
3. Delete all tables
4. Run migrations in order starting from schema.sql

---

## 📞 Need Help?

**Check which tables you have:**
1. Supabase Dashboard → Table Editor
2. Look for the tables listed in verification checklist

**Still having issues?**
- Make sure you're in the correct project
- Check SQL Editor for error messages
- Verify you have the latest migration files

---

## 🎯 For Restaurant Module Only

**Minimum requirement:**
```sql
-- Run these first:
1. schema.sql (creates users, stores, products)

-- Then run:
2. add_restaurant_module.sql
```

That's all you need for basic restaurant functionality!

Full subscriptions/billing are optional for restaurant features.
