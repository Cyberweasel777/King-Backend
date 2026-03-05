import { Request, Response, Router } from 'express';
import { getApiKeyInfo, isValidEmail, registerApiKey } from '../middleware/apiKeyAuth';
import logger from '../../config/logger';

const router = Router();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'BotIndex <onboarding@resend.dev>';

async function sendWelcomeEmail(email: string, apiKey: string, monthlyLimit: number): Promise<void> {
  if (!RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY not set, skipping welcome email');
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: 'Your BotIndex API Key',
        html: `
<div style="font-family: monospace; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="border-bottom: 1px solid #333; padding-bottom: 10px;">BotIndex API Key</h2>
  
  <p>Your API key:</p>
  <pre style="background: #1a1a2e; color: #0f0; padding: 15px; border-radius: 4px; font-size: 14px;">${apiKey}</pre>
  
  <h3>Quick Start</h3>
  <pre style="background: #f4f4f4; padding: 15px; border-radius: 4px; font-size: 13px; overflow-x: auto;">curl -H "X-API-Key: ${apiKey}" \\
  https://king-backend.fly.dev/api/botindex/v1/signals</pre>

  <h3>Your Plan</h3>
  <ul>
    <li><strong>Tier:</strong> Free</li>
    <li><strong>Monthly limit:</strong> ${monthlyLimit} requests</li>
    <li><strong>Resets:</strong> 1st of each month (UTC)</li>
  </ul>

  <h3>Check Usage</h3>
  <pre style="background: #f4f4f4; padding: 15px; border-radius: 4px; font-size: 13px; overflow-x: auto;">curl -H "X-API-Key: ${apiKey}" \\
  https://king-backend.fly.dev/api/botindex/v1/keys/info</pre>

  <h3>Available Endpoints</h3>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 6px;"><code>/v1/signals</code></td><td>Aggregated signal feed</td></tr>
    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 6px;"><code>/v1/sports/odds</code></td><td>Live odds snapshot</td></tr>
    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 6px;"><code>/v1/crypto/tokens</code></td><td>Token universe</td></tr>
    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 6px;"><code>/v1/solana/launches</code></td><td>Metaplex Genesis launches</td></tr>
    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 6px;"><code>/hyperliquid/funding-arb</code></td><td>Funding rate arbitrage</td></tr>
    <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 6px;"><code>/zora/trending-coins</code></td><td>Zora trending coins</td></tr>
  </table>

  <p style="margin-top: 20px; color: #666; font-size: 12px;">
    Need more? After ${monthlyLimit} requests, upgrade to pay-per-request via x402 (USDC on Base).<br>
    Docs: <a href="https://github.com/Cyberweasel777/King-Backend">github.com/Cyberweasel777/King-Backend</a>
  </p>
</div>`,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body }, 'Resend API error');
    } else {
      logger.info({ email }, 'Welcome email sent');
    }
  } catch (err) {
    logger.warn({ err, email }, 'Failed to send welcome email');
  }
}

router.post('/register', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';

  if (!email || !isValidEmail(email)) {
    res.status(400).json({
      error: 'invalid_email',
      message: 'Please provide a valid email address.',
    });
    return;
  }

  const result = registerApiKey(email);

  // Fire-and-forget welcome email (don't block response)
  sendWelcomeEmail(email, result.apiKey, result.monthlyLimit).catch(() => {});

  res.json(result);
});

router.get('/info', (req: Request, res: Response) => {
  const apiKeyHeader = req.headers['x-api-key'];
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  if (!apiKey) {
    res.status(401).json({
      error: 'missing_api_key',
      message: 'Provide X-API-Key header.',
    });
    return;
  }

  const info = getApiKeyInfo(apiKey);
  if (!info) {
    res.status(401).json({
      error: 'invalid_api_key',
      message: 'API key not recognized.',
    });
    return;
  }

  res.json(info);
});

export default router;
