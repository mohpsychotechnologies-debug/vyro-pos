# 🚀 M-Pesa Integration Setup Guide

## ✅ What Has Been Created

I've implemented a **complete multi-tenant M-Pesa C2B integration** where each store can configure their own till number. Here's what's included:

### 1. **Database Schema** ✅
- `mpesa_credentials` table - Stores each store's till config
- `mpesa_transactions` table - Logs all payment transactions
- SQL functions for secure credential management

### 2. **Backend API** ✅
Located in `backend/` folder:
- **Express server** - Handles M-Pesa API calls
- **M-Pesa routes** - STK Push, callbacks, URL registration
- **Service layer** - M-Pesa API communication logic

### 3. **Frontend UI** ✅
- **Settings page** - M-Pesa configuration panel
- Credential management form
- Test credentials button
- Transaction statistics display

### 4. **Integration Flow** ✅
- Store managers configure their own credentials
- Backend securely communicates with M-Pesa
- Callbacks update transactions in real-time
- Frontend displays payment status

---

## 📋 Setup Instructions

### Step 1: Database Setup (5 minutes)

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Copy the entire contents of `supabase/add_mpesa_credentials.sql`
4. Paste and click **Run**

This creates the M-Pesa tables and functions.

---

### Step 2: Backend Setup (10 minutes)

#### A. Configure Environment Variables

1. Navigate to `backend/` folder:
```bash
cd backend
```

2. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

3. Edit `backend/.env` with your values:
```env
# Get these from Supabase Dashboard > Settings > API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Start with sandbox for testing
MPESA_ENV=sandbox

# For local development
PORT=3001
BACKEND_URL=http://localhost:3001
```

#### B. Install Dependencies (Already Done ✅)
```bash
npm install
```

#### C. Start Backend Server
```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║   VYRO POS M-Pesa Backend Server                          ║
║   Port: 3001                                               ║
║   Environment: sandbox                                     ║
║   Status: Running ✓                                        ║
╚════════════════════════════════════════════════════════════╝
```

---

### Step 3: Frontend Setup (2 minutes)

1. Add backend URL to your main `.env` file:
```bash
# In the ROOT folder, edit .env
VITE_BACKEND_URL=http://localhost:3001
```

2. Restart your frontend dev server:
```bash
npm run dev
```

---

### Step 4: Get M-Pesa Credentials (One-time per store)

Each store owner needs to do this:

1. **Go to Daraja Portal**
   - Visit: https://developer.safaricom.co.ke
   - Create an account (free)

2. **Create an App**
   - Choose **Lipa Na M-Pesa Online** (for STK Push)
   - Or **C2B** (for till payments)
   - Select **Sandbox** for testing

3. **Get Credentials**
   - **Consumer Key** - Copy from app details
   - **Consumer Secret** - Copy from app details
   - **Business Shortcode** - For sandbox, use test shortcode: `174379`
   - **Passkey** - For sandbox: `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`

4. **Enter in POS**
   - Login to your POS dashboard
   - Go to **Settings**
   - Scroll to **M-Pesa Lipa Na M-Pesa (C2B)**
   - Click **Configure**
   - Fill in the credentials
   - Click **Test** to verify
   - Click **Save Credentials**

---

### Step 5: Test the Integration (5 minutes)

#### Test with Sandbox

1. **Configure credentials** (use sandbox test credentials above)

2. **Register callback URLs**:
   - In Settings > M-Pesa, click **Register Callbacks**
   - This tells M-Pesa where to send payment confirmations

3. **Test STK Push** (TODO: Add payment UI - see next section)

4. **Use M-Pesa Simulator**:
   - Visit: https://developer.safaricom.co.ke/test_credentials
   - Use test phone: `254708374149`
   - Test amount: Any amount between 1-70000

---

## 🔄 Next Steps: Add Payment UI to Checkout

To actually USE M-Pesa in your checkout flow, you need to add a payment button. Here's what to add:

### In your Checkout/POS component:

