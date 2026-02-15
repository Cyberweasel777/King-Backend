#!/bin/bash
# Big Bang Deployment Script
# Deploys all 15 apps unified in King Backend

set -e

echo "🚀 KING BACKEND BIG BANG DEPLOYMENT"
echo "===================================="
echo ""

# Validate environment
if [ ! -f ".env" ]; then
    echo "❌ .env file not found"
    echo "Run: ./scripts/setup-env.sh"
    exit 1
fi

# Validate API keys
echo "🔍 Validating API keys..."
npm run validate:apis || {
    echo "❌ API validation failed. Fix before deploying."
    exit 1
}

# Run database migration
echo ""
echo "🗄️ Running database migration..."
psql $SUPABASE_URL -f database/migrations/big-bang-migration.sql || {
    echo "❌ Database migration failed"
    exit 1
}

# Build application
echo ""
echo "📦 Building application..."
npm ci
npm run build

# Run tests
echo ""
echo "🧪 Running tests..."
npm test || {
    echo "❌ Tests failed"
    exit 1
}

# Deploy to Fly.io
echo ""
echo "☁️ Deploying to Fly.io..."
cp fly.big-bang.toml fly.toml
fly deploy --app king-backend

# Verify deployment
echo ""
echo "🔍 Verifying deployment..."
sleep 10

HEALTH_STATUS=$(curl -s https://king-backend.fly.dev/health | jq -r '.status')
if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo "✅ Deployment successful!"
else
    echo "❌ Health check failed"
    echo "Rolling back..."
    fly releases list --app king-backend | head -3
    # Manual rollback: fly deploy --app king-backend --image <previous-image>
    exit 1
fi

# Scale to Big Bang capacity
echo ""
echo "📈 Scaling to Big Bang capacity..."
fly scale count api=2 worker=2 --app king-backend

echo ""
echo "===================================="
echo "✅ BIG BANG COMPLETE!"
echo ""
echo "All 15 apps now running on King Backend:"
echo "  API:      https://king-backend.fly.dev"
echo "  Health:   https://king-backend.fly.dev/health"
echo "  Metrics:  https://king-backend.fly.dev/metrics"
echo ""
echo "Process groups:"
echo "  API:      2 machines (shared-cpu-2x, 1GB)"
echo "  Bots:     1 machine  (shared-cpu-2x, 1GB)"
echo "  Pipeline: 1 machine  (shared-cpu-1x, 512MB)"
echo "  Worker:   2 machines (shared-cpu-2x, 1GB)"
echo ""
echo "Logs: fly logs --app king-backend"
echo "Scale: fly scale count api=3 worker=4"
echo ""
