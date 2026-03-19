import sharp from 'sharp';

export interface SignalCardInput {
  asset: string;
  signal_type: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  narrative: string;
  entry_price_usd: number | null;
  timestamp: string;
}

const WIDTH = 1200;
const HEIGHT = 630;

function clampStrength(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function collapseLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function formatPriceUsd(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return 'N/A';

  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  if (price >= 1) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`;
}

function formatTimestamp(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return `${date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')}`;
}

function getDirectionStyle(direction: SignalCardInput['direction']): { badge: string; accent: string; label: string } {
  if (direction === 'bullish') {
    return { badge: '#16a34a', accent: '#22c55e', label: 'BULLISH' };
  }
  if (direction === 'bearish') {
    return { badge: '#dc2626', accent: '#ef4444', label: 'BEARISH' };
  }
  return { badge: '#ca8a04', accent: '#facc15', label: 'NEUTRAL' };
}

function buildSvg(signal: SignalCardInput): string {
  const strength = clampStrength(signal.strength);
  const direction = signal.direction || 'neutral';
  const directionStyle = getDirectionStyle(direction);
  const asset = escapeXml(signal.asset.toUpperCase());
  const signalType = escapeXml(signal.signal_type.replace(/_/g, ' ').toUpperCase());
  const narrative = escapeXml(truncate(collapseLine(signal.narrative || ''), 130));
  const entry = escapeXml(formatPriceUsd(signal.entry_price_usd));
  const timestamp = escapeXml(formatTimestamp(signal.timestamp));

  const badgeText = `${signalType} • ${directionStyle.label}`;
  const badgeWidth = Math.max(250, Math.min(500, 28 + badgeText.length * 10));
  const strengthWidth = Math.round((strength / 100) * 560);

  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="panelGlow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.05" />
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#020617" flood-opacity="0.6"/>
    </filter>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGradient)" />
  <circle cx="1050" cy="90" r="220" fill="#38bdf8" opacity="0.07" />
  <circle cx="140" cy="620" r="260" fill="#22d3ee" opacity="0.04" />

  <rect x="42" y="36" width="1116" height="558" rx="28" fill="#0b1224" fill-opacity="0.58" stroke="#334155" stroke-opacity="0.55" filter="url(#softShadow)" />
  <rect x="42" y="36" width="1116" height="558" rx="28" fill="url(#panelGlow)" />

  <text x="86" y="95" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" letter-spacing="2.2">BOTINDEX SENTINEL</text>

  <rect x="86" y="128" width="${badgeWidth}" height="52" rx="26" fill="${directionStyle.badge}" />
  <text x="112" y="161" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">${escapeXml(badgeText)}</text>

  <text x="86" y="282" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="124" font-weight="800" letter-spacing="2">${asset}</text>

  <text x="86" y="336" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600">STRENGTH ${strength}/100</text>
  <rect x="86" y="356" width="560" height="26" rx="13" fill="#1f2937" />
  <rect x="86" y="356" width="${strengthWidth}" height="26" rx="13" fill="${directionStyle.accent}" />

  <text x="86" y="436" fill="#e2e8f0" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="500">${narrative}</text>

  <text x="86" y="506" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">Entry: ${entry}</text>
  <text x="86" y="548" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="500">Signal time: ${timestamp}</text>

  <text x="86" y="582" fill="#64748b" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="500">botindex.dev/sentinel • Free delayed signals @BotIndexSignals</text>
</svg>
`.trim();
}

export async function generateSignalCard(signal: SignalCardInput): Promise<Buffer> {
  const svg = buildSvg(signal);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
