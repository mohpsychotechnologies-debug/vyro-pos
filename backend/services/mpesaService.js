const axios = require('axios');

const MPESA_ENV = process.env.MPESA_ENV || 'sandbox';

const BASE_URL = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

/**
 * Get OAuth access token from M-Pesa
 */
async function getAccessToken(consumerKey, consumerSecret) {
  try {
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
  } catch (error) {
    console.error('Access token error:', error.response?.data || error.message);
    throw new Error('Failed to get M-Pesa access token. Check credentials.');
  }
}

/**
 * Initiate STK Push (Lipa Na M-Pesa Online)
 */
async function stkPush({
  accessToken,
  businessShortcode,
  passkey,
  phoneNumber,
  amount,
  billRefNumber,
  callbackUrl
}) {
  try {
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, -3);

    const password = Buffer.from(
      `${businessShortcode}${passkey}${timestamp}`
    ).toString('base64');

    // Format phone number: remove leading 0, ensure 254 prefix
    let phone = phoneNumber.trim();
    if (phone.startsWith('0')) {
      phone = '254' + phone.slice(1);
    } else if (phone.startsWith('+254')) {
      phone = phone.slice(1);
    } else if (!phone.startsWith('254')) {
      phone = '254' + phone;
    }

    const payload = {
      BusinessShortCode: businessShortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.floor(Number(amount)),
      PartyA: phone,
      PartyB: businessShortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: billRefNumber || 'VYRO-POS',
      TransactionDesc: 'Payment for goods/services'
    };

    console.log('STK Push payload:', { ...payload, Password: '***' });

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('STK Push error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.errorMessage || 
      'Failed to initiate M-Pesa payment'
    );
  }
}

/**
 * Query STK Push transaction status
 */
async function stkQuery({
  accessToken,
  businessShortcode,
  passkey,
  checkoutRequestId
}) {
  try {
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, -3);

    const password = Buffer.from(
      `${businessShortcode}${passkey}${timestamp}`
    ).toString('base64');

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: businessShortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('STK Query error:', error.response?.data || error.message);
    throw new Error('Failed to query payment status');
  }
}

/**
 * Register C2B URLs with M-Pesa
 */
async function registerUrls({
  accessToken,
  businessShortcode,
  confirmationUrl,
  validationUrl
}) {
  try {
    const response = await axios.post(
      `${BASE_URL}/mpesa/c2b/v2/registerurl`,
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
  } catch (error) {
    // Return full M-Pesa error for debugging
    const mpesaError = error.response?.data;
    console.error('Register URLs error:', JSON.stringify(mpesaError || error.message));
    throw new Error(
      mpesaError?.errorMessage || 
      mpesaError?.ResponseDescription ||
      mpesaError?.ResultDesc ||
      JSON.stringify(mpesaError) ||
      'Failed to register callback URLs'
    );
  }
}

module.exports = {
  getAccessToken,
  stkPush,
  stkQuery,
  registerUrls
};
