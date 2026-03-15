import fs from 'fs';
import path from 'path';
import logger from '../../../config/logger';
import { ZoraTrendingCoin, getZoraTrendingCoins } from './trending';
import { relayToPremiumSubscribers } from './premium-relay';

export type ZoraTelegramRelayResult = {
  posted: number;
  skipped: number;
  premium: {
    sent: number;
    failed: number;
  };
  errors: string[];
};

type PostedLedger = Record<string, string>;

const TELEGRAM_CHANNEL = '@ZoraAlpha';
const POSTED_LEDGER_FILE = '/data/zora_relay_posted.json';
const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000;
const RELAY_SIZE = 3;

const numberFormatter = new Intl.NumberFormat('en-US');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function formatUsdRounded(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `$${numberFormatter.format(Math.round(safe))}`;
}

function formatDelta(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe >= 0 ? '+' : '-';
  return `${sign}${formatUsdRounded(Math.abs(safe))}`;
}

function buildZoraLink(address: string): string {
  return `https://zora.co/coin/base:${address}`;
}

function formatTelegramMessage(coin: ZoraTrendingCoin): string {
  const isUp = coin.marketCapDelta24h >= 0;
  const changeEmoji = isUp ? '📈' : '📉';
  const symbol = coin.symbol?.trim() || 'N/A';

  return [
    `🪙 <b>${escapeHtml(coin.name)}</b> (${escapeHtml(symbol)})`,
    '',
    `💰 Market Cap: ${formatUsdRounded(coin.marketCap)}`,
    `📊 24h Volume: ${formatUsdRounded(coin.volume24h)}`,
    `👥 Holders: ${numberFormatter.format(Math.max(0, Math.floor(coin.uniqueHolders || 0)))}`,
    `${changeEmoji} 24h Change: ${formatDelta(coin.marketCapDelta24h)}`,
    '',
    `🔗 <a href="${buildZoraLink(coin.address)}">View on Zora</a>`,
    '',
    '---',
    '',
    '🔥 Want AI-scored signals before everyone else?',
    '👉 /start @PolybettorBot for real-time alerts',
  ].join('\n');
}

async function loadPostedLedger(): Promise<PostedLedger> {
  try {
    if (!fs.existsSync(POSTED_LEDGER_FILE)) {
      return {};
    }

    const raw = await fs.promises.readFile(POSTED_LEDGER_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as PostedLedger;
  } catch (error) {
    logger.warn({ err: error }, 'Failed to load Zora relay posted ledger');
    return {};
  }
}

function pruneLedger(ledger: PostedLedger, nowMs: number): PostedLedger {
  const out: PostedLedger = {};

  for (const [address, timestamp] of Object.entries(ledger)) {
    const tsMs = Date.parse(timestamp);
    if (!Number.isFinite(tsMs)) continue;
    if (nowMs - tsMs <= DEDUP_WINDOW_MS) {
      out[normalizeAddress(address)] = new Date(tsMs).toISOString();
    }
  }

  return out;
}

async function flushPostedLedger(ledger: PostedLedger): Promise<void> {
  try {
    await fs.promises.mkdir(path.dirname(POSTED_LEDGER_FILE), { recursive: true });
    await fs.promises.writeFile(POSTED_LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to persist posted ledger: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

function wasPostedRecently(ledger: PostedLedger, address: string, nowMs: number): boolean {
  const normalized = normalizeAddress(address);
  const timestamp = ledger[normalized];
  if (!timestamp) return false;

  const postedAtMs = Date.parse(timestamp);
  if (!Number.isFinite(postedAtMs)) return false;
  return nowMs - postedAtMs < DEDUP_WINDOW_MS;
}

function markPostedNow(ledger: PostedLedger, address: string, isoTs: string): void {
  ledger[normalizeAddress(address)] = isoTs;
}

async function sendTelegramMessage(botToken: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHANNEL,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.description || `${response.status} ${response.statusText}`;
    throw new Error(`Telegram HTTP error: ${detail}`);
  }

  if (!payload?.ok) {
    throw new Error(`Telegram API error: ${payload?.description || 'unknown error'}`);
  }
}

export async function relayZoraAlphaToTelegram(): Promise<ZoraTelegramRelayResult> {
  const result: ZoraTelegramRelayResult = {
    posted: 0,
    skipped: 0,
    premium: {
      sent: 0,
      failed: 0,
    },
    errors: [],
  };

  const botToken = process.env.POLYBET_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    const msg = 'Missing Telegram bot token (POLYBET_BOT_TOKEN or TELEGRAM_BOT_TOKEN)';
    logger.error(msg);
    result.errors.push(msg);
    return result;
  }

  const nowMs = Date.now();
  let ledger = pruneLedger(await loadPostedLedger(), nowMs);

  let topCoins: ZoraTrendingCoin[] = [];
  try {
    const response = await getZoraTrendingCoins(20);
    topCoins = [...response.coins]
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, RELAY_SIZE);

    if (response.source === 'error' && response.coins.length === 0) {
      result.errors.push('Zora trending source returned error with no coins');
    }
  } catch (error) {
    const message = `Failed to fetch Zora trending coins: ${error instanceof Error ? error.message : 'unknown error'}`;
    logger.error({ err: error }, message);
    result.errors.push(message);
    return result;
  }

  if (topCoins.length === 0) {
    logger.warn('No Zora coins available to relay');
    return result;
  }

  for (const coin of topCoins) {
    if (!coin.address) {
      result.skipped += 1;
      result.errors.push(`Skipped coin with missing address: ${coin.symbol || coin.name || 'unknown'}`);
      continue;
    }

    if (wasPostedRecently(ledger, coin.address, nowMs)) {
      result.skipped += 1;
      continue;
    }

    const message = formatTelegramMessage(coin);
    try {
      await sendTelegramMessage(botToken, message);
      result.posted += 1;
      markPostedNow(ledger, coin.address, new Date().toISOString());
    } catch (error) {
      const errMessage = `Failed posting ${coin.symbol || coin.address}: ${error instanceof Error ? error.message : 'unknown error'}`;
      logger.error({ err: error, address: coin.address, symbol: coin.symbol }, 'Zora relay post failed');
      result.errors.push(errMessage);
    }
  }

  try {
    await flushPostedLedger(ledger);
  } catch (error) {
    logger.error({ err: error }, 'Zora relay failed to save posted ledger');
    result.errors.push(error instanceof Error ? error.message : 'Failed to persist posted ledger');
  }

  try {
    result.premium = await relayToPremiumSubscribers(topCoins);
    logger.info(
      {
        premiumSent: result.premium.sent,
        premiumFailed: result.premium.failed,
      },
      'Zora alpha premium relay completed'
    );
  } catch (error) {
    const message = `Premium relay failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    logger.error({ err: error }, message);
    result.errors.push(message);
  }

  logger.info(
    {
      posted: result.posted,
      skipped: result.skipped,
      premiumSent: result.premium.sent,
      premiumFailed: result.premium.failed,
      errors: result.errors.length,
    },
    'Zora alpha Telegram relay completed'
  );

  return result;
}
