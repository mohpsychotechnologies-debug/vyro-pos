# 🚀 Deploy Backend to Railway (5 Minutes)

Railway gives you a **permanent HTTPS URL** for free - perfect for M-Pesa callbacks!

## Why Railway?
- ✅ Free tier (no credit card needed)
- ✅ Permanent HTTPS URL
- ✅ Auto-deploys from GitHub
- ✅ Built-in environment variables
- ✅ Works perfectly with M-Pesa

---

## 📋 Step-by-Step Deployment

### **Step 1: Sign Up for Railway**

1. Go to: https://railway.app
2. Click **"Start a New Project"** or **"Login"**
3. Sign up with **GitHub** (easiest - auto-connects your repos)

---

### **Step 2: Push Backend to GitHub**

**Open PowerShell in your project root:**

```powershell
# Initialize git (if not already)
cd C:\Users\hp\OneDrive\Desktop\vyro-POS
git init

# Add all files
git add .

# Commit
git commit -m "M-Pesa backend ready for deployment"

# Create repo on GitHub (or use existing)
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/vyro-pos.git
git branch -M main
git push -u origin main
```

---

### **Step 3: Deploy on Railway**

1. **Go to Railway Dashboard:** https://railway.app/dashboard
2. **Click "New Project"**
3. **Select "Deploy from GitHub repo"**
4. **Choose your `vyro-pos` repository**
5. **Railway will auto-detect it's a Node.js app**
6. **Click on the deployment**
7. **Go to Settings > Generate Domain**
8. **You'll get a URL like:** `vyro-pos-production.up.railway.app`

---

### **Step 4: Add Environment Variables**

In Railway dashboard:

1. Click on your project
2. Go to **Variables** tab
3. Add these variables:

```
SUPABASE_URL=https://obxuguzpkktddzubqbpq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=lHbpaW+PUmT0r8LhaPESLIMVceoB9EWLTf/jNk3JphnSOXcnT0FHq43evoDc4R5gXzNycyvilTPzxXbGpQc62g==
MPESA_ENV=sandbox
PORT=3001
BACKEND_URL=https://YOUR-APP.up.railway.app
```

*Replace `YOUR-APP.up.railway.app` with your actual Railway URL*

4. **Click "Deploy"** or it will auto-deploy

---

### **Step 5: Update Frontend**

Edit your main `.env` file:

```env
VITE_BACKEND_URL=https://YOUR-APP.up.railway.app
```

---

### **Step 6: Register M-Pesa Callbacks**

1. Login to POS
2. Go to Settings > M-Pesa
3. Click **"Register Callbacks"**

Done! ✅

---

## 🔄 Alternative: Use Railway CLI (Faster)

```powershell
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
cd backend
railway init

# Deploy
railway up

# Add environment variables
railway variables set SUPABASE_URL=https://obxuguzpkktddzubqbpq.supabase.co
railway variables set SUPABASE_SERVICE_ROLE_KEY=your-key-here
railway variables set MPESA_ENV=sandbox

# Get your URL
railway domain
```

---

## 📊 After Deployment

Your backend will be at:
```
https://your-app.up.railway.app
```

**Permanent, HTTPS, works perfectly with M-Pesa!** 🎉

---

## 💡 Tips

- Railway auto-deploys on every `git push`
- View logs in Railway dashboard
- Free tier: 500 hours/month (plenty for testing)
- Upgrade later if needed ($5/month for production)

---

**Need help?** Railway docs: https://docs.railway.app
