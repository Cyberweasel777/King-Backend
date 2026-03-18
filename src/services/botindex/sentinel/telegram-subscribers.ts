/**
 * Telegram Subscriber Management for Sentinel/Pro intelligence alerts.
 *
 * Flow:
 * 1. User pays via Stripe → gets API key + success page with bot link
 * 2. User messages @BotIndexHacks_Bot with /start <api_key>
 * 3. Bot verifies key is paid tier (pro or sentinel)
 * 4. Bot adds their chat_id to subscriber list
 * 5. Signal alerts go to all subscribers (not just Andrew)
 *
 * Persisted to /data/telegram-subscribers.json
 */

import fs from 'fs';
import path from 'path';
import logger from '../../../config/logger';

const DATA_DIR = process.env.DATA_DIR || '/data';
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'telegram-subscribers.json');
const TELEGRAM_BOT_TOKEN = process.env.BOTINDEX_BOT_TOKEN || '';
const ANDREW_CHAT_ID = '8063432083';

export interface TelegramSubscriber {
  chatId: string;
  apiKey: string;
  plan: string;
  username?: string;
  firstName?: string;
  subscribedAt: string;
  active: boolean;
}

// ── In-memory state ────────────────────────────────────────────────────

let subscribers: TelegramSubscriber[] = [];

function loadSubscribers(): void {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      const raw = fs.readFileSync(SUBSCRIBERS_FILE, 'utf-8');
      subscribers = JSON.parse(raw);
      logger.info({ count: subscribers.length }, 'Loaded Telegram subscribers');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to load Telegram subscribers');
    subscribers = [];
  }
}

