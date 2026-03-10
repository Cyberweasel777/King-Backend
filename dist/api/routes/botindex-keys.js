"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const zod_1 = require("zod");
const logger_1 = __importDefault(require("../../config/logger"));
const apiKeyAuth_1 = require("../middleware/apiKeyAuth");
const conversion_funnel_1 = require("../../services/botindex/conversion-funnel");
const key_delivery_email_1 = require("../../services/botindex/key-delivery-email");
const router = (0, express_1.Router)();
const SUCCESS_URL = 'https://api.botindex.dev/api/botindex/keys/success?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL = 'https://api.botindex.dev/api/botindex/keys/cancel';
const PORTAL_RETURN_URL = 'https://api.botindex.dev/api/botindex/keys/cancel';
const ADMIN_ID = process.env.ADMIN_ID || '8063432083';
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    plan: zod_1.z.enum(['basic', 'pro']).optional(),
});
function getStripeClient() {
    const stripeSecretKey = process.env.BOTINDEX_STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
        throw new Error('BOTINDEX_STRIPE_SECRET_KEY is not configured');
    }
    return new stripe_1.default(stripeSecretKey, { apiVersion: '2025-02-24.acacia' });
}
function getPlanPriceId(plan) {
    const basic = process.env.BOTINDEX_STRIPE_PRICE_BASIC;
    const pro = process.env.BOTINDEX_STRIPE_PRICE_PRO;
    const byPlan = {
        free: undefined,
        basic,
        pro,
    };
    const priceId = byPlan[plan];
    if (!priceId) {
        throw new Error(`Missing Stripe price ID for plan "${plan}"`);
    }
    return priceId;
}
function resolvePlanFromSession(session) {
    const plan = session.metadata?.plan;
    if (plan === 'pro')
        return 'pro';
    if (plan === 'basic')
        return 'basic';
    return 'basic';
}
async function resolveEmailFromSession(stripe, session) {
    const fromSession = session.customer_details?.email || session.metadata?.email;
    if (fromSession)
        return fromSession;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!customerId)
        return null;
    const customer = await stripe.customers.retrieve(customerId);
    if (typeof customer === 'string' || customer.deleted) {
        return null;
    }
    return customer.email || null;
}
// GET /register — browser-friendly: redirects straight to Stripe Checkout
router.get('/register', async (req, res) => {
    try {
        const planParam = req.query.plan;
        const plan = (planParam === 'free') ? 'free' : (planParam === 'pro') ? 'pro' : 'basic';
        if (plan === 'free') {
            (0, conversion_funnel_1.trackFunnelEvent)('register_page_hit', 'free');
            (0, conversion_funnel_1.trackFunnelEvent)('checkout_completed', 'free');
            const apiKey = (0, apiKeyAuth_1.generateApiKey)();
            (0, apiKeyAuth_1.createApiKeyEntry)({
                apiKey,
                email: 'free-tier@botindex.dev',
                plan: 'free',
            });
            (0, conversion_funnel_1.trackFunnelEvent)('api_key_issued', 'free');
            const acceptsHtml = (req.headers.accept || '').includes('text/html');
            if (acceptsHtml) {
                res.setHeader('Content-Type', 'text/html');
                res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BotIndex — Your Free API Key</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 24px; }
    .card { max-width: 520px; width: 100%; border: 1px solid #27272a; border-radius: 16px; background: #18181b; padding: 32px; }
    h1 { font-size: 24px; color: #fff; margin-bottom: 8px; }
    .subtitle { color: #a1a1aa; font-size: 14px; margin-bottom: 24px; }
    .key-box { background: #0a0a0a; border: 1px solid #22d3ee40; border-radius: 8px; padding: 16px; margin-bottom: 16px; word-break: break-all; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 14px; color: #22d3ee; cursor: pointer; position: relative; }
    .key-box:hover { border-color: #22d3ee; }
    .key-box::after { content: 'Click to copy'; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 11px; color: #71717a; font-family: -apple-system, sans-serif; }
    .copied .key-box::after { content: 'Copied ✓'; color: #22d3ee; }
    .badge { display: inline-block; background: #22d3ee15; color: #22d3ee; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 500; margin-bottom: 20px; }
    .warning { background: #f59e0b15; border: 1px solid #f59e0b30; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #fbbf24; margin-bottom: 20px; }
    .next-steps { margin-top: 20px; }
    .next-steps h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; margin-bottom: 12px; }
    .step { background: #0a0a0a; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; font-size: 13px; }
    .step code { color: #22d3ee; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
    .links { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
    .links a { display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; text-decoration: none; transition: background 0.15s; }
    .links .primary { background: #22d3ee20; color: #22d3ee; border: 1px solid #22d3ee40; }
    .links .primary:hover { background: #22d3ee30; }
    .links .secondary { background: #27272a; color: #e5e5e5; border: 1px solid #3f3f46; }
    .links .secondary:hover { background: #3f3f46; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <h1>Your API Key</h1>
    <p class="subtitle">BotIndex Free Tier — 3 requests per hour</p>
    <span class="badge">FREE</span>
    <div class="key-box" id="keyBox" onclick="copyKey()">${apiKey}</div>
    <div class="warning">⚠️ Save this key now. It won't be shown again.</div>
    <div class="next-steps">
      <h2>Quick Start</h2>
      <div class="step">
        <strong>Test it:</strong><br>
        <code>curl -H "X-API-Key: ${apiKey}" https://api.botindex.dev/api/botindex/v1/signals</code>
      </div>
      <div class="step">
        <strong>MCP Config:</strong><br>
        <code>{ "env": { "BOTINDEX_API_KEY": "${apiKey}" } }</code>
      </div>
    </div>
    <div class="links">
      <a href="https://botindex.dev" class="primary">Documentation</a>
      <a href="https://aar.botindex.dev" class="secondary">AAR Trust Layer</a>
      <a href="https://api.botindex.dev/api/botindex/keys/register?plan=basic" class="secondary">Upgrade to Basic</a>
    </div>
  </div>
  <script>
    function copyKey() {
      navigator.clipboard.writeText('${apiKey}');
      document.getElementById('card').classList.add('copied');
      setTimeout(() => document.getElementById('card').classList.remove('copied'), 2000);
    }
  </script>
</body>
</html>`);
                return;
            }
            res.json({
                key: apiKey,
                plan: 'free',
                rateLimit: '3 req/hr',
                message: "Free tier API key. Save this - it won't be shown again.",
                tryItNow: {
                    curl: `curl -H "X-API-Key: ${apiKey}" https://api.botindex.dev/api/botindex/v1/signals`,
                    docs: 'https://api.botindex.dev/docs',
                    quickstart: '1. Copy the curl command above\n2. Paste in your terminal\n3. You\'re in',
                },
                nextSteps: [
                    { endpoint: '/api/botindex/v1/signals', description: 'Live market signals' },
                    { endpoint: '/api/botindex/hyperliquid/funding-arb', description: 'Funding rate arbitrage opportunities' },
                    { endpoint: '/api/botindex/hyperliquid/hip6/feed-history', description: 'HIP-6 launch candidate feed history' },
                ],
            });
            return;
        }
        const stripe = getStripeClient();
        const priceId = getPlanPriceId(plan);
        (0, conversion_funnel_1.trackFunnelEvent)('register_page_hit', plan);
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: SUCCESS_URL,
            cancel_url: CANCEL_URL,
            metadata: { plan },
        });
        if (!session.url) {
            res.status(500).json({ error: 'checkout_session_failed', message: 'Stripe did not return a checkout URL' });
            return;
        }
        (0, conversion_funnel_1.trackFunnelEvent)('checkout_session_created', plan);
        res.redirect(303, session.url);
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to create BotIndex key checkout session (GET)');
        res.status(500).json({ error: 'checkout_session_failed', message: 'Unable to create checkout session' });
    }
});
// POST /register — API-friendly: returns JSON with checkout URL
router.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: 'invalid_payload',
            message: parsed.error.issues[0]?.message || 'Invalid registration payload',
        });
        return;
    }
    try {
        const stripe = getStripeClient();
        const plan = parsed.data.plan || 'basic';
        const priceId = getPlanPriceId(plan);
        (0, conversion_funnel_1.trackFunnelEvent)('register_page_hit', plan);
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer_email: parsed.data.email,
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: SUCCESS_URL,
            cancel_url: CANCEL_URL,
            metadata: {
                email: parsed.data.email,
                plan,
            },
        });
        if (!session.url) {
            res.status(500).json({ error: 'checkout_session_failed', message: 'Stripe did not return a checkout URL' });
            return;
        }
        (0, conversion_funnel_1.trackFunnelEvent)('checkout_session_created', plan);
        res.json({
            checkoutUrl: session.url,
            sessionId: session.id,
        });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to create BotIndex key checkout session');
        res.status(500).json({ error: 'checkout_session_failed', message: 'Unable to create checkout session' });
    }
});
router.get('/success', async (req, res) => {
    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
    if (!sessionId) {
        res.status(400).json({ error: 'missing_session_id', message: 'session_id query parameter is required' });
        return;
    }
    try {
        const stripe = getStripeClient();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (!customerId) {
            res.status(400).json({ error: 'invalid_session', message: 'Checkout session has no Stripe customer' });
            return;
        }
        if (session.status !== 'complete') {
            res.status(400).json({ error: 'checkout_incomplete', message: 'Checkout session is not complete' });
            return;
        }
        const email = await resolveEmailFromSession(stripe, session);
        if (!email) {
            res.status(400).json({ error: 'missing_email', message: 'No customer email found for checkout session' });
            return;
        }
        const plan = resolvePlanFromSession(session);
        (0, conversion_funnel_1.trackFunnelEvent)('checkout_completed', plan);
        const apiKey = (0, apiKeyAuth_1.generateApiKey)();
        (0, apiKeyAuth_1.createApiKeyEntry)({
            apiKey,
            email,
            stripeCustomerId: customerId,
            plan,
        });
        (0, conversion_funnel_1.trackFunnelEvent)('api_key_issued', plan);
        try {
            await (0, key_delivery_email_1.sendApiKeyEmail)({ to: email, apiKey, plan });
        }
        catch (emailError) {
            logger_1.default.error({ err: emailError, email }, 'Failed to send BotIndex API key email');
        }
        res.json({
            key: apiKey,
            plan,
            message: "Save this key - it won't be shown again",
            tryItNow: {
                curl: `curl -H "X-API-Key: ${apiKey}" https://api.botindex.dev/api/botindex/v1/signals`,
                docs: 'https://api.botindex.dev/docs',
                quickstart: '1. Copy the curl command above\n2. Paste in your terminal\n3. You\'re in',
            },
            nextSteps: [
                { endpoint: '/api/botindex/v1/signals', description: 'Live market signals' },
                { endpoint: '/api/botindex/hyperliquid/funding-arb', description: 'Funding rate arbitrage opportunities' },
                { endpoint: '/api/botindex/hyperliquid/hip6/feed-history', description: 'HIP-6 launch candidate feed history' },
            ],
        });
    }
    catch (error) {
        logger_1.default.error({ err: error, sessionId }, 'Failed to finalize BotIndex key checkout session');
        res.status(500).json({ error: 'session_finalize_failed', message: 'Unable to finalize checkout session' });
    }
});
router.get('/info', apiKeyAuth_1.requireApiKey, (req, res) => {
    const auth = req.apiKeyAuth;
    if (!auth) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    const entry = (0, apiKeyAuth_1.getApiKeyEntry)(auth.apiKey);
    if (!entry) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    res.json({
        plan: entry.plan,
        requestCount: entry.requestCount,
        createdAt: entry.createdAt,
        status: entry.status,
        walletConnected: !!entry.walletAddress,
        walletAddress: entry.walletAddress || null,
        ...(entry.walletAddress ? {} : {
            connectWallet: {
                url: 'https://api.botindex.dev/api/botindex/keys/connect',
                description: 'Connect your wallet for x402 payments and 10% discount',
            },
        }),
    });
});
router.post('/portal', apiKeyAuth_1.requireApiKey, async (req, res) => {
    const auth = req.apiKeyAuth;
    if (!auth) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    const entry = (0, apiKeyAuth_1.getApiKeyEntry)(auth.apiKey);
    if (!entry) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    if (!entry.stripeCustomerId) {
        res.status(400).json({ error: 'missing_customer', message: 'No Stripe customer associated with this API key' });
        return;
    }
    try {
        const stripe = getStripeClient();
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: entry.stripeCustomerId,
            return_url: PORTAL_RETURN_URL,
        });
        res.json({ portalUrl: portalSession.url });
    }
    catch (error) {
        logger_1.default.error({ err: error, apiKey: auth.apiKey }, 'Failed to create BotIndex billing portal session');
        res.status(500).json({ error: 'portal_session_failed', message: 'Unable to create billing portal session' });
    }
});
router.get('/admin/funnel', (req, res) => {
    const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : '';
    if (adminId !== ADMIN_ID) {
        res.status(403).json({ error: 'forbidden', message: 'Invalid adminId' });
        return;
    }
    res.json((0, conversion_funnel_1.getFunnelStats)());
});
router.get('/admin/keys', (req, res) => {
    const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : '';
    if (adminId !== ADMIN_ID) {
        res.status(403).json({ error: 'forbidden', message: 'Invalid adminId' });
        return;
    }
    const allKeys = (0, apiKeyAuth_1.getAllApiKeys)();
    const free = allKeys.filter(k => k.entry.plan === 'free');
    const paid = allKeys.filter(k => k.entry.plan !== 'free');
    res.json({
        total: allKeys.length,
        free: {
            count: free.length,
            totalRequests: free.reduce((sum, k) => sum + k.entry.requestCount, 0),
            keys: free.map(k => ({
                key: k.key,
                plan: k.entry.plan,
                requests: k.entry.requestCount,
                created: k.entry.createdAt,
                lastUsed: k.entry.lastUsed,
                wallet: k.entry.walletAddress || null,
            })),
        },
        paid: {
            count: paid.length,
            totalRequests: paid.reduce((sum, k) => sum + k.entry.requestCount, 0),
            keys: paid.map(k => ({
                key: k.key,
                plan: k.entry.plan,
                requests: k.entry.requestCount,
                created: k.entry.createdAt,
                lastUsed: k.entry.lastUsed,
                wallet: k.entry.walletAddress || null,
            })),
        },
    });
});
// POST /connect-wallet — link a wallet address to an existing API key
const connectWalletSchema = zod_1.z.object({
    wallet: zod_1.z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid Ethereum address'),
});
router.post('/connect-wallet', apiKeyAuth_1.requireApiKey, async (req, res) => {
    const auth = req.apiKeyAuth;
    if (!auth) {
        res.status(401).json({ error: 'invalid_api_key', message: 'Valid X-API-Key header is required.' });
        return;
    }
    const parsed = connectWalletSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: 'invalid_wallet',
            message: 'Provide a valid Ethereum wallet address (0x...)',
        });
        return;
    }
    const updated = (0, apiKeyAuth_1.updateApiKeyWallet)(auth.apiKey, parsed.data.wallet);
    if (!updated) {
        res.status(404).json({ error: 'key_not_found', message: 'API key not found in ledger.' });
        return;
    }
    logger_1.default.info({ email: auth.email, wallet: parsed.data.wallet.toLowerCase() }, 'Wallet connected to API key');
    res.json({
        message: 'Wallet connected successfully.',
        wallet: parsed.data.wallet.toLowerCase(),
        benefits: [
            'x402 direct payment — pay per call without subscription',
            '10% discount on all x402-paid calls vs Stripe pricing',
            'On-chain usage receipts (AAR) for every paid call',
            'Loyalty tier tracking — cumulative spend unlocks perks',
        ],
    });
});
// GET /connect — browser-friendly wallet connect page
router.get('/connect', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BotIndex — Connect Wallet</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 24px; }
    .card { max-width: 480px; width: 100%; border: 1px solid #27272a; border-radius: 16px; background: #18181b; padding: 32px; }
    h1 { font-size: 22px; color: #fff; margin-bottom: 8px; }
    .subtitle { color: #a1a1aa; font-size: 14px; margin-bottom: 24px; }
    label { display: block; font-size: 13px; color: #a1a1aa; margin-bottom: 6px; margin-top: 16px; }
    input { width: 100%; padding: 10px 14px; background: #0a0a0a; border: 1px solid #3f3f46; border-radius: 8px; color: #e5e5e5; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; outline: none; }
    input:focus { border-color: #22d3ee; }
    .btn { display: block; width: 100%; padding: 12px; margin-top: 20px; background: #22d3ee20; color: #22d3ee; border: 1px solid #22d3ee40; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
    .btn:hover { background: #22d3ee30; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .or { text-align: center; color: #71717a; font-size: 12px; margin: 16px 0; }
    .btn-metamask { display: block; width: 100%; padding: 12px; background: #f6851b15; color: #f6851b; border: 1px solid #f6851b40; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
    .btn-metamask:hover { background: #f6851b30; }
    .status { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 13px; display: none; }
    .status.success { display: block; background: #22c55e15; border: 1px solid #22c55e40; color: #4ade80; }
    .status.error { display: block; background: #ef444415; border: 1px solid #ef444440; color: #f87171; }
    .benefits { margin-top: 20px; }
    .benefits h3 { font-size: 13px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
    .benefit { font-size: 13px; color: #a1a1aa; padding: 4px 0; }
    .benefit::before { content: '✦ '; color: #22d3ee; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect Your Wallet</h1>
    <p class="subtitle">Link your wallet to your BotIndex API key for x402 payments and loyalty perks.</p>

    <label for="apiKey">Your API Key</label>
    <input type="text" id="apiKey" placeholder="bi_..." autocomplete="off">

    <button class="btn-metamask" onclick="connectMetaMask()" id="mmBtn">Connect with MetaMask</button>
    <div class="or">or enter manually</div>

    <label for="wallet">Wallet Address</label>
    <input type="text" id="wallet" placeholder="0x...">

    <button class="btn" onclick="submitWallet()" id="submitBtn">Link Wallet</button>
    <div class="status" id="status"></div>

    <div class="benefits">
      <h3>Why connect?</h3>
      <div class="benefit">Pay per call with x402 — no subscription required</div>
      <div class="benefit">10% discount vs Stripe on all paid endpoints</div>
      <div class="benefit">Verifiable on-chain receipts for every call</div>
      <div class="benefit">Loyalty tier — cumulative spend unlocks perks</div>
    </div>
  </div>
  <script>
    async function connectMetaMask() {
      if (!window.ethereum) {
        showStatus('MetaMask not detected. Install it or enter your wallet address manually.', 'error');
        return;
      }
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts[0]) {
          document.getElementById('wallet').value = accounts[0];
          showStatus('Wallet detected: ' + accounts[0].slice(0, 8) + '...' + accounts[0].slice(-6), 'success');
        }
      } catch (e) {
        showStatus('MetaMask connection cancelled.', 'error');
      }
    }

    async function submitWallet() {
      const apiKey = document.getElementById('apiKey').value.trim();
      const wallet = document.getElementById('wallet').value.trim();
      if (!apiKey || !wallet) {
        showStatus('Please enter both your API key and wallet address.', 'error');
        return;
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        showStatus('Invalid wallet address format.', 'error');
        return;
      }
      document.getElementById('submitBtn').disabled = true;
      try {
        const res = await fetch('/api/botindex/keys/connect-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify({ wallet }),
        });
        const data = await res.json();
        if (res.ok) {
          showStatus('Wallet connected! You can now use x402 payments.', 'success');
        } else {
          showStatus(data.message || 'Failed to connect wallet.', 'error');
        }
      } catch (e) {
        showStatus('Network error. Try again.', 'error');
      }
      document.getElementById('submitBtn').disabled = false;
    }

    function showStatus(msg, type) {
      const el = document.getElementById('status');
      el.textContent = msg;
      el.className = 'status ' + type;
    }
  </script>
</body>
</html>`);
});
router.get('/cancel', (_req, res) => {
    res.json({ message: 'Checkout cancelled. Return to API docs to try again.' });
});
exports.default = router;
//# sourceMappingURL=botindex-keys.js.map