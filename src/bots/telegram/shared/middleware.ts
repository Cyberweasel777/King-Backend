// Rate limiter
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const defaultConfig: RateLimitConfig = { windowMs: 60_000, maxRequests: 12 };
const commandUsage = new Map<string, { count: number; resetAt: number }>();

export function allowCommand(userId: string | undefined, config: RateLimitConfig = defaultConfig): boolean {
  if (!userId) return true;
  const now = Date.now();
  const row = commandUsage.get(userId);
  if (!row || now > row.resetAt) {
    commandUsage.set(userId, { count: 1, resetAt: now + config.windowMs });
    return true;
  }
  if (row.count >= config.maxRequests) return false;
  row.count += 1;
  return true;
}

// Markdown escape
export function escapeMd(input: string): string {
  return input.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1');
}

// Safe argument extraction from command text
export function extractArg(text: string | undefined, maxLength: number = 120): string {
  if (!text) return '';
  const [, ...rest] = text.trim().split(/\s+/);
  return rest.join(' ').trim().slice(0, maxLength);
}

// Short address display
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}
