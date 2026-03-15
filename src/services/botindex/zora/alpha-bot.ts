import Stripe from 'stripe';
import logger from '../../../config/logger';
import {
  getZoraAlphaSubscriber,
  loadZoraAlphaSubscribers,
  upsertZoraAlphaSubscriber,
} from './subscriber-store';

type TelegramUser = {
  id: number;
};

type TelegramChat = {
  id: number;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const BOT_USERNAME = 'ZoraAlphaDev_Bot';
const TME_BOT_URL = `https://t.me/${BOT_USERNAME}`;
const STRIPE_LOOKUP_KEY = 'zora_alpha_premium_monthly';
const STRIPE_PRODUCT_NAME = 'Zora Alpha Premium';
const STRIPE_MONTHLY_PRICE_CENTS = 999;
const POLL_TIMEOUT_SECONDS = 30;

const START_MESSAGE = [
  '🪙 Welcome to Zora Alpha!',
  '',
  '📢 Free: @ZoraAlpha channel (15-min delayed signals)',
  '⚡ Premium ($9.99/mo): Real-time AI-scored alerts straight to your DMs',
  '',
  'Premium includes:',
  '• Instant alerts (no 15-min delay)',
  '• DeepSeek AI analysis per coin',
  '• Volume spike detection',
  '• Creator reputation scoring',
  '• Priority support',
  '',
  '/subscribe — Start 7-day free trial',
  '/status — Check your subscription',
  '/help — Available commands',
].join('\n');

const HELP_MESSAGE = [
  'Available commands:',
  '/start — Welcome + premium overview',
  '/subscribe — Start 7-day free trial',
  '/status — Check your subscription',
  '/cancel — Open billing portal',
  '/help — Show this list',
].join('\n');

let isPolling = false;
let stopRequested = false;
let pollPromise: Promise<void> | null = null;
let lastUpdateId = 0;

let resolvedPriceId: string | null = null;
let resolvingPricePromise: Promise<string> | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: string | undefined): string {
  if (!value) return 'N/A';
  const tsMs = Date.parse(value);
  if (!Number.isFinite(tsMs)) return value;
  return new Date(tsMs).toISOString();
}

function getStripeClient(): Stripe {
  const secretKey = process.env.BOTINDEX_STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('BOTINDEX_STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });
}

async function telegramRequest<T>(
  botToken: string,
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body?.ok) {
    const detail = body?.description || `${response.status} ${response.statusText}`;
    throw new Error(`Telegram ${method} failed: ${detail}`);
  }

  return body.result as T;
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
  await telegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

async function getUpdates(botToken: string, offset: number): Promise<TelegramUpdate[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (POLL_TIMEOUT_SECONDS + 5) * 1000);

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/getUpdates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        offset,
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ['message'],
      }),
      signal: controller.signal,
    });

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || !body?.ok) {
      const detail = body?.description || `${response.status} ${response.statusText}`;
      throw new Error(`Telegram getUpdates failed: ${detail}`);
    }

    return Array.isArray(body.result) ? (body.result as TelegramUpdate[]) : [];
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCommand(text: string): string {
  const firstToken = text.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const mentionSuffix = `@${BOT_USERNAME.toLowerCase()}`;
  if (firstToken.endsWith(mentionSuffix)) {
    return firstToken.slice(0, firstToken.length - mentionSuffix.length);
  }
  return firstToken;
}

async function resolveOrCreateStripeCustomer(
  stripe: Stripe,
  telegramUserId: string,
  chatId: number
): Promise<string> {
  const existing = await getZoraAlphaSubscriber(telegramUserId);
  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  const searchResult = await stripe.customers.search({
    query: `metadata['telegram_user_id']:'${telegramUserId}'`,
    limit: 1,
  });

  if (searchResult.data.length > 0) {
    return searchResult.data[0].id;
  }

  const customer = await stripe.customers.create({
    metadata: {
      telegram_user_id: telegramUserId,
      telegram_chat_id: String(chatId),
      bot: 'zora_alpha',
    },
  });

  return customer.id;
}

