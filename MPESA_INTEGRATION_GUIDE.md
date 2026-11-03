# M-Pesa C2B Integration Guide — Multi-Tenant Architecture

## Overview
This guide explains how to integrate M-Pesa Lipa Na M-Pesa (C2B) where **each store/user has their own till number**.

## Architecture

### 1. Database Schema
- **`mpesa_credentials`** table stores each store's M-Pesa credentials
- **`mpesa_transactions`** table logs all M-Pesa payments
- Each store can configure their own:
  - Till Number (Business Shortcode)
  - Consumer Key & Secret
  - Passkey (for STK Push)

### 2. Multi-Tenant Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Store A (Till: 123456)  →  M-Pesa API  →  Store A Database │
│ Store B (Till: 789012)  →  M-Pesa API  →  Store B Database │
│ Store C (Till: 345678)  →  M-Pesa API  →  Store C Database │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Run Database Migration
```sql
-- Run this in Supabase SQL Editor
psql -f supabase/add_mpesa_credentials.sql
```

### Step 2: Set Up Backend API (Node.js/Express)

You need a backend server to:
1. Handle M-Pesa API calls (get access tokens)
2. Receive M-Pesa callbacks (C2B confirmations)
3. Keep credentials secure (never expose keys on frontend)

#### Backend Structure
```
backend/
├── server.js              # Main Express server
├── routes/
│   └── mpesa.js           # M-Pesa routes
├── services/
│   └── mpesaService.js    # M-Pesa API logic
└── middleware/
    └── auth.js            # Store authentication
```

### Step 3: Backend Implementation

#### `server.js`
```javascript
const express = require('express');
const cors = require('cors');
const mpesaRoutes = require('./routes/mpesa');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// M-Pesa routes
app.use('/api/mpesa', mpesaRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`M-Pesa Backend running on port ${PORT}`);
});
```

#### `routes/mpesa.js`
```javascript
const express = require('express');
const router = express.Router();
const mpesaService = require('../services/mpesaService');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key
);

// STK Push (Initiate payment)
router.post('/stk-push', async (req, res) => {
  try {
    const { storeId, phoneNumber, amount, billRefNumber } = req.body;

    // Get store's M-Pesa credentials
    const { data: creds, error } = await supabase
      .rpc('get_mpesa_credentials', { p_store_id: storeId });

    if (error || !creds) {
      return res.status(404).json({ error: 'M-Pesa credentials not found' });
    }

    // Get access token
    const accessToken = await mpesaService.getAccessToken(
      creds.consumer_key,
      creds.consumer_secret
    );

    // Initiate STK Push
    const response = await mpesaService.stkPush({
      accessToken,
      businessShortcode: creds.business_shortcode,
      passkey: creds.passkey,
      phoneNumber,
      amount,
      billRefNumber,
      callbackUrl: `${process.env.BACKEND_URL}/api/mpesa/callback/stk`
    });

    // Log transaction
    await supabase.rpc('log_mpesa_transaction', {
      p_store_id: storeId,
      p_transaction_type: 'STK_PUSH',
      p_transaction_id: response.CheckoutRequestID,
      p_amount: amount,
      p_phone_number: phoneNumber,
      p_bill_ref_number: billRefNumber,
      p_raw_response: response
    });

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('STK Push error:', error);
    res.status(500).json({ error: error.message });
  }
});

// C2B Callback (M-Pesa sends payment confirmation here)
router.post('/callback/c2b', async (req, res) => {
  try {
    const payload = req.body;
    console.log('C2B Callback:', JSON.stringify(payload, null, 2));

    // Extract transaction details
    const {
      TransID,
      TransAmount,
      MSISDN,
      BillRefNumber,
      BusinessShortCode
    } = payload;

    // Find store by business shortcode
    const { data: creds } = await supabase
      .from('mpesa_credentials')
      .select('store_id')
      .eq('business_shortcode', BusinessShortCode)
      .eq('is_active', true)
      .single();

    if (!creds) {
      console.error('Store not found for shortcode:', BusinessShortCode);
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // Log transaction
    await supabase.rpc('log_mpesa_transaction', {
      p_store_id: creds.store_id,
      p_transaction_type: 'C2B',
      p_transaction_id: TransID,
      p_amount: TransAmount,
      p_phone_number: MSISDN,
      p_bill_ref_number: BillRefNumber,
      p_result_code: '0',
      p_result_desc: 'Completed',
      p_raw_response: payload
    });

    // Respond to M-Pesa
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('C2B Callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

// STK Push Callback
router.post('/callback/stk', async (req, res) => {
  try {
    const { Body } = req.body;
    const { stkCallback } = Body;

    console.log('STK Callback:', JSON.stringify(stkCallback, null, 2));

    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;

    // Update transaction status
    await supabase.rpc('update_mpesa_transaction_status', {
      p_transaction_id: CheckoutRequestID,
      p_status: ResultCode === 0 ? 'completed' : 'failed',
      p_result_code: String(ResultCode),
      p_result_desc: ResultDesc
    });

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('STK Callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

// Register URLs with M-Pesa
router.post('/register-urls', async (req, res) => {
  try {
    const { storeId } = req.body;

    // Get store's M-Pesa credentials
    const { data: creds } = await supabase
      .rpc('get_mpesa_credentials', { p_store_id: storeId });

    if (!creds) {
      return res.status(404).json({ error: 'M-Pesa credentials not found' });
    }

    // Get access token
    const accessToken = await mpesaService.getAccessToken(
      creds.consumer_key,
      creds.consumer_secret
    );

    // Register URLs
    const response = await mpesaService.registerUrls({
      accessToken,
      businessShortcode: creds.business_shortcode,
      confirmationUrl: `${process.env.BACKEND_URL}/api/mpesa/callback/c2b`,
      validationUrl: `${process.env.BACKEND_URL}/api/mpesa/validation/c2b`
    });

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Register URLs error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

#### `services/mpesaService.js`
```javascript
const axios = require('axios');