function saveSubscribers(): void {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
  } catch (err) {
    logger.error({ err }, 'Failed to save Telegram subscribers');
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export function getActiveSubscriberChatIds(): string[] {
  return [
    ANDREW_CHAT_ID, // Andrew always gets alerts
    ...subscribers
      .filter(s => s.active && s.chatId !== ANDREW_CHAT_ID)
      .map(s => s.chatId),
  ];
}

export function getSubscriberCount(): number {
  return subscribers.filter(s => s.active).length;
}

export function addSubscriber(
  chatId: string,
  apiKey: string,
  plan: string,
  username?: string,
  firstName?: string,
): { success: boolean; message: string } {
  // Check if already subscribed
  const existing = subscribers.find(s => s.chatId === chatId);
  if (existing) {
    if (existing.active) {
      return { success: false, message: 'You are already subscribed to intelligence alerts.' };
    }
    // Reactivate
    existing.active = true;
    existing.apiKey = apiKey;
    existing.plan = plan;
    saveSubscribers();
    return { success: true, message: 'Welcome back! Your intelligence alerts have been reactivated.' };
  }

  subscribers.push({
    chatId,
    apiKey,
    plan,
    username,
    firstName,
    subscribedAt: new Date().toISOString(),
    active: true,
  });
  saveSubscribers();

  logger.info({ chatId, plan, username }, 'New Telegram subscriber added');
  return { success: true, message: `✅ Subscribed to ${plan === 'sentinel' ? 'Sentinel' : 'Pro'} intelligence alerts.\n\nYou will receive:\n• Market regime changes\n• Whale divergence signals\n• Predictive intelligence briefs\n• Network momentum shifts\n\nAlerts fire every 15 minutes when signals are YELLOW or above.` };
}

export function removeSubscriber(chatId: string): boolean {
  const sub = subscribers.find(s => s.chatId === chatId);
  if (!sub) return false;
  sub.active = false;
  saveSubscribers();
  return true;
}

// ── Telegram Bot Polling ───────────────────────────────────────────────

let lastUpdateId = 0;

async function pollBotUpdates(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5&allowed_updates=["message"]`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) return;

    const data = await resp.json() as { ok: boolean; result: any[] };
    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      await handleMessage(update.message);
    }
  } catch (err) {
    // Polling errors are non-fatal
    logger.debug({ err }, 'Bot poll error');
  }
}

async function handleMessage(msg: any): Promise<void> {
  if (!msg?.text || !msg?.chat?.id) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const username = msg.from?.username;
  const firstName = msg.from?.first_name;

  // /start <api_key>
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const apiKey = parts[1];

    if (!apiKey) {
      await sendBotMessage(chatId, 
        '🧠 <b>BotIndex Intelligence</b>\n\n' +
        'Send your API key to subscribe to intelligence alerts:\n\n' +
        '<code>/subscribe your_api_key_here</code>\n\n' +
        'Get a key at: https://botindex.dev\n\n' +
        'Commands:\n' +
        '/subscribe &lt;key&gt; — Start receiving alerts\n' +
        '/status — Check subscription status\n' +
        '/stop — Unsubscribe'
      );
      return;
    }

    // Treat /start <key> same as /subscribe <key>
    await handleSubscribe(chatId, apiKey, username, firstName);
    return;
  }

  // /subscribe <api_key>
  if (text.startsWith('/subscribe')) {
    const parts = text.split(/\s+/);
    const apiKey = parts[1];

    if (!apiKey) {
      await sendBotMessage(chatId, 'Usage: <code>/subscribe your_api_key</code>');
      return;
    }

    await handleSubscribe(chatId, apiKey, username, firstName);
    return;
  }

  // /status
  if (text === '/status') {
    const sub = subscribers.find(s => s.chatId === chatId && s.active);
    if (sub) {
      await sendBotMessage(chatId,
        `✅ <b>Active Subscription</b>\n\n` +
        `Plan: <b>${sub.plan}</b>\n` +
        `Since: ${new Date(sub.subscribedAt).toLocaleDateString()}\n\n` +
        `You are receiving intelligence alerts.`
      );
    } else {
      await sendBotMessage(chatId,
        '❌ No active subscription.\n\nSend <code>/subscribe your_api_key</code> to start.'
      );
    }
    return;
  }

  // /stop
  if (text === '/stop') {
    const removed = removeSubscriber(chatId);
    if (removed) {
      await sendBotMessage(chatId, '🔕 Unsubscribed from intelligence alerts. Send /subscribe to reactivate.');
    } else {
      await sendBotMessage(chatId, 'You are not currently subscribed.');
    }
    return;
  }

  // Unknown command — show help
  await sendBotMessage(chatId,
    '🧠 <b>BotIndex Intelligence Bot</b>\n\n' +
    'Commands:\n' +
    '/subscribe &lt;api_key&gt; — Subscribe to alerts\n' +
    '/status — Check your subscription\n' +
    '/stop — Unsubscribe\n\n' +
    'Get a key at https://botindex.dev'
  );
}

async function handleSubscribe(chatId: string, apiKey: string, username?: string, firstName?: string): Promise<void> {
  // Verify the API key exists and is paid
  try {
    const keysFile = path.join(DATA_DIR, 'api-keys.json');
    if (!fs.existsSync(keysFile)) {
      await sendBotMessage(chatId, '❌ Unable to verify key. Please try again later.');
      return;
    }

    const keys = JSON.parse(fs.readFileSync(keysFile, 'utf-8'));
    const entry = keys[apiKey];

    if (!entry) {
      await sendBotMessage(chatId,
        '❌ Invalid API key.\n\n' +
        'Get one at https://botindex.dev\n' +
        'Pro ($9.99/mo): Intelligence layer\n' +
        'Sentinel ($49.99/mo): Predictive signals + alerts'
      );
      return;
    }

    const plan = entry.plan || 'free';

    if (plan === 'free') {
      await sendBotMessage(chatId,
        '⚠️ Free tier keys don\'t include intelligence alerts.\n\n' +
        'Upgrade to receive signals:\n' +
        '• <b>Pro</b> ($9.99/mo) — Convergence scoring, risk radar, network intel\n' +
        '• <b>Sentinel</b> ($49.99/mo) — Predictive signals, query surge, personal feed\n\n' +
        'Upgrade: https://api.botindex.dev/api/botindex/keys/register?plan=pro'
      );
      return;
    }

    const result = addSubscriber(chatId, apiKey, plan, username, firstName);
    await sendBotMessage(chatId, result.message);

    // Notify Andrew of new subscriber
    if (chatId !== ANDREW_CHAT_ID) {
      await sendBotMessage(ANDREW_CHAT_ID,
        `🆕 <b>New Intelligence Subscriber</b>\n` +
        `User: ${firstName || 'Unknown'}${username ? ` (@${username})` : ''}\n` +
        `Plan: ${plan}\n` +
        `Total active: ${getSubscriberCount()}`
      );
    }
  } catch (err) {
    logger.error({ err, chatId }, 'Subscribe verification failed');
    await sendBotMessage(chatId, '❌ Error verifying key. Please try again.');
  }
}

async function sendBotMessage(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    logger.error({ err, chatId }, 'Failed to send bot message');
  }
}

// ── Broadcast to all subscribers ───────────────────────────────────────

export async function broadcastAlert(message: string, minPlan: 'pro' | 'sentinel' = 'pro'): Promise<number> {
  const targets = getActiveSubscriberChatIds();
  let sent = 0;

  for (const chatId of targets) {
    // Andrew always gets everything
    if (chatId === ANDREW_CHAT_ID) {
      await sendBotMessage(chatId, message);
      sent++;
      continue;
    }

    // Check plan level for non-Andrew subscribers
    const sub = subscribers.find(s => s.chatId === chatId && s.active);
    if (!sub) continue;

    if (minPlan === 'sentinel' && sub.plan !== 'sentinel' && sub.plan !== 'enterprise') {
      continue; // Pro users don't get sentinel-only alerts
    }

    await sendBotMessage(chatId, message);
    sent++;

    // Rate limit: 30 messages/sec Telegram limit
    if (sent % 25 === 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return sent;
}

// ── Start polling ──────────────────────────────────────────────────────

export function startTelegramBot(): void {
  loadSubscribers();

  if (!TELEGRAM_BOT_TOKEN) {
    logger.warn('No BOTINDEX_BOT_TOKEN — Telegram bot disabled');
    return;
  }

  // Poll every 10 seconds
  setInterval(() => { void pollBotUpdates(); }, 10_000);
  // First poll after 5 seconds
  setTimeout(() => { void pollBotUpdates(); }, 5_000);

  logger.info('Telegram subscriber bot started (polling every 10s)');
}
