import { Router, Request, Response } from 'express';
import logger from '../../config/logger';

const router = Router();
const ADMIN_CHAT_ID = '8063432083';

// POST /api/botindex/contact — Enterprise contact form
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, company, message } = req.body || {};

    if (!email || !message) {
      res.status(400).json({ error: 'email and message are required' });
      return;
    }

    const botToken = process.env.BOTINDEX_BOT_TOKEN;
    if (!botToken) {
      logger.error('BOTINDEX_BOT_TOKEN not set — cannot send contact notification');
      res.status(500).json({ error: 'notification service unavailable' });
      return;
    }

    const text = [
      '🏢 *BotIndex Enterprise Inquiry*',
      '',
      `*Name:* ${name || 'Not provided'}`,
      `*Email:* ${email}`,
      `*Company:* ${company || 'Not provided'}`,
      `*Message:* ${message}`,
      '',
      `_Received: ${new Date().toISOString()}_`,
    ].join('\n');

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!tgRes.ok) {
      const err = await tgRes.text();
      logger.error({ err }, 'Failed to send Telegram notification');
    }

    // Return styled HTML for browser submissions
    const acceptsHtml = (req.headers.accept || '').includes('text/html');
    if (acceptsHtml) {
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BotIndex — Message Sent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 24px; }
    .card { max-width: 440px; width: 100%; border: 1px solid #27272a; border-radius: 16px; background: #18181b; padding: 32px; text-align: center; }
    h1 { font-size: 24px; color: #fff; margin-bottom: 8px; }
    p { color: #a1a1aa; font-size: 14px; margin-top: 12px; }
    .check { font-size: 48px; margin-bottom: 16px; }
    a { color: #22d3ee; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>Message Sent</h1>
    <p>We'll get back to you within 24 hours.</p>
    <p style="margin-top: 24px;"><a href="https://botindex.dev">← Back to BotIndex</a></p>
  </div>
</body>
</html>`);
      return;
    }

    res.json({ ok: true, message: 'Your inquiry has been received. We\'ll respond within 24 hours.' });
  } catch (err) {
    logger.error({ err }, 'Contact form error');
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/botindex/contact — Show contact form
router.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BotIndex — Enterprise Contact</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 24px; }
    .card { max-width: 480px; width: 100%; border: 1px solid #27272a; border-radius: 16px; background: #18181b; padding: 32px; }
    h1 { font-size: 24px; color: #fff; margin-bottom: 8px; }
    .subtitle { color: #a1a1aa; font-size: 14px; margin-bottom: 24px; }
    label { display: block; font-size: 13px; color: #a1a1aa; margin-bottom: 6px; margin-top: 16px; }
    input, textarea { width: 100%; padding: 12px 14px; background: #0a0a0a; border: 1px solid #3f3f46; border-radius: 8px; color: #e5e5e5; font-size: 14px; outline: none; font-family: inherit; }
    input:focus, textarea:focus { border-color: #22d3ee; }
    textarea { resize: vertical; min-height: 80px; }
    .btn { display: block; width: 100%; padding: 12px; margin-top: 20px; background: #22d3ee20; color: #22d3ee; border: 1px solid #22d3ee40; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid #22d3ee40; }
    .btn:hover { background: #22d3ee30; }
    .badge { display: inline-block; background: #22d3ee15; color: #22d3ee; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 500; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Enterprise Inquiry</h1>
    <p class="subtitle">Unlimited API access, custom SLAs, dedicated support.</p>
    <span class="badge">ENTERPRISE</span>
    <form action="/api/botindex/contact" method="POST">
      <label for="name">Name</label>
      <input type="text" id="name" name="name" placeholder="Your name">
      <label for="email">Email *</label>
      <input type="email" id="email" name="email" placeholder="you@company.com" required>
      <label for="company">Company</label>
      <input type="text" id="company" name="company" placeholder="Company name">
      <label for="message">What are you building? *</label>
      <textarea id="message" name="message" placeholder="Tell us about your use case and expected volume..." required></textarea>
      <button type="submit" class="btn">Send Inquiry →</button>
    </form>
  </div>
</body>
</html>`);
});

export default router;
