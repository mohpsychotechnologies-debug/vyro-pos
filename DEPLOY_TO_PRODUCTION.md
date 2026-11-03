# 🚀 Deploy to pos.vyrosocial.com

## Overview

Your VYRO POS will be hosted at: **https://pos.vyrosocial.com**

The backend M-Pesa API will run on the same domain at: **https://pos.vyrosocial.com/api/mpesa**

---

## 📁 Project Structure for Deployment

```
vyro-POS/
├── backend/          # M-Pesa API backend
│   ├── server.js
│   ├── routes/
│   ├── services/
│   └── package.json
├── src/              # React frontend
├── dist/             # Built frontend (after npm run build)
└── package.json
```

---

## 🌐 Deployment Options

### **Option 1: Deploy Both on Same Server (Recommended)**

Deploy frontend and backend together with a reverse proxy:

**Steps:**
1. Build frontend: `npm run build` → creates `dist/` folder
2. Upload both `dist/` and `backend/` to your server
3. Configure Nginx/Apache to:
   - Serve `dist/` at `https://pos.vyrosocial.com`
   - Proxy `/api/mpesa/*` to backend on port 3001

---

### **Option 2: Separate Deployments**

- **Frontend:** Deploy `dist/` to your web server
- **Backend:** Deploy `backend/` to port 3001, accessible at domain

---

## ⚙️ Server Setup (Option 1 - Recommended)

### **1. Install Node.js on Server**

```bash
# On Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

### **2. Upload Files to Server**

```bash
# On your server
cd /var/www
sudo mkdir vyro-pos
cd vyro-pos

# Upload files via FTP/SFTP or git
# Or use rsync:
rsync -avz --exclude 'node_modules' /path/to/local/vyro-POS/ user@server:/var/www/vyro-pos/
```

### **3. Install Dependencies**

```bash
# Frontend dependencies (if needed)
npm install

# Build frontend
npm run build

# Backend dependencies
cd backend
npm install
```

### **4. Configure Environment Variables**

Create `backend/.env` on server:

```env
SUPABASE_URL=https://obxuguzpkktddzubqbpq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=lHbpaW+PUmT0r8LhaPESLIMVceoB9EWLTf/jNk3JphnSOXcnT0FHq43evoDc4R5gXzNycyvilTPzxXbGpQc62g==
MPESA_ENV=production
PORT=3001
BACKEND_URL=https://pos.vyrosocial.com
```

### **5. Setup PM2 (Process Manager)**

Keep backend running 24/7:

```bash
# Install PM2
sudo npm install -g pm2

# Start backend
cd /var/www/vyro-pos/backend
pm2 start server.js --name vyro-mpesa

# Auto-start on reboot
pm2 startup
pm2 save

# Check status
pm2 status
pm2 logs vyro-mpesa
```

---

## 🔧 Nginx Configuration

Create `/etc/nginx/sites-available/vyro-pos`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name pos.vyrosocial.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name pos.vyrosocial.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/pos.vyrosocial.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pos.vyrosocial.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend (React app)
    root /var/www/vyro-pos/dist;
    index index.html;

    # Backend API proxy
    location /api/mpesa {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
    }

    # Frontend routes (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/vyro-pos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔒 SSL Certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d pos.vyrosocial.com

# Auto-renewal (already set up by certbot)
sudo certbot renew --dry-run
```

---

## 🔥 Firewall Configuration

```bash
# Allow HTTP, HTTPS, SSH
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

---

## ✅ Deployment Checklist

- [ ] Node.js installed on server
- [ ] Frontend built (`npm run build`)
- [ ] Files uploaded to `/var/www/vyro-pos/`
- [ ] Backend dependencies installed
- [ ] Backend `.env` configured
- [ ] PM2 running backend
- [ ] Nginx configured and running
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] DNS pointing to server
- [ ] Test: `https://pos.vyrosocial.com`
- [ ] Test: `https://pos.vyrosocial.com/health`
- [ ] Register M-Pesa callbacks in POS Settings

---

## 🧪 Testing After Deployment

1. **Visit:** `https://pos.vyrosocial.com`
2. **Check health:** `https://pos.vyrosocial.com/health`
3. **Login to POS**
4. **Go to Settings > M-Pesa**
5. **Click "Register Callbacks"**
6. **Test STK Push payment**

---

## 📊 Monitoring

```bash
# Backend logs
pm2 logs vyro-mpesa

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Check backend status
pm2 status

# Restart backend if needed
pm2 restart vyro-mpesa
```

---

## 🔄 Updates & Deployment

When you make changes:

```bash
# On local machine
npm run build

# Upload new dist/ folder to server
rsync -avz dist/ user@server:/var/www/vyro-pos/dist/

# If backend changes:
rsync -avz backend/ user@server:/var/www/vyro-pos/backend/
ssh user@server "cd /var/www/vyro-pos/backend && npm install && pm2 restart vyro-mpesa"
```

---

## 🆘 Troubleshooting

**Backend not accessible:**
```bash
pm2 logs vyro-mpesa
netstat -tulpn | grep 3001
```

**Nginx errors:**
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

**M-Pesa callbacks not working:**
- Check backend logs: `pm2 logs vyro-mpesa`
- Verify URL is accessible: `curl https://pos.vyrosocial.com/health`
- Check firewall allows HTTPS

---

## 📞 M-Pesa Callback URLs

After deployment, your M-Pesa callback URLs will be:

- **C2B Callback:** `https://pos.vyrosocial.com/api/mpesa/callback/c2b`
- **STK Callback:** `https://pos.vyrosocial.com/api/mpesa/callback/stk`
- **Validation:** `https://pos.vyrosocial.com/api/mpesa/validation/c2b`

Register these in POS Settings > M-Pesa > Register Callbacks

---

**Need help deploying? Let me know and I'll guide you through each step!** 🚀