```javascript
const handleMpesaPayment = async (phoneNumber, amount) => {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    
    const response = await fetch(`${backendUrl}/api/mpesa/stk-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: currentUser.storeId,
        phoneNumber: phoneNumber,
        amount: amount,
        billRefNumber: `SALE-${Date.now()}`,
        saleId: saleId  // Optional: link to your sale record
      })
    });

    const data = await response.json();
    
    if (data.success) {
      notify('📱 Payment request sent! Customer should check their phone.');
      // Wait for callback...
    } else {
      notify(`❌ ${data.error}`);
    }
  } catch (error) {
    notify(`❌ Payment failed: ${error.message}`);
  }
};
```

---

## 🚀 Deployment

### Backend Deployment

#### Option 1: Heroku (Recommended)
```bash
cd backend
git init
heroku create vyro-pos-mpesa
git add .
git commit -m "M-Pesa backend"
git push heroku main
```

Set environment variables:
```bash
heroku config:set SUPABASE_URL=your-url
heroku config:set SUPABASE_SERVICE_ROLE_KEY=your-key
heroku config:set MPESA_ENV=production
heroku config:set BACKEND_URL=https://vyro-pos-mpesa.herokuapp.com
```

#### Option 2: Railway
1. Visit https://railway.app
2. Create new project
3. Connect GitHub repo
4. Add environment variables
5. Deploy automatically

#### Option 3: Render
1. Visit https://render.com
2. Create new web service
3. Connect GitHub repo
4. Add environment variables
5. Deploy

### Update Frontend
After deployment, update your main `.env`:
```env
VITE_BACKEND_URL=https://your-backend.herokuapp.com
```

### Production M-Pesa
1. Switch to production credentials in Daraja Portal
2. Update `MPESA_ENV=production` in backend
3. Re-register callback URLs with production credentials
4. Test with small real money amounts first!

---

## 📊 How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Store A   │────────>│  Your Backend│────────>│   M-Pesa    │
│ Till: 123456│         │     API      │         │     API     │
└─────────────┘         └──────────────┘         └─────────────┘
                              │ Callback              │
                              │<──────────────────────│
                              ▼
                        ┌──────────────┐
                        │   Supabase   │
                        │   Database   │
                        └──────────────┘
```

1. **Customer wants to pay** → Store clerk enters phone number
2. **Frontend calls backend** → Backend calls M-Pesa API
3. **M-Pesa sends STK Push** → Customer sees popup on phone
4. **Customer enters PIN** → M-Pesa processes payment
5. **M-Pesa calls backend** → Backend saves to database
6. **Frontend gets update** → Shows "Payment Successful!"

---

## 🔒 Security Notes

✅ **Credentials never exposed** - Stored securely in database, accessed only by backend  
✅ **Service role key** - Only backend has it, never frontend  
✅ **HTTPS required** - M-Pesa rejects HTTP callback URLs  
✅ **Store isolation** - Each store only sees their own transactions

---

## 🆘 Troubleshooting

### "Failed to get M-Pesa access token"
- Check Consumer Key and Secret are correct
- Ensure you're using the right environment (sandbox/production)
- Test with the **Test Credentials** button in settings

### "M-Pesa credentials not configured"
- Go to Settings > M-Pesa > Configure
- Fill in all required fields
- Click Save Credentials

### "Callback URL not reachable"
- Your backend must be publicly accessible (use ngrok for local testing)
- Backend must use HTTPS in production
- Check firewall/security group settings

### STK Push not appearing on phone
- Phone number must start with 254 (not 0 or +254)
- In sandbox, only test numbers work: `254708374149`
- Amount must be between 1 and 70,000

---

## 📚 Resources

- [Daraja API Documentation](https://developer.safaricom.co.ke/Documentation)
- [M-Pesa Sandbox Testing](https://developer.safaricom.co.ke/test_credentials)
- [STK Push Guide](https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate)
- [C2B API Guide](https://developer.safaricom.co.ke/c2b/apis/post/registerurl)

---

## ✅ Checklist

- [ ] Run database migration (`add_mpesa_credentials.sql`)
- [ ] Configure backend `.env` file
- [ ] Start backend server
- [ ] Configure frontend `.env` file
- [ ] Get M-Pesa credentials from Daraja Portal
- [ ] Enter credentials in POS Settings
- [ ] Test credentials
- [ ] Register callback URLs
- [ ] Add payment UI to checkout (next task)
- [ ] Deploy backend
- [ ] Switch to production credentials
- [ ] Test live payments

---

**Need help?** Check the main `MPESA_INTEGRATION_GUIDE.md` for detailed code examples.
