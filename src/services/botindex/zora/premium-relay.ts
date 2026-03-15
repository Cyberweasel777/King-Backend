import logger from '../../../config/logger';
import { ZoraTrendingCoin } from './trending';
import { loadZoraAlphaSubscribers } from './subscriber-store';

const MAX_MESSAGES_PER_SECOND = 30;

const numberFormatter = new Intl.NumberFormat('en-US');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function formatPremiumTelegramMessage(coin: ZoraTrendingCoin): string {
  const isUp = coin.marketCapDelta24h >= 0;
  const changeEmoji = isUp ? '📈' : '📉';
  const symbol = coin.symbol?.trim() || 'N/A';

  return [
    '⚡ <b>PREMIUM</b>',
    '',
    `🪙 <b>${escapeHtml(coin.name)}</b> (${escapeHtml(symbol)})`,
    '',
    `💰 Market Cap: ${formatUsdRounded(coin.marketCap)}`,
    `📊 24h Volume: ${formatUsdRounded(coin.volume24h)}`,
    `👥 Holders: ${numberFormatter.format(Math.max(0, Math.floor(coin.uniqueHolders || 0)))}`,
    `${changeEmoji} 24h Change: ${formatDelta(coin.marketCapDelta24h)}`,
    '',
    `🔗 <a href="${buildZoraLink(coin.address)}">View on Zora</a>`,
  ].join('\n');
}

async function sendTelegramDm(
  botToken: string,
  chatId: number,
  text: string
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
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

  if (!response.ok || !payload?.ok) {
    const detail = payload?.description || `${response.status} ${response.statusText}`;
    throw new Error(`Telegram sendMessage failed: ${detail}`);
  }
}

export async function relayToPremiumSubscribers(
  coins: ZoraTrendingCoin[]
): Promise<{ sent: number; failed: number }> {
  if (!coins.length) {
    return { sent: 0, failed: 0 };
  }

  const botToken = process.env.ZORA_ALPHA_BOT_TOKEN || '';
  if (!botToken) {
    logger.warn('Skipping premium relay: ZORA_ALPHA_BOT_TOKEN not set');
    return { sent: 0, failed: 0 };
  }

  const subscribers = await loadZoraAlphaSubscribers();
  const premiumUsers = Object.values(subscribers).filter(
    (subscriber) => subscriber.status === 'active' || subscriber.status === 'trial'
  );

  if (!premiumUsers.length) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  let attemptsInWindow = 0;
  let windowStartMs = Date.now();

  for (const subscriber of premiumUsers) {
    for (const coin of coins) {
      const nowMs = Date.now();
      const elapsedMs = nowMs - windowStartMs;

      if (elapsedMs >= 1000) {
        windowStartMs = nowMs;
        attemptsInWindow = 0;
      }

      if (attemptsInWindow >= MAX_MESSAGES_PER_SECOND) {
        await sleep(Math.max(0, 1000 - elapsedMs));
        windowStartMs = Date.now();
        attemptsInWindow = 0;
      }

      attemptsInWindow += 1;

      try {
        await sendTelegramDm(botToken, subscriber.chatId, formatPremiumTelegramMessage(coin));
        sent += 1;
      } catch (error) {
        failed += 1;
        logger.warn(
          {
            err: error,
            chatId: subscriber.chatId,
            symbol: coin.symbol,
            address: coin.address,
          },
          'Premium relay message send failed'
        );
      }
    }
  }

  return { sent, failed };
}
