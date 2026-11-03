#!/bin/bash
# Development start script for M-Pesa backend

echo "🚀 Starting VYRO POS M-Pesa Backend (Development Mode)"
echo "======================================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "✅ .env file created. Please edit it with your credentials:"
    echo "   - SUPABASE_URL"
    echo "   - SUPABASE_SERVICE_ROLE_KEY"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "✅ Starting server..."
echo ""
npm run dev