async function ensureMonthlyPriceId(stripe: Stripe): Promise<string> {
  if (resolvedPriceId) return resolvedPriceId;
  if (process.env.ZORA_ALPHA_STRIPE_PRICE_ID) {
    resolvedPriceId = process.env.ZORA_ALPHA_STRIPE_PRICE_ID;
    return resolvedPriceId;
  }

  if (!resolvingPricePromise) {
    resolvingPricePromise = (async () => {
      const existingByLookup = await stripe.prices.list({
        lookup_keys: [STRIPE_LOOKUP_KEY],
        active: true,
        limit: 1,
      });
      if (existingByLookup.data.length > 0) {
        return existingByLookup.data[0].id;
      }

      const products = await stripe.products.list({ active: true, limit: 100 });
      const existingProduct = products.data.find(
        (product) => product.name === STRIPE_PRODUCT_NAME
      );
      const product =
        existingProduct ||
        (await stripe.products.create({
          name: STRIPE_PRODUCT_NAME,
          metadata: {
            bot: 'zora_alpha',
          },
        }));

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: STRIPE_MONTHLY_PRICE_CENTS,
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
        lookup_key: STRIPE_LOOKUP_KEY,
        metadata: {
          bot: 'zora_alpha',
        },
      });

      return price.id;
    })()
      .then((priceId) => {
        resolvedPriceId = priceId;
        return priceId;
      })
      .finally(() => {
        resolvingPricePromise = null;
      });
  }

  return resolvingPricePromise;
}

async function handleSubscribeCommand(botToken: string, message: TelegramMessage): Promise<void> {
  if (!message.from) {
    await sendTelegramMessage(botToken, message.chat.id, 'Unable to identify your Telegram account.');
    return;
  }

  const telegramUserId = String(message.from.id);
  const chatId = message.chat.id;
  const current = await getZoraAlphaSubscriber(telegramUserId);

  if (current && (current.status === 'active' || current.status === 'trial')) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `Your premium subscription is already ${current.status}.\nUse /status to check details or /cancel to manage billing.`
    );
    return;
  }

  try {
    const stripe = getStripeClient();
    const priceId = await ensureMonthlyPriceId(stripe);
    const customerId = await resolveOrCreateStripeCustomer(stripe, telegramUserId, chatId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: TME_BOT_URL,
      cancel_url: TME_BOT_URL,
      metadata: {
        telegram_user_id: telegramUserId,
        telegram_chat_id: String(chatId),
        bot: 'zora_alpha',
      },
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          telegram_user_id: telegramUserId,
          telegram_chat_id: String(chatId),
          bot: 'zora_alpha',
        },
      },
    });

    if (!session.url) {
      throw new Error('Stripe checkout did not return a URL');
    }

    await upsertZoraAlphaSubscriber(telegramUserId, (existing) => ({
      chatId,
      status: existing?.status || 'expired',
      stripeCustomerId: customerId,
      subscribedAt: existing?.subscribedAt || new Date().toISOString(),
      expiresAt: existing?.expiresAt,
    }));

    await sendTelegramMessage(
      botToken,
      chatId,
      `Click here to start your free trial: ${session.url}`
    );
  } catch (error) {
    logger.error({ err: error, telegramUserId }, 'Failed to create Zora Alpha checkout session');
    await sendTelegramMessage(
      botToken,
      chatId,
      'Unable to create checkout session right now. Please try again in a minute.'
    );
  }
}

async function handleStatusCommand(botToken: string, message: TelegramMessage): Promise<void> {
  if (!message.from) {
    await sendTelegramMessage(botToken, message.chat.id, 'Unable to identify your Telegram account.');
    return;
  }

  const telegramUserId = String(message.from.id);
  const current = await getZoraAlphaSubscriber(telegramUserId);

  if (!current) {
    await sendTelegramMessage(
      botToken,
      message.chat.id,
      'Subscription status: none\nUse /subscribe to start your 7-day free trial.'
    );
    return;
  }

  await sendTelegramMessage(
    botToken,
    message.chat.id,
    [
      `Subscription status: ${current.status}`,
      `Subscribed at: ${formatDate(current.subscribedAt)}`,
      `Expires at: ${formatDate(current.expiresAt)}`,
    ].join('\n')
  );
}