const MPESA_ENV = process.env.MPESA_ENV || 'sandbox'; // 'sandbox' or 'production'

const BASE_URL = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

// Get OAuth access token
async function getAccessToken(consumerKey, consumerSecret) {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  const response = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${auth}`
      }
    }
  );
  
  return response.data.access_token;
}

// STK Push
async function stkPush({
  accessToken,
  businessShortcode,
  passkey,
  phoneNumber,
  amount,
  billRefNumber,
  callbackUrl
}) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${businessShortcode}${passkey}${timestamp}`).toString('base64');

  // Format phone number (remove leading 0, add 254)
  const phone = phoneNumber.startsWith('0') 
    ? '254' + phoneNumber.slice(1) 
    : phoneNumber.startsWith('254') 
    ? phoneNumber 
    : '254' + phoneNumber;

  const response = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: businessShortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.floor(amount),
      PartyA: phone,
      PartyB: businessShortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: billRefNumber || 'VYRO-POS',
      TransactionDesc: 'Payment'
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

// Register C2B URLs
async function registerUrls({
  accessToken,
  businessShortcode,
  confirmationUrl,
  validationUrl
}) {
  const response = await axios.post(
    `${BASE_URL}/mpesa/c2b/v1/registerurl`,
    {
      ShortCode: businessShortcode,
      ResponseType: 'Completed',
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

module.exports = {
  getAccessToken,
  stkPush,
  registerUrls
};
```

### Step 4: Frontend Integration

#### Settings Page - Add M-Pesa Configuration
```javascript
// In your POS dashboard settings
async function saveMpesaCredentials() {
  const { error } = await supabase.rpc('save_mpesa_credentials', {
    p_store_id: currentUser.storeId,
    p_consumer_key: consumerKey,
    p_consumer_secret: consumerSecret,
    p_business_shortcode: tillNumber,
    p_account_type: 'till',
    p_passkey: passkey
  });

  if (error) {
    alert('Failed to save credentials: ' + error.message);
  } else {
    alert('M-Pesa credentials saved successfully!');
  }
}
```

#### Payment Flow - Initiate STK Push
```javascript
async function processPayment(amount, phoneNumber) {
  try {
    // Call your backend
    const response = await fetch('http://localhost:3001/api/mpesa/stk-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: currentUser.storeId,
        phoneNumber: phoneNumber,
        amount: amount,
        billRefNumber: `SALE-${Date.now()}`
      })
    });

    const data = await response.json();

    if (data.success) {
      alert('Payment request sent! Please check your phone.');
      // Poll for payment status or listen to realtime updates
      checkPaymentStatus(data.data.CheckoutRequestID);
    }
  } catch (error) {
    console.error('Payment error:', error);
    alert('Payment failed: ' + error.message);
  }
}

// Listen for payment confirmation
async function checkPaymentStatus(checkoutRequestId) {
  const subscription = supabase
    .channel('mpesa-transactions')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mpesa_transactions',
        filter: `transaction_id=eq.${checkoutRequestId}`
      },
      (payload) => {
        console.log('Payment received:', payload);
        if (payload.new.status === 'completed') {
          alert('Payment successful!');
          completeSale();
        }
      }
    )
    .subscribe();
}
```

## Environment Variables

### Backend `.env`
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# M-Pesa
MPESA_ENV=sandbox  # or 'production'

# Backend URL (for callbacks)
BACKEND_URL=https://your-backend.herokuapp.com
PORT=3001
```

## Deployment

### 1. Deploy Backend
- **Heroku**: `git push heroku main`
- **Railway**: Connect GitHub repo
- **Vercel**: Deploy as serverless functions

### 2. Update Callback URLs
After deployment, update each store's M-Pesa callback URLs via the `/register-urls` endpoint.

### 3. Test with Sandbox
Use M-Pesa Sandbox credentials first:
- Consumer Key: Get from Daraja Portal
- Consumer Secret: Get from Daraja Portal
- Till Number: Test till from sandbox
- Test Phone: `254708374149`

## Security Best Practices

1. **Never store credentials in frontend** - Always use backend API
2. **Use service_role key only on backend** - Never expose to frontend
3. **Encrypt credentials in database** - Consider using PostgreSQL encryption
4. **Validate callbacks** - Check that requests come from M-Pesa IPs
5. **Rate limiting** - Prevent abuse of payment endpoints
6. **HTTPS only** - M-Pesa requires HTTPS for callbacks

## Resources

- [Daraja API Docs](https://developer.safaricom.co.ke)
- [M-Pesa Simulator](https://developer.safaricom.co.ke/test_credentials)
- [Callback URL Requirements](https://developer.safaricom.co.ke/Documentation)

## Support

Each store manager configures their own M-Pesa credentials in Settings > Payments > M-Pesa Configuration.
