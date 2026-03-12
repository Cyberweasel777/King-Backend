/**
 * Standardized Time Constants — king-backend
 * Extracted from: TechDebt_Queue_2026-03-10-1207.md / PR-2
 * Purpose: Eliminate magic numbers, provide single source of truth
 * Status: Ready for PR-2 migration
 * 
 * @module constants/time
 */

/**
 * Millisecond durations for timeouts, intervals, and caching
 */
export const MS = {
  SECOND: 1_000,
  MINUTE: 60_000,
  FIVE_MINUTES: 300_000,
  FIFTEEN_MINUTES: 900_000,
  THIRTY_MINUTES: 1_800_000,
  HOUR: 3_600_000,
  FOUR_HOURS: 14_400_000,
  DAY: 86_400_000,
  WEEK: 604_800_000,
} as const;

/**
 * HTTP client timeout configurations
 */
export const HTTP_TIMEOUT = {
  DEFAULT: 30_000,
  EXTENDED: 60_000,
  WEBSOCKET: 120_000,
  STREAMING: 300_000,
} as const;

/**
 * Scheduler and queue system intervals
 */
export const SCHEDULER = {
  /** Default polling interval for bot checks */
  DEFAULT_INTERVAL_MS: MS.MINUTE,
  /** Queue drain timeout before forced shutdown */
  QUEUE_DRAIN_TIMEOUT_MS: 30_000,
  /** Max time to wait for graceful shutdown */
  SHUTDOWN_TIMEOUT_MS: MS.FIFTEEN_MINUTES,
  /** Cron alignment offset (start of minute) */
  CRON_ALIGN_MS: 100,
} as const;

/**
 * Cache TTL configurations
 */
export const CACHE = {
  /** Default cache entry lifetime */
  TTL_DEFAULT_MS: MS.FIFTEEN_MINUTES,
  /** Short-lived cache for volatile data */
  TTL_SHORT_MS: MS.FIVE_MINUTES,
  /** Long-lived cache for stable reference data */
  TTL_LONG_MS: MS.HOUR,
  /** Cleanup interval for expired entries */
  CLEANUP_INTERVAL_MS: MS.FIVE_MINUTES,
} as const;

/**
 * Rate limiting window configurations
 */
export const RATE_LIMIT = {
  /** Anonymous hourly quota window */
  HOURLY_WINDOW_MS: MS.HOUR,
  /** Daily quota window for authenticated users */
  DAILY_WINDOW_MS: MS.DAY,
  /** Burst window for high-frequency endpoints */
  BURST_WINDOW_MS: MS.SECOND * 10,
} as const;

/**
 * Bot-specific polling intervals
 */
export const BOT_POLLING = {
  /** SpreadHunter: Odds comparison frequency */
  SPREADHUNTER: MS.MINUTE * 2,
  /** RosterRadar: Lineup check frequency */
  ROSTERRADAR: MS.FIVE_MINUTES,
  /** MemeRadar: New token scan frequency */
  MEMERADAR: MS.MINUTE * 30,
  /** ArbWatch: Arbitrage opportunity scan */
  ARBWATCH: MS.MINUTE,
  /** GradSniper: Graduation monitoring */
  GRADSNIPER: MS.FIFTEEN_MINUTES,
} as const;

/**
 * API provider rate limit compliance
 */
export const PROVIDER_THROTTLE = {
  /** DeepSeek API: requests per minute */
  DEEPSEEK_RPM: 60,
  /** DeepSeek API: minimum interval between requests */
  DEEPSEEK_MIN_INTERVAL_MS: MS.SECOND,
  /** Brave Search: requests per month (free tier) */
  BRAVE_MONTHLY_QUOTA: 2000,
  /** Firecrawl: credits per month */
  FIRECRAWL_CREDITS: 500,
  /** Telegram bot: message rate limit */
  TELEGRAM_MSG_PER_SEC: 30,
} as const;

/**
 * Human-readable time generators for queries
 */
export const TimeAgo = {
  oneHour: (): string => new Date(Date.now() - MS.HOUR).toISOString(),
  fourHours: (): string => new Date(Date.now() - MS.FOUR_HOURS).toISOString(),
  oneDay: (): string => new Date(Date.now() - MS.DAY).toISOString(),
  oneWeek: (): string => new Date(Date.now() - MS.WEEK).toISOString(),
  minutes: (n: number): string => new Date(Date.now() - n * MS.MINUTE).toISOString(),
} as const;

/**
 * Duration formatting for logs and UIs
 */
export const Duration = {
  msToSeconds: (ms: number): number => Math.round(ms / 1000),
  msToMinutes: (ms: number): number => Math.round(ms / MS.MINUTE * 10) / 10,
  msToHours: (ms: number): number => Math.round(ms / MS.HOUR * 100) / 100,
  format: (ms: number): string => {
    if (ms < MS.SECOND) return `${ms}ms`;
    if (ms < MS.MINUTE) return `${Math.round(ms / 1000)}s`;
    if (ms < MS.HOUR) return `${Math.round(ms / MS.MINUTE)}m`;
    if (ms < MS.DAY) return `${Math.round(ms / MS.HOUR * 10) / 10}h`;
    return `${Math.round(ms / MS.DAY * 10) / 10}d`;
  },
} as const;

/**
 * Legacy export for backward compatibility during migration
 * @deprecated Use specific constant groups above
 */
export const TIME = {
  MILLISECONDS: MS,
  HTTP: HTTP_TIMEOUT,
  SCHEDULER,
  CACHE,
  RATE_LIMIT,
} as const;

export default TIME;
