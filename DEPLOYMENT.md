# Vyro POS - Deployment Guide

## Prerequisites

1. **Supabase Project** - Create at [supabase.com](https://supabase.com)
2. **Domain** (optional) - for custom domain
3. **Hosting Platform** - Choose one:
   - Vercel (recommended)
   - Netlify
   - GitHub Pages
   - Your own server

---

## Step 1: Database Setup (Supabase)

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Note your project URL and anon key

### 1.2 Run SQL Migrations
In Supabase SQL Editor, run these files **in order**:

```sql
-- 1. Base schema
supabase/schema.sql

-- 2. Subscriptions
supabase/add_subscriptions.sql

-- 3. Subscription requests
supabase/add_subscription_requests.sql

-- 4. Payment approval
supabase/add_payment_approval.sql

-- 5. Email authentication (PIN → Email/Password)
supabase/add_email_auth.sql
```

### 1.3 Create Super Admin User
After running migrations, your default admin credentials are:
- **Email:** `admin@vyrosocial.com`
- **Password:** `Hussein@4`

⚠️ **Change these immediately after first login!**

---

## Step 2: Environment Variables

### 2.1 Create `.env` file
Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

You can find these in:
- Supabase Dashboard → Settings → API

---

## Step 3: Deploy to Vercel (Recommended)

### 3.1 Install Vercel CLI (optional)
```bash
npm i -g vercel
```

### 3.2 Deploy via GitHub
1. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/vyro-pos.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com)
3. Import your GitHub repository
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy!

### 3.3 Deploy via CLI
```bash
vercel
```
Follow the prompts and add environment variables when asked.

---

## Step 4: Deploy to Netlify

### 4.1 Via Netlify UI
1. Push code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. New site from Git → Choose your repo
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables in Site settings → Environment variables
6. Deploy!

### 4.2 Via Netlify CLI
```bash
npm i -g netlify-cli
netlify deploy --prod
```

---

## Step 5: Deploy to Your Own Server

### 5.1 Build for production
```bash
npm run build
```

### 5.2 Upload `dist/` folder
Upload the entire `dist/` folder to your server.

### 5.3 Configure web server

**Nginx:**
```nginx
server {
    listen 80;
    server_name vyropos.com;
    root /var/www/vyro-pos/dist;
    index index.html;

    # SPA routing - redirect all to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Apache (.htaccess in `dist/`):**
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

---

## Step 6: Post-Deployment Checklist

### ✅ Security
- [ ] Change default admin password
- [ ] Verify RLS policies are active in Supabase
- [ ] Enable Supabase Auth email verification (optional)
- [ ] Set up custom domain with HTTPS

### ✅ Configuration
- [ ] Update payment config in admin panel (M-Pesa details)
- [ ] Configure subscription plans
- [ ] Set up email templates (optional)

### ✅ Testing
- [ ] Test super admin login
- [ ] Create test store and manager
- [ ] Process test sale
- [ ] Test subscription renewal
- [ ] Test on mobile devices

---

## Environment-Specific Builds

### Production Build
```bash
npm run build
```
Creates optimized build in `dist/`

### Preview Production Build
```bash
npm run preview
```
Serves production build locally at `http://localhost:4173`

---

## Troubleshooting

### Issue: "Supabase not configured"
**Solution:** Check `.env` file has correct Supabase URL and key.

### Issue: Login not working
**Solution:** 
1. Verify SQL migrations ran successfully
2. Check super admin user exists in `pos_users` table
3. Verify email/password in Supabase dashboard

### Issue: 404 on page refresh
**Solution:** Your hosting needs SPA routing configured. See deployment configs above.

### Issue: Products not loading
**Solution:** 
1. Check browser console for errors
2. Verify Supabase connection
3. Check RLS policies allow reads

---

## Custom Domain Setup

### Vercel
1. Go to Project Settings → Domains
2. Add your domain
3. Update DNS records as shown

### Netlify
1. Go to Domain management → Add custom domain
2. Follow DNS instructions

---

## Monitoring & Maintenance

### Database Backups
Supabase provides automatic backups. Download manual backups from:
- Dashboard → Database → Backups

### Performance Monitoring
- Check Supabase Dashboard → Logs
- Monitor Vercel/Netlify analytics
- Set up error tracking (Sentry, LogRocket, etc.)

### Updates
```bash
git pull origin main
npm install
npm run build
vercel --prod  # or your deployment method
```

---

## Support

For issues:
1. Check browser console (F12)
2. Check Supabase logs
3. Review `README.md` and this deployment guide

---

## Quick Start (TL;DR)

```bash
# 1. Setup Supabase & run migrations
# 2. Configure .env
echo "VITE_SUPABASE_URL=your-url" > .env
echo "VITE_SUPABASE_ANON_KEY=your-key" >> .env

# 3. Build
npm run build

# 4. Deploy to Vercel
npx vercel --prod

# Or deploy to Netlify
npx netlify-cli deploy --prod --dir=dist
```

**First login:** `admin@vyrosocial.com` / `Hussein@4`

🎉 **You're live!**
