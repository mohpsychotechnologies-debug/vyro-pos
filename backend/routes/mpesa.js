const express = require('express');
const router = express.Router();
const mpesaService = require('../services/mpesaService');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * STK Push - Initiate payment from customer's phone
 * POST /api/mpesa/stk-push
 * Body: { storeId, phoneNumber, amount, billRefNumber, saleId }
 */
router.post('/stk-push', async (req, res) => {
  try {
    const { storeId, phoneNumber, amount, billRefNumber, saleId } = req.body;

    // Validate input
    if (!storeId || !phoneNumber || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: storeId, phoneNumber, amount' 
      });
    }

    console.log(`STK Push request for store ${storeId}: ${amount} to ${phoneNumber}`);

    // Get store's M-Pesa credentials
    const { data: creds, error: credsError } = await supabase
      .rpc('get_mpesa_credentials', { p_store_id: storeId });

    if (credsError || !creds) {
      console.error('Credentials error:', credsError);
      return res.status(404).json({ 
        success: false,
        error: 'M-Pesa credentials not configured for this store. Please configure in Settings > Payments.'
      });
    }

    const credentials = typeof creds === 'string' ? JSON.parse(creds) : creds;

    if (!credentials.is_active) {
      return res.status(403).json({ 
        success: false,
        error: 'M-Pesa integration is disabled for this store'
      });
    }

    // Get M-Pesa access token
    const accessToken = await mpesaService.getAccessToken(
      credentials.consumer_key,
      credentials.consumer_secret
    );

    // Initiate STK Push
    const response = await mpesaService.stkPush({
      accessToken,
      businessShortcode: credentials.business_shortcode,
      passkey: credentials.passkey,
      phoneNumber,
      amount,
      billRefNumber: billRefNumber || 'VYRO-POS',
      callbackUrl: `${process.env.BACKEND_URL}/api/mpesa/callback/stk`
    });

    console.log('STK Push response:', response);

    // Log transaction
    const { data: transId } = await supabase.rpc('log_mpesa_transaction', {
      p_store_id: storeId,
      p_transaction_type: 'STK_PUSH',
      p_transaction_id: response.CheckoutRequestID || response.requestId,
      p_amount: amount,
      p_phone_number: phoneNumber,
      p_bill_ref_number: billRefNumber,
      p_raw_response: response,
      p_sale_id: saleId || null
    });

    res.json({ 
      success: true, 
      message: 'Payment request sent. Please check your phone.',
      data: {
        checkoutRequestId: response.CheckoutRequestID,
        merchantRequestId: response.MerchantRequestID,
        responseDescription: response.ResponseDescription || response.CustomerMessage
      }
    });
  } catch (error) {
    console.error('STK Push error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to initiate payment'
    });
  }
});

/**
 * Query STK Push status
 * POST /api/mpesa/stk-query
 * Body: { storeId, checkoutRequestId }
 */
