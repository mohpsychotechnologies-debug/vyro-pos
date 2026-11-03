# Vyro POS - Complete Setup Instructions

## Database Setup

### Step 1: Run SQL Migrations (in order)

Run these SQL files in your Supabase SQL Editor:

1. **`supabase/schema.sql`** - Base schema (stores, users, products, sales, etc.)
2. **`supabase/admin_functions.sql`** - Admin RPC functions
3. **`supabase/add_subscriptions.sql`** - Subscription plans and features
4. **`supabase/add_payment_approval.sql`** - Payment approval workflow
5. **`supabase/add_subscription_requests.sql`** ⭐ NEW - Public subscription requests

### Step 2: Verify Tables Created

Check that these tables exist:
- `stores`
- `pos_users`
- `products`
- `sales`
- `customers`
- `suppliers`
- `purchases`
- `expenses`
- `categories`
- `activity_log`
- `subscription_plans`
- `store_features`
- `payment_requests`
- `subscription_requests` ⭐ NEW

## New Features

### Public Landing Page (/landing-page)

When not logged in, users see:
- **Home** - Hero section with value proposition
- **Portals** - Three login options (Admin, Manager, Cashier)
- **Features** - 8-card feature grid
- **Pricing** - All 5 pricing tiers displayed
- **Support** - Contact cards and FAQ

### Subscription Request Flow

#### For New Customers:
1. Visit landing page
2. Click any "Get started" or pricing button
3. Fill in subscription request form:
   - Business Name* (required)
   - Owner Name* (required)
   - Phone Number* (required)
   - Email (optional)
   - Address (optional)
   - Notes (optional)
4. Submit → Shows success message
5. Wait for admin approval

#### For Admins:
1. Login to Admin Portal
2. Navigate to **"Requests"** tab (shows pending count)
3. View all subscription requests with filters:
   - All
   - Pending
   - Approved
   - Rejected
4. Review request details
5. **Approve** → Automatically:
   - Creates new store
   - Creates manager user with random 4-digit PIN
   - Sets subscription plan
   - Marks request as approved
   - Shows credentials to share with customer
6. **Reject** → Enter reason, marks as rejected

## Admin Dashboard Tabs

1. **Stores** - All stores with revenue and subscriptions
2. **Users** - All users across all stores
3. **Requests** ⭐ NEW - Subscription requests (pending/approved/rejected)
4. **Pending** - Payment approvals waiting
5. **Subscriptions** - All subscriptions and payment history
6. **Activity** - System-wide activity log
7. **Revenue** - Cross-store revenue reports

## Navigation Structure

### Public Site
```
Logo (left)  |  Home · Portals · Features · Pricing · Support (right)  |  Login → (CTA button)
```

### Admin Dashboard
```
Sidebar:
- 🏪 Stores
- 👥 Users
- 📝 Requests (N)  ← Shows pending count
- ⏳ Pending (N)   ← Shows pending payments
- 💳 Subscriptions
- 📋 Activity log
- 📊 Revenue
```

## Environment Variables

Ensure `.env` has:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Running the App

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## First Time Setup

1. Run all SQL migrations in Supabase
2. Create your super admin user manually in Supabase:
   ```sql
   INSERT INTO public.pos_users (name, pin, role, active)
   VALUES ('Super Admin', '0000', 'superadmin', true);
   ```
3. Configure payment settings in admin panel (⚙ Payment Settings)
4. Start receiving subscription requests!

## Testing the Flow

### Test Subscription Request:
1. Go to http://localhost:5173 (landing page)
2. Click "Start free trial" or any pricing button
3. Fill in test data:
   - Business: "Test Shop"
   - Owner: "John Doe"
   - Phone: "0712345678"
4. Submit

### Test Admin Approval:
1. Login with PIN: 0000 (super admin)
2. Click "Requests" tab
3. See the pending request
4. Click "✓ Approve"
5. Copy the generated PIN
6. Share with customer

### Test Customer Login:
1. Logout
2. Login as Manager with the generated PIN
3. See the new store dashboard

## Security Notes

- Subscription request form is public (no auth required)
- Only superadmins can view/approve requests (RLS policies)
- Manager PINs are auto-generated (4 digits)
- Store data is isolated per store_id
- All admin actions are logged in activity_log

## Support

For issues:
- Check browser console for errors
- Verify all SQL migrations ran successfully
- Check Supabase logs for RLS policy issues
- Ensure environment variables are set correctly
