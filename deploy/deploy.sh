#!/bin/bash
##############################################################
# VYRO POS - Deploy Script
# Run this on your server after uploading files
# Usage: chmod +x deploy.sh && ./deploy.sh
##############################################################

set -e
echo ""
echo "======================================================"
echo "  VYRO POS - Deploying to pos.vyrosocial.com"
echo "======================================================"
echo ""

DOMAIN="pos.vyrosocial.com"
APP_DIR="/var/www/vyro-pos"
BACKEND_DIR="$APP_DIR/backend"

# ── 1. Install backend dependencies ───────────────────────
echo "📦 Installing backend dependencies..."
cd $BACKEND_DIR
npm install --production

# ── 2. Setup .env if not exists ───────────────────────────
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "⚠️  No .env found! Creating from example..."
    cp $BACKEND_DIR/.env.example $BACKEND_DIR/.env
    echo ""
    echo "⚠️  IMPORTANT: Edit $BACKEND_DIR/.env before continuing!"
    echo "   Add your Supabase service role key!"
    echo ""
    read -p "Press ENTER after editing .env to continue..."
fi

# ── 3. Configure Nginx ────────────────────────────────────
echo "⚙️  Configuring Nginx..."
cp /var/www/vyro-pos/deploy/nginx.conf /etc/nginx/sites-available/vyro-pos

# Remove default site if exists
rm -f /etc/nginx/sites-enabled/default

# Enable our site
ln -sf /etc/nginx/sites-available/vyro-pos /etc/nginx/sites-enabled/vyro-pos

# Test Nginx config
nginx -t

# ── 4. Get SSL certificate ────────────────────────────────
echo "🔒 Getting SSL certificate..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@vyrosocial.com || {
    echo "⚠️  Certbot failed. Continuing without SSL for now."
    echo "   Run manually: sudo certbot --nginx -d $DOMAIN"
}

# ── 5. Start/Restart backend with PM2 ────────────────────
echo "🚀 Starting backend server..."
cd /var/www/vyro-pos

# Create log dir
mkdir -p /var/log/vyro-pos

# Start or restart PM2
if pm2 list | grep -q "vyro-mpesa"; then
    pm2 restart vyro-mpesa
    echo "✅ Backend restarted"
else
    pm2 start deploy/ecosystem.config.js
    echo "✅ Backend started"
fi

# Save PM2 process list
pm2 save

# Setup PM2 startup (auto-start on reboot)
pm2 startup systemd -u root --hp /root

# ── 6. Reload Nginx ───────────────────────────────────────
echo "🔄 Reloading Nginx..."
systemctl reload nginx

# ── 7. Verify deployment ──────────────────────────────────
echo ""
echo "🧪 Testing deployment..."
sleep 3

if curl -sf "https://$DOMAIN/health" > /dev/null 2>&1; then
    echo "✅ Backend health check: PASSED"
    curl -s "https://$DOMAIN/health"
elif curl -sf "http://localhost:3001/health" > /dev/null 2>&1; then
    echo "✅ Backend running locally (SSL may be pending)"
else
    echo "⚠️  Backend not responding - check: pm2 logs vyro-mpesa"
fi

echo ""
echo "======================================================"
echo "🎉 Deployment Complete!"
echo ""
echo "  Frontend: https://$DOMAIN"
echo "  Backend:  https://$DOMAIN/health"
echo ""
echo "  M-Pesa Callbacks:"
echo "  → https://$DOMAIN/api/mpesa/callback/c2b"
echo "  → https://$DOMAIN/api/mpesa/callback/stk"
echo ""
echo "  Next:"
echo "  1. Open POS: https://$DOMAIN"
echo "  2. Login → Settings → M-Pesa → Register Callbacks"
echo "======================================================"
