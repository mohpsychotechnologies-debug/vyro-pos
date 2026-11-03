# VYRO POS M-Pesa Backend

Express.js backend server for handling M-Pesa C2B integrations.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase and M-Pesa settings

# Start server
npm start

# For development (auto-restart)
npm run dev
```

## Endpoints

### POST `/api/mpesa/stk-push`
Initiate M-Pesa STK Push payment

**Request:**
```json
{
  "storeId": "uuid",
  "phoneNumber": "254712345678",
  "amount": 100,
  "billRefNumber": "SALE-123",
  "saleId": "uuid" (optional)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment request sent",
  "data": {
    "checkoutRequestId": "...",
    "merchantRequestId": "...",
    "responseDescription": "Success"
  }
}
```

### POST `/api/mpesa/callback/c2b`
M-Pesa sends payment confirmations here (handled automatically)

### POST `/api/mpesa/callback/stk`
M-Pesa sends STK Push results here (handled automatically)

### POST `/api/mpesa/register-urls`
Register callback URLs with M-Pesa

**Request:**
```json
{
  "storeId": "uuid"
}
```

### POST `/api/mpesa/test-credentials`
Test if M-Pesa credentials are valid

**Request:**
```json
{
  "consumerKey": "your-key",
  "consumerSecret": "your-secret"
}
```

## Environment Variables

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MPESA_ENV=sandbox  # or 'production'
PORT=3001
BACKEND_URL=http://localhost:3001
```

## Deployment

See main `MPESA_SETUP_GUIDE.md` for deployment instructions.

## Testing

Use M-Pesa Sandbox:
- Test phone: `254708374149`
- Test shortcode: `174379`
- Test passkey: `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`