router.post('/stk-query', async (req, res) => {
  try {
    const { storeId, checkoutRequestId } = req.body;

    // Get store's M-Pesa credentials
    const { data: creds } = await supabase
      .rpc('get_mpesa_credentials', { p_store_id: storeId });

    const credentials = typeof creds === 'string' ? JSON.parse(creds) : creds;

    // Get access token
    const accessToken = await mpesaService.getAccessToken(
      credentials.consumer_key,
      credentials.consumer_secret
    );

    // Query transaction status
    const response = await mpesaService.stkQuery({
      accessToken,
      businessShortcode: credentials.business_shortcode,
      passkey: credentials.passkey,
      checkoutRequestId
    });

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('STK Query error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * C2B Callback - M-Pesa sends payment confirmation here
 * POST /api/mpesa/callback/c2b
 */
router.post('/callback/c2b', async (req, res) => {
  try {
    const payload = req.body;
    console.log('📱 C2B Callback received:', JSON.stringify(payload, null, 2));

    const {
      TransID,
      TransAmount,
      MSISDN,
      BillRefNumber,
      BusinessShortCode,
      OrgAccountBalance
    } = payload;

    // Find store by business shortcode
    const { data: creds } = await supabase
      .from('mpesa_credentials')
      .select('store_id')
      .eq('business_shortcode', BusinessShortCode)
      .eq('is_active', true)
      .single();

    if (!creds) {
      console.error('❌ Store not found for shortcode:', BusinessShortCode);
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    console.log('✓ Store found:', creds.store_id);

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

    console.log('✓ Transaction logged successfully');

    // Respond to M-Pesa
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('❌ C2B Callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

/**
 * STK Push Callback - M-Pesa sends STK result here
 * POST /api/mpesa/callback/stk
 */
router.post('/callback/stk', async (req, res) => {
  try {
    const { Body } = req.body;
    const { stkCallback } = Body;

    console.log('📱 STK Callback received:', JSON.stringify(stkCallback, null, 2));

    const { 
      MerchantRequestID,
      CheckoutRequestID, 
      ResultCode, 
      ResultDesc,
      CallbackMetadata 
    } = stkCallback;

    // Extract metadata if payment successful
    let amount, phoneNumber, mpesaReceiptNumber;
    if (ResultCode === 0 && CallbackMetadata) {
      const items = CallbackMetadata.Item || [];
      amount = items.find(i => i.Name === 'Amount')?.Value;
      phoneNumber = items.find(i => i.Name === 'PhoneNumber')?.Value;
      mpesaReceiptNumber = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    }

    console.log(`STK Result: ${ResultCode === 0 ? '✓ Success' : '✗ Failed'} - ${ResultDesc}`);

    // Update transaction status
    await supabase.rpc('update_mpesa_transaction_status', {
      p_transaction_id: CheckoutRequestID,
      p_status: ResultCode === 0 ? 'completed' : 'failed',
      p_result_code: String(ResultCode),
      p_result_desc: ResultDesc
    });

    // If successful and we have receipt number, create a completed transaction record
    if (ResultCode === 0 && mpesaReceiptNumber) {
      // Try to find the original transaction to get store_id
      const { data: origTx } = await supabase
        .from('mpesa_transactions')
        .select('store_id, sale_id')
        .eq('transaction_id', CheckoutRequestID)
        .single();

      if (origTx) {
        // Log the successful payment with M-Pesa receipt
        await supabase.rpc('log_mpesa_transaction', {
          p_store_id: origTx.store_id,
          p_transaction_type: 'C2B',
          p_transaction_id: mpesaReceiptNumber,
          p_amount: amount,
          p_phone_number: String(phoneNumber),
          p_bill_ref_number: `STK-${CheckoutRequestID}`,
          p_result_code: '0',
          p_result_desc: 'Completed',
          p_raw_response: stkCallback,
          p_sale_id: origTx.sale_id
        });
      }
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('❌ STK Callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

/**
 * Validation endpoint (optional, for C2B validation)
 * POST /api/mpesa/validation/c2b
 */
router.post('/validation/c2b', async (req, res) => {
  console.log('🔍 Validation request:', req.body);
  // Accept all payments by default
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

/**
 * Register C2B URLs with M-Pesa
 * POST /api/mpesa/register-urls
 * Body: { storeId }
 */
router.post('/register-urls', async (req, res) => {
  try {
    const { storeId } = req.body;

    // Get store's M-Pesa credentials
    const { data: creds } = await supabase
      .rpc('get_mpesa_credentials', { p_store_id: storeId });

    if (!creds) {
      return res.status(404).json({ 
        success: false,
        error: 'M-Pesa credentials not found' 
      });
    }

    const credentials = typeof creds === 'string' ? JSON.parse(creds) : creds;

    // Get access token
    const accessToken = await mpesaService.getAccessToken(
      credentials.consumer_key,
      credentials.consumer_secret
    );

    // Register URLs
    const response = await mpesaService.registerUrls({
      accessToken,
      businessShortcode: credentials.business_shortcode,
      confirmationUrl: `${process.env.BACKEND_URL}/api/mpesa/callback/c2b`,
      validationUrl: `${process.env.BACKEND_URL}/api/mpesa/validation/c2b`
    });

    console.log('URL registration response:', response);

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Register URLs error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Test credentials
 * POST /api/mpesa/test-credentials
 * Body: { consumerKey, consumerSecret }
 */
router.post('/test-credentials', async (req, res) => {
  try {
    const { consumerKey, consumerSecret } = req.body;

    // Try to get access token
    const accessToken = await mpesaService.getAccessToken(
      consumerKey,
      consumerSecret
    );

    res.json({ 
      success: true, 
      message: 'Credentials are valid!',
      tokenPreview: accessToken.substring(0, 20) + '...'
    });
  } catch (error) {
    res.status(401).json({ 
      success: false,
      error: 'Invalid credentials. Please check your Consumer Key and Consumer Secret.'
    });
  }
});

module.exports = router;
