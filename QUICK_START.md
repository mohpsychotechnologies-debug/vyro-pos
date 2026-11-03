# ⚡ Vyro POS - Quick Start Guide

Get your POS system up and running in 15 minutes!

---

## 🚀 1. Create Supabase Project (5 minutes)

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Fill in:
   - Project name: `vyro-pos`
   - Database password: (save this!)
   - Region: Choose closest to you
3. Wait for project to be created (~2 minutes)

---

## 📊 2. Set Up Database (5 minutes)

1. In Supabase Dashboard → **SQL Editor**
2. Copy-paste and run **each file in order**:

```sql
-- ✅ 1. Base schema (creates all tables)
-- Copy from: supabase/schema.sql
-- Then click "RUN"

-- ✅ 2. Subscriptions
-- Copy from: supabase/add_subscriptions.sql
-- Then click "RUN"

-- ✅ 3. Subscription requests
-- Copy from: supabase/add_subscription_requests.sql
-- Then click "RUN"

-- ✅ 4. Payment approval
-- Copy from: supabase/add_payment_approval.sql
-- Then click "RUN"

-- ✅ 5. Email authentication
-- Copy from: supabase/add_email_auth.sql
-- Then click "RUN"
```

3. Verify setup:
   ```sql
   SELECT * FROM pos_users WHERE role = 'superadmin';
   ```
   You should see 1 admin user.

---

## 🔐 3. Get Your Credentials (1 minute)

1. In Supabase Dashboard → **Settings** → **API**
2. Copy these two values:
   - ✅ Project URL
   - ✅ `anon` `public` key

---

## 💻 4. Configure Local Environment (2 minutes)

1. Open project folder in terminal
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file:
   ```bash
   VITE_SUPABASE_URL=YOUR_PROJECT_URL_HERE
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
   ```

4. Start dev server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:5173](http://localhost:5173)

---

## 🎉 5. First Login (1 minute)

**Default Credentials:**
- Email: `admin@vyrosocial.com`
- Password: `Hussein@4`

⚠️ **CHANGE IMMEDIATELY:**
1. After login → Click your name (bottom left)
2. Go to **Settings** → **My Account**
3. Update email and password
4. Save

---

## 🏪 6. Create Your First Store (1 minute)

1. In Admin portal → **Stores** → **+ New Store**
2. Fill in:
   - Store name: `My Store`
   - Phone: `0712345678` (for WhatsApp)
   - Manager name: `Your Name`
   - Manager email: `manager@mystore.com`
   - Manager password: `Test@123`
3. Click **Create Store**
4. **📱 Send credentials via WhatsApp** or copy them

---

## 🎯 7. Test Everything (5 minutes)

### Test as Manager
1. **Logout** from admin
2. **Login** with manager credentials you just created
3. Add a product:
   - Dashboard → **Products** → **+ Add Product**
   - Name: `Test Product`
   - Price: `100`
   - Stock: `50`
   - Save
4. Add a cashier:
   - **Settings** → **Staff** → **+ Add Staff**
   - Fill details and save

### Test as Cashier
1. **Logout** from manager
2. **Login** with cashier credentials
3. Process a sale:
   - Click **POS** in sidebar
   - Click your test product
   - Click **Checkout**
   - Complete payment
4. View receipt

### Verify as Admin
1. **Logout** from cashier
2. **Login** as admin
3. Go to **Revenue** tab
4. See your test sale! 🎉

---

## 🚀 Deploy to Production (2 minutes)

### Option A: Vercel (Recommended)

1. Push code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) → **Import Project**
3. Select your GitHub repo
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**
6. Done! 🎉

### Option B: Netlify

1. Push to GitHub (same as above)
2. Go to [netlify.com](https://netlify.com) → **New site from Git**
3. Select your repo
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables
6. Deploy!

---

## ✅ You're Done!

Your POS system is live! 🎉

**Next Steps:**
- Configure payment settings (M-Pesa)
- Set up subscription plans
- Add your real products
- Train your staff
- Start selling!

---

## 📚 Need Help?

- **Detailed Guide:** See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Full Documentation:** See [README.md](README.md)
- **Troubleshooting:** Check browser console (F12)

---

## 📞 Common Issues

### "Supabase not configured"
➡️ Check your `.env` file has correct URL and key

### Login doesn't work
➡️ Verify all SQL migrations ran successfully

### Can't see products
➡️ Make sure you're logged in as the correct role

### Barcode scanner won't open
➡️ Use HTTPS (required for camera). Works in development on localhost.

---

**🎉 Congratulations! You now have a fully functional POS system!**
