#!/bin/bash
# Big Bang Environment Consolidation Script
# Merges 15 separate .env files into unified King Backend .env

set -e

echo "🔄 King Backend Big Bang Environment Setup"
echo "=========================================="

OUTPUT_FILE=".env"

# Start with base configuration
cat > $OUTPUT_FILE << 'EOF'
# King Backend Environment Configuration
# Big Bang: All 15 apps unified
# Generated: $(date)

# ============================================
# INFRASTRUCTURE
# ============================================

# Supabase (Shared database)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=

# Redis (Shared cache & queues)
REDIS_URL=redis://localhost:6379

# Server
PORT=8080
NODE_ENV=production
JWT_SECRET=
LOG_LEVEL=info

# ============================================
# TELEGRAM BOT TOKENS (15 bots)
# ============================================

# Original 8
SPREADHUNTER_BOT_TOKEN=
DECKVAULT_BOT_TOKEN=
PACKPAL_BOT_TOKEN=
DROPSCOUT_BOT_TOKEN=
SKINSIGNAL_BOT_TOKEN=
MEMERADAR_BOT_TOKEN=
ROSTERRADAR_BOT_TOKEN=
ARBWATCH_BOT_TOKEN=

# Phase 1
NFTPULSE_BOT_TOKEN=
DROPFARM_BOT_TOKEN=
LAUNCHRADAR_BOT_TOKEN=

# Phase 2
SOCIALINDEX_BOT_TOKEN=
MEMESTOCK_BOT_TOKEN=
POINTTRACK_BOT_TOKEN=

# Just Built
BOTINDEX_BOT_TOKEN=

# ============================================
# DISCORD BOT TOKENS (3 bots)
# ============================================

MEMERADAR_DISCORD_TOKEN=
SOCIALINDEX_DISCORD_TOKEN=
BOTINDEX_DISCORD_TOKEN=

# ============================================
# EXTERNAL APIs
# ============================================

# Moltbook (AI agent social validation)
MOLTBOOK_API_KEY=

# Bitquery (On-chain analytics)
BITQUERY_API_KEY=

# Moralis (Multi-chain data)
MORALIS_API_KEY=

# DEX Screener (Pricing) - Optional, mostly public
DEXSCREENER_API_KEY=

# ============================================
# PAYMENTS
# ============================================

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# ============================================
# FEATURE FLAGS
# ============================================

ENABLE_CORRELATION=true
ENABLE_AI_AGENTS=true

EOF

echo ""
echo "✅ Template created: $OUTPUT_FILE"
echo ""
echo "Next steps:"
echo "1. Fill in all API keys and tokens"
echo "2. Run: npm run validate:apis"
echo "3. Deploy: fly deploy"
echo ""
echo "To extract tokens from existing apps:"
echo "  grep BOT_TOKEN ../spreadhunter/.env >> $OUTPUT_FILE"
echo "  (Repeat for all 15 apps)"
