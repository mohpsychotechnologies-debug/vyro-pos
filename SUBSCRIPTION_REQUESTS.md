# Subscription Request System

## Overview
New users can now request subscriptions directly from the public landing page. Admins review and approve these requests from the admin dashboard.

## How It Works

### For New Users:
1. Visit the landing page
2. Click any pricing plan's "Get started" or "Start free trial" button
3. Fill in the subscription request form:
   - Business Name (required)
   - Owner Name (required)
   - Phone Number (required)
   - Email (optional)
   - Business Address (optional)
   - Additional Notes (optional)
4. Submit the request
5. Wait for admin approval (typically within 24 hours)

### For Admins:
1. Login to the Admin Portal
2. Navigate to "Subscription Requests" section (needs to be added)
3. View pending requests with all submitted details
4. Approve or reject requests
5. When approved, a new store is created automatically

## Database Setup

Run this SQL file in Supabase to create the required table:
```
supabase/add_subscription_requests.sql
```

This creates:
- `subscription_requests` table to store all requests
- RLS policies allowing public submissions
- Admin-only view and update permissions
- Helper function to count pending requests

## Features

### Request Form
- Clean modal interface
- Plan pre-selected based on clicked pricing card
- Form validation
- Success confirmation
- Error handling

### Plans Available
- **trial**: Free Trial (7 days)
- **monthly_basic**: KSh 850/month (up to 3 cashiers)
- **monthly_premium**: KSh 1,500/month (up to 5 cashiers)
- **yearly_basic**: KSh 8,500/year (save KSh 1,700)
- **yearly_premium**: KSh 15,000/year (save KSh 3,000)

## Next Steps

### Admin Dashboard Integration (TODO)
Add a "Subscription Requests" page in the SuperAdminApp to:
1. List all pending requests
2. Show request details
3. Approve button → creates new store with selected plan
4. Reject button → marks as rejected with optional reason
5. Show request history (approved/rejected)

### Notification System (Future Enhancement)
- Email notification to user when approved/rejected
- SMS notification option
- Admin notification badge for new requests

## Technical Details

### Files Modified
- `src/PublicSite.jsx` - Added request form modal and wired up pricing buttons
- `src/public-site.css` - Added modal and form styling
- `supabase/add_subscription_requests.sql` - Database schema

### Security
- Anyone can INSERT (public form submissions)
- Only superadmins can SELECT/UPDATE (view and approve)
- RLS policies enforce access control
- No authentication required for form submission
