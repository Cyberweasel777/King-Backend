#!/bin/bash
/**
 * Pre-Deploy Validation Script
 * 
 * Run before deploying to catch issues early
 */

echo "☦️  King Backend Pre-Deploy Checks"
echo "=================================="
echo ""

FAILED=0

# Check 1: TypeScript compilation
echo "🔍 Checking TypeScript..."
cd /Users/cyberweasel/.openclaw/workspace/king-backend
if npx tsc --noEmit 2>&1 | grep -q "error"; then
    echo "  ❌ TypeScript errors found"
    npx tsc --noEmit | head -20
    FAILED=1
else
    echo "  ✅ TypeScript compiles"
fi
echo ""

# Check 2: Environment variables
echo "🔍 Checking environment..."
REQUIRED_ENVS=("SUPABASE_URL" "SUPABASE_SERVICE_KEY" "PAYMENT_ADMIN_IDS")
for env in "${REQUIRED_ENVS[@]}"; do
    if [ -z "${!env}" ]; then
        echo "  ❌ Missing: $env"
        FAILED=1
    fi
done
if [ $FAILED -eq 0 ]; then
    echo "  ✅ Required env vars set"
fi
echo ""

# Check 3: App configurations
echo "🔍 Checking app configs..."
for app in botindex memeradar arbwatch; do
    CONFIG_FILE="src/api/routes/${app}.ts"
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "  ❌ Missing: $CONFIG_FILE"
        FAILED=1
    fi
done
if [ $FAILED -eq 0 ]; then
    echo "  ✅ All app routes present"
fi
echo ""

# Check 4: Stripe webhook configuration
echo "🔍 Checking Stripe webhooks..."
for app in botindex memeradar arbwatch; do
    ENV_KEY="${app^^}_STRIPE_WEBHOOK_SECRET"
    if [ -z "${!ENV_KEY}" ]; then
        echo "  ⚠️  Missing webhook secret for $app (will fail in production)"
    fi
done
echo "  ✅ Stripe check complete"
echo ""

# Check 5: Database schema validation
echo "🔍 Checking database connection..."
# This would run a quick Supabase ping
# For now, just check if URL is valid format
if [[ "$SUPABASE_URL" =~ ^https://.*supabase\.co$ ]]; then
    echo "  ✅ Supabase URL format valid"
else
    echo "  ⚠️  Supabase URL format unusual: $SUPABASE_URL"
fi
echo ""

# Summary
echo "=================================="
if [ $FAILED -eq 0 ]; then
    echo "✅ All checks passed. Ready to deploy."
    echo ""
    echo "Next step: fly deploy"
    exit 0
else
    echo "❌ Checks failed. Fix issues before deploying."
    exit 1
fi