async function handleCancelCommand(botToken: string, message: TelegramMessage): Promise<void> {
  if (!message.from) {
    await sendTelegramMessage(botToken, message.chat.id, 'Unable to identify your Telegram account.');
    return;
  }

  const telegramUserId = String(message.from.id);
  const current = await getZoraAlphaSubscriber(telegramUserId);

  if (!current?.stripeCustomerId) {
    await sendTelegramMessage(
      botToken,
      message.chat.id,
      'No Stripe subscription found for this account. Use /subscribe to start a trial.'
    );
    return;
  }

  try {
    const stripe = getStripeClient();
    const portal = await stripe.billingPortal.sessions.create({
      customer: current.stripeCustomerId,
      return_url: TME_BOT_URL,
    });

    await sendTelegramMessage(
      botToken,
      message.chat.id,
      `Manage or cancel your subscription here: ${portal.url}`
    );
  } catch (error) {
    logger.error({ err: error, telegramUserId }, 'Failed to create Zora Alpha billing portal session');
    await sendTelegramMessage(
      botToken,
      message.chat.id,
      'Unable to create billing portal link right now. Please try again shortly.'
    );
  }
}

async function handleMessage(botToken: string, message: TelegramMessage): Promise<void> {
  const text = message.text?.trim();
  if (!text || !text.startsWith('/')) {
    return;
  }

  const command = normalizeCommand(text);

  switch (command) {
    case '/start':
      await sendTelegramMessage(botToken, message.chat.id, START_MESSAGE);
      return;
    case '/help':
      await sendTelegramMessage(botToken, message.chat.id, HELP_MESSAGE);
      return;
    case '/subscribe':
      await handleSubscribeCommand(botToken, message);
      return;
    case '/status':
      await handleStatusCommand(botToken, message);
      return;
    case '/cancel':
      await handleCancelCommand(botToken, message);
      return;
    default:
      await sendTelegramMessage(
        botToken,
        message.chat.id,
        `Unknown command: ${escapeHtml(command)}\nUse /help to see available commands.`
      );
  }
}

async function pollLoop(botToken: string): Promise<void> {
  isPolling = true;
  logger.info('Starting Zora Alpha bot polling loop');

  try {
    await loadZoraAlphaSubscribers();
  } catch (error) {
    logger.warn({ err: error }, 'Failed to warm Zora Alpha subscriber storage');
  }

  while (!stopRequested) {
    try {
      const updates = await getUpdates(botToken, lastUpdateId + 1);

      for (const update of updates) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        if (!update.message) continue;

        try {
          await handleMessage(botToken, update.message);
        } catch (error) {
          logger.error({ err: error, updateId: update.update_id }, 'Failed to handle Telegram update');
        }
      }
    } catch (error) {
      if (stopRequested) break;
      logger.error({ err: error }, 'Zora Alpha polling iteration failed');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  isPolling = false;
  logger.info('Zora Alpha bot polling loop stopped');
}

function requestStop(signal: NodeJS.Signals): void {
  if (stopRequested) return;
  stopRequested = true;
  logger.info({ signal }, 'Stopping Zora Alpha bot polling loop');
}

export function startZoraAlphaBotPolling(): void {
  const botToken = process.env.ZORA_ALPHA_BOT_TOKEN || '';
  if (!botToken) {
    logger.info('Zora Alpha bot polling skipped: ZORA_ALPHA_BOT_TOKEN not configured');
    return;
  }

  if (isPolling || pollPromise) {
    return;
  }

  stopRequested = false;
  pollPromise = pollLoop(botToken).finally(() => {
    pollPromise = null;
  });
}

process.once('SIGTERM', () => requestStop('SIGTERM'));
process.once('SIGINT', () => requestStop('SIGINT'));

startZoraAlphaBotPolling();
