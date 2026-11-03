#!/bin/bash
##############################################################
# VYRO POS - Server Setup Script
# Run this ONCE on your Ubuntu/Debian server as root or sudo
# Usage: chmod +x setup-server.sh && sudo ./setup-server.sh
##############################################################

set -e  # Stop on any error
echo ""
echo "======================================================"
echo "  VYRO POS - Server Setup"
echo "  Domain: pos.vyrosocial.com"
echo "======================================================"
echo ""

# ── 1. Update system ──────────────────────────────────────
echo "📦 Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Install Node.js 18 ─────────────────────────────────
echo "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

echo "✅ Node.js $(node --version), npm $(npm --version)"

# ── 3. Install PM2 ────────────────────────────────────────
echo "📦 Installing PM2..."
npm install -g pm2

# ── 4. Install Nginx ──────────────────────────────────────
echo "📦 Installing Nginx..."
apt-get install -y nginx

# ── 5. Install Certbot ────────────────────────────────────
echo "📦 Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx

# ── 6. Create directories ─────────────────────────────────
echo "📁 Creating directories..."
mkdir -p /var/www/vyro-pos/dist
mkdir -p /var/www/vyro-pos/backend
mkdir -p /var/log/vyro-pos

# Set permissions
chown -R www-data:www-data /var/www/vyro-pos
chmod -R 755 /var/www/vyro-pos

# ── 7. Configure firewall ─────────────────────────────────
echo "🔒 Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── 8. Done ───────────────────────────────────────────────
echo ""
echo "======================================================"
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Upload dist/ to /var/www/vyro-pos/dist/"
echo "  2. Upload backend/ to /var/www/vyro-pos/backend/"
echo "  3. Run: ./deploy.sh"
echo "======================================================"
