#!/bin/bash
# Canary Quick Start — One command to launch

echo "☦️  King Backend — Canary Quick Start"
echo "======================================"
echo ""

cd /Users/cyberweasel/.openclaw/workspace/king-backend

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
    echo "⚠️  EDIT REQUIRED: Update .env with your bot tokens"
    echo "   File location: /Users/cyberweasel/.openclaw/workspace/king-backend/.env"
    echo ""
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Type check
echo "🔍 Running type check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ Type errors found. Fix before starting."
    exit 1
fi
echo "✅ Types OK"
echo ""

# Start dev server
echo "🚀 Starting dev server..."
echo ""
echo "   API:        http://localhost:8080"
echo "   BotIndex:   http://localhost:8080/api/botindex/health"
echo "   MemeRadar:  http://localhost:8080/api/memeradar/health"
echo "   ArbWatch:   http://localhost:8080/api/arbwatch/health"
echo ""
npm run dev
