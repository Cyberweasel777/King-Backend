/**
 * Sentinel Intelligence Routes — Premium predictive signal endpoints.
 *
 * Gated to Sentinel tier ($49.99/mo) API keys only.
 * Serves both human-readable and machine-consumable formats.
 */

import fs from 'fs';
import path from 'path';
import { Request, Response, Router } from 'express';
import { extractApiKey, getApiKeyEntry } from '../middleware/apiKeyAuth';
import logger from '../../config/logger';
import { getCachedSentinelReport, type SentinelReport } from '../../services/botindex/sentinel/signals';
import { getCachedNetworkIntelligence, type NetworkIntelligenceReport } from '../../services/botindex/sentinel/network-intelligence';
import { collectEcosystemIntel } from '../../services/botindex/sentinel/ecosystem-intel';

const router = Router();

const REGISTER_URL = 'https://api.botindex.dev/api/botindex/keys/register?plan=sentinel';

function isSentinelAuthorized(req: Request): boolean {
  const key = extractApiKey(req);
  if (!key) return false;
  const entry = getApiKeyEntry(key);
  if (!entry || entry.status !== 'active') return false;
  return entry.plan === 'sentinel' || entry.plan === 'enterprise';
}

function buildUpgradeResponse() {
  return {
    error: 'sentinel_required',
    message: 'Sentinel Intelligence requires a Sentinel-tier API key.',
    upgrade: {
      url: REGISTER_URL,
      plan: 'sentinel',
      price: '$49.99/mo',
      includes: [
        'All Pro features (500 req/day, all endpoints)',
        'Predictive intelligence signals (proprietary behavioral models)',
        'Cross-source convergence analysis (8+ data sources)',
        'Real-time spike/dump Telegram & webhook alerts',
        'Historical signal backtest API (after 30 days)',
        'Network Momentum Index (proprietary)',
        'Smart Flow Divergence detection',
        'Risk Cascade Score',
        'DeepSeek-powered market narrative synthesis',
      ],
    },
    teaser: {
      message: 'Here\'s what Sentinel is analyzing right now:',
      sources: ['Hyperliquid whale positions', 'Funding rate arbitrage', 'Fear & Greed Index', 'CoinGecko trending', 'DeFiLlama TVL flows', 'Social sentiment (Reddit/GitHub)', 'Proprietary network momentum', 'DeepSeek convergence synthesis'],
      sample_signal_types: ['dump_warning', 'pump_signal', 'risk_cascade', 'momentum_surge', 'whale_divergence', 'sentiment_shift'],
    },
  };
}

// Human-readable HTML dashboard
function renderHtmlReport(report: SentinelReport): string {
  const alertColors = { GREEN: '#22c55e', YELLOW: '#eab308', ORANGE: '#f97316', RED: '#ef4444' };
  const alertColor = alertColors[report.alert_level] || '#6b7280';

  const signalRows = report.signals.map(s => {
    const typeEmoji = {
      dump_warning: '🔻', pump_signal: '🚀', risk_cascade: '⚠️',
      momentum_surge: '📈', momentum_decay: '📉', sentiment_shift: '🔄', whale_divergence: '🐋',
    }[s.type] || '•';
    const dirColor = s.direction === 'bullish' ? '#22c55e' : s.direction === 'bearish' ? '#ef4444' : '#6b7280';

    return `<tr>
      <td>${typeEmoji} ${s.type.replace('_', ' ')}</td>
      <td><b>${s.asset}</b></td>
      <td><span style="color:${dirColor}">${s.direction.toUpperCase()}</span></td>
      <td>${s.strength}/100</td>
      <td>${s.confidence}</td>
      <td>${s.narrative}</td>
      <td><i>${s.actionable}</i></td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sentinel Intelligence</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:20px}
.container{max-width:1100px;margin:0 auto}
h1{color:#f8fafc;font-size:1.8rem}
.regime{display:inline-block;padding:6px 16px;border-radius:6px;background:${alertColor};color:#000;font-weight:700;font-size:1.1rem}
.synthesis{background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;font-size:1rem;line-height:1.6;border-left:4px solid ${alertColor}}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{text-align:left;padding:8px;border-bottom:2px solid #334155;color:#94a3b8;font-size:.85rem;text-transform:uppercase}
td{padding:8px;border-bottom:1px solid #1e293b;font-size:.9rem}
tr:hover{background:#1e293b}
.meta{color:#64748b;font-size:.8rem;margin-top:20px}
.refresh{color:#38bdf8;text-decoration:none;font-size:.85rem}
</style></head><body>
<div class="container">
<h1>🛡️ Sentinel Intelligence</h1>
<div class="regime">${report.alert_level} — ${report.market_regime.replace('_', ' ').toUpperCase()}</div>
<div class="synthesis">${report.synthesis}</div>
<table><thead><tr><th>Signal</th><th>Asset</th><th>Direction</th><th>Strength</th><th>Confidence</th><th>Analysis</th><th>Action</th></tr></thead>
<tbody>${signalRows}</tbody></table>
<div class="meta">
Sources: ${report.metadata.sources_ok}/8 OK | DeepSeek: ${report.metadata.deepseek_used ? '✅' : '❌'} | Latency: ${report.metadata.latency_ms}ms | Updated: ${report.timestamp}
<br><a class="refresh" href="/api/botindex/sentinel/signals">↻ Refresh</a>
</div></div></body></html>`;
}

// GET /sentinel/signals — main intelligence endpoint (JSON or HTML)
router.get('/sentinel/signals', async (req: Request, res: Response) => {
  // Check authorization
  if (!isSentinelAuthorized(req)) {
    const accept = req.headers.accept || '';

    // HTML response for browsers
    if (accept.includes('text/html')) {
      const upgrade = buildUpgradeResponse();
      res.status(403).send(`<!DOCTYPE html><html><head><title>Sentinel — Upgrade Required</title>
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#1e293b;padding:40px;border-radius:12px;max-width:600px;text-align:center}
h1{color:#f59e0b}a{color:#38bdf8}ul{text-align:left;line-height:2}</style></head><body>
<div class="card"><h1>🛡️ Sentinel Intelligence</h1>
<p>Predictive signals powered by proprietary behavioral models.</p>
<p><b>$49.99/mo</b></p>
<ul>${upgrade.upgrade.includes.map(i => `<li>${i}</li>`).join('')}</ul>
<p><a href="${REGISTER_URL}">Upgrade to Sentinel →</a></p>
</div></body></html>`);
      return;
    }

    // JSON response for APIs/bots
    res.status(403).json(buildUpgradeResponse());
    return;
  }

  try {
    const report = await getCachedSentinelReport();
    const accept = req.headers.accept || '';

    if (accept.includes('text/html')) {
      res.type('html').send(renderHtmlReport(report));
    } else {
      res.json(report);
    }
  } catch (err) {
    logger.error({ err }, 'Sentinel signals endpoint failed');
    res.status(500).json({ error: 'sentinel_error', message: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// GET /sentinel/status — public status (shows alert level without full signals)
router.get('/sentinel/status', async (_req: Request, res: Response) => {
  try {
    const report = await getCachedSentinelReport();
    res.json({
      timestamp: report.timestamp,
      alert_level: report.alert_level,
      market_regime: report.market_regime,
      signal_count: report.signals.length,
      top_signal: report.signals[0] ? {
        type: report.signals[0].type,
        asset: report.signals[0].asset,
        direction: report.signals[0].direction,
        strength: report.signals[0].strength,
      } : null,
      upgrade: {
        url: REGISTER_URL,
        message: 'Full signals available with Sentinel plan ($49.99/mo)',
      },
    });
  } catch (err) {
    logger.error({ err }, 'Sentinel status endpoint failed');
    res.status(500).json({ error: 'sentinel_status_error' });
  }
});

// GET /sentinel/network-intelligence — proprietary ecosystem scoring
router.get('/sentinel/network-intelligence', async (req: Request, res: Response) => {
  if (!isSentinelAuthorized(req)) {
    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      res.status(403).send(`<!DOCTYPE html><html><head><title>Network Intelligence — Upgrade Required</title>
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#1e293b;padding:40px;border-radius:12px;max-width:600px;text-align:center}
h1{color:#f59e0b}a{color:#38bdf8}ul{text-align:left;line-height:2}</style></head><body>
<div class="card"><h1>📡 Network Intelligence Index</h1>
<p>Proprietary ecosystem momentum scoring across 8 networks.</p>
<p><b>$49.99/mo</b> — included with Sentinel plan</p>
<ul><li>Real-time convergence scoring across crypto ecosystems</li>
<li>Momentum tracking (7-day trend velocity)</li>
<li>Multi-source signal fusion (proprietary network analysis)</li>
<li>Historical trend data for backtesting</li></ul>
<p><a href="${REGISTER_URL}">Upgrade to Sentinel →</a></p>
</div></body></html>`);
      return;
    }
    res.status(403).json({
      error: 'sentinel_required',
      message: 'Network Intelligence Index requires a Sentinel-tier API key.',
      upgrade: { url: REGISTER_URL, plan: 'sentinel', price: '$49.99/mo' },
      teaser: {
        message: 'Proprietary ecosystem momentum scoring across 8 networks.',
        ecosystems_tracked: ['Zora', 'Hyperliquid', 'Base', 'Solana', 'Ethereum L1', 'Uniswap', 'Aave', 'Pump.fun'],
      },
    });
    return;
  }

  try {
    const report = await getCachedNetworkIntelligence();
    const accept = req.headers.accept || '';

    if (accept.includes('text/html')) {
      res.type('html').send(renderNetworkIntelHtml(report));
    } else {
      res.json(report);
    }
  } catch (err) {
    logger.error({ err }, 'Network Intelligence endpoint failed');
    res.status(500).json({ error: 'network_intelligence_error', message: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// GET /sentinel/network-intelligence/rankings — public teaser (just rankings, no details)
router.get('/sentinel/network-intelligence/rankings', async (_req: Request, res: Response) => {
  try {
    const report = await getCachedNetworkIntelligence();
    res.json({
      timestamp: report.timestamp,
      rankings: report.rankings,
      hottest: report.hottest,
      biggest_mover: report.biggest_mover,
      upgrade: {
        url: REGISTER_URL,
        message: 'Full ecosystem breakdown available with Sentinel plan ($49.99/mo)',
      },
    });
  } catch (err) {
    logger.error({ err }, 'Network Intelligence rankings failed');
    res.status(500).json({ error: 'rankings_error' });
  }
});

function renderNetworkIntelHtml(report: NetworkIntelligenceReport): string {
  const rows = report.ecosystems.map(e => {
    const trendEmoji = { surging: '🚀', growing: '📈', stable: '➡️', declining: '📉', dormant: '💤' }[e.trend];
    const scoreColor = e.score >= 70 ? '#22c55e' : e.score >= 40 ? '#eab308' : '#ef4444';
    const momColor = e.momentum_7d > 0 ? '#22c55e' : e.momentum_7d < 0 ? '#ef4444' : '#6b7280';

    return `<tr>
      <td><b>${e.ecosystem}</b></td>
      <td style="color:${scoreColor};font-weight:700">${e.score}/100</td>
      <td>${trendEmoji} ${e.trend}</td>
      <td style="color:${momColor}">${e.momentum_7d > 0 ? '+' : ''}${e.momentum_7d}%</td>
      <td>${e.components.github_velocity}</td>
      <td>${e.components.package_adoption}</td>
      <td>${e.components.tooling_growth}</td>
      <td>${e.components.community_size}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Network Intelligence Index</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui;background:#0f172a;color:#e2e8f0;margin:0;padding:20px}
.container{max-width:1200px;margin:0 auto}
h1{color:#f8fafc;font-size:1.8rem}
.hot{background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #f59e0b}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{text-align:left;padding:8px;border-bottom:2px solid #334155;color:#94a3b8;font-size:.8rem;text-transform:uppercase}
td{padding:8px;border-bottom:1px solid #1e293b;font-size:.9rem}
tr:hover{background:#1e293b}
.meta{color:#64748b;font-size:.8rem;margin-top:20px}
</style></head><body>
<div class="container">
<h1>📡 Network Intelligence Index</h1>
<div class="hot">🔥 <b>Hottest:</b> ${report.hottest} | 🔄 <b>Biggest Mover:</b> ${report.biggest_mover}</div>
<table><thead><tr><th>Ecosystem</th><th>Score</th><th>Trend</th><th>7d Momentum</th><th>Code Velocity</th><th>Package Adoption</th><th>Tooling</th><th>Community</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="meta">
Sources: ${report.metadata.sources_ok}/${report.metadata.sources_queried} | Latency: ${report.metadata.latency_ms}ms | Updated: ${report.timestamp}
</div></div></body></html>`;
}

// ── Ecosystem Intelligence (PUBLIC — differentiator) ─────────────────

// Cache ecosystem data for 5 min (expensive to fetch)
let ecosystemCache: { data: any; fetchedAt: number } | null = null;
const ECOSYSTEM_CACHE_TTL = 5 * 60 * 1000;

router.get('/sentinel/ecosystem', async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (ecosystemCache && (now - ecosystemCache.fetchedAt) < ECOSYSTEM_CACHE_TTL) {
      res.json(ecosystemCache.data);
      return;
    }

    const data = await collectEcosystemIntel();

    const response = {
      repos: data.repos.map(r => ({
        repo: r.repo,
        asset: r.asset,
        category: r.category,
        stars: r.stars,
        commitsWeekly: r.commitsRecent,
        pushedAt: r.pushedAt,
      })).sort((a, b) => b.commitsWeekly - a.commitsWeekly),
      npm: data.npm.map(n => ({
        package: n.pkg,
        asset: n.asset,
        category: n.category,
        weeklyDownloads: n.weeklyDownloads,
        prevWeekDownloads: n.prevWeekDownloads,
        growthPct: Math.round(n.growthPct * 10) / 10,
      })).sort((a, b) => b.growthPct - a.growthPct),
      sourcesOk: data.sourcesOk,
      fetchedAt: new Date().toISOString(),
    };

    ecosystemCache = { data: response, fetchedAt: now };
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Ecosystem endpoint failed');
    res.status(500).json({ error: 'ecosystem_error' });
  }
});

// ── Track Record (PUBLIC — this is the proof) ────────────────────────

router.get('/sentinel/track-record', async (_req: Request, res: Response) => {
  try {
    const { getTrackRecord } = await import('../../services/botindex/sentinel/prediction-tracker');
    const record = getTrackRecord();

    const wantsHtml = _req.headers.accept?.includes('text/html');
    if (wantsHtml) {
      const isSentinelHtml = isSentinelAuthorized(_req);
      const accuracyStr = record.accuracy !== null
        ? `${record.accuracy.toFixed(1)}%`
        : (record.totalPredictions > 0 && record.resolved === 0 ? 'Resolving in ~6h' : 'Collecting data...');
      const assetRows = Object.entries(record.byAsset)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([asset, s]) => `<tr><td>${asset}</td><td>${s.total}</td><td>${s.correct}</td><td>${s.accuracy.toFixed(1)}%</td></tr>`)
        .join('');
      const typeRows = Object.entries(record.byType)
        .sort((a, b) => b[1].accuracy - a[1].accuracy)
        .map(([type, s]) => `<tr><td>${type}</td><td>${s.total}</td><td>${s.correct}</td><td>${s.accuracy.toFixed(1)}%</td></tr>`)
        .join('');

      // Teaser rows: show asset + signal type + direction, lock the rest
      const teaserRows = record.recentPredictions.slice(-5).reverse()
        .map(p => `<tr><td>${new Date(p.timestamp).toLocaleString()}</td><td>${p.asset}</td><td>${p.signal_type}</td><td>${p.direction}</td><td>🔒</td><td>🔒</td></tr>`)
        .join('');
      const fullRows = record.recentPredictions.slice(-10).reverse()
        .map(p => `<tr><td>${new Date(p.timestamp).toLocaleString()}</td><td>${p.asset}</td><td>${p.signal_type}</td><td>${p.direction}</td><td>${p.strength}/100</td><td>$${p.entry_price_usd?.toFixed(2) || '?'}</td></tr>`)
        .join('');
      const recentRows = isSentinelHtml ? fullRows : teaserRows;

      const ctaHtml = isSentinelHtml ? '' : `
<div style="text-align:center;margin:32px 0;padding:24px;background:linear-gradient(135deg,#7c3aed22,#a78bfa22);border:1px solid #7c3aed44;border-radius:12px">
  <p style="font-size:1.1rem;color:#a78bfa;margin:0 0 8px">🔒 Full signal details — narratives, entry prices, strength scores</p>
  <a href="https://api.botindex.dev/api/botindex/keys/register?plan=sentinel" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem">Start 7-Day Free Trial →</a>
  <p style="color:#64748b;font-size:.8rem;margin:8px 0 0">$49.99/mo after trial · Cancel anytime</p>
</div>`;

      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sentinel Track Record</title>
<style>
body{font-family:system-ui;background:#0f172a;color:#e2e8f0;margin:0;padding:20px}
.container{max-width:1000px;margin:0 auto}
h1{color:#f8fafc} h2{color:#a78bfa;margin-top:24px}
.big{font-size:64px;font-weight:800;text-align:center;padding:20px;color:${record.accuracy && record.accuracy >= 60 ? '#10b981' : record.accuracy && record.accuracy >= 50 ? '#f59e0b' : '#ef4444'}}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center}
.stat{background:#1e293b;padding:16px;border-radius:8px}
.stat .n{font-size:24px;font-weight:700;color:#fff}
.stat .l{font-size:12px;color:#64748b;text-transform:uppercase}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{text-align:left;padding:8px;border-bottom:2px solid #334155;color:#94a3b8;font-size:.8rem;text-transform:uppercase}
td{padding:8px;border-bottom:1px solid #1e293b;font-size:.9rem}
.note{text-align:center;color:#64748b;font-size:.9rem;margin:20px}
</style></head><body><div class="container">
<h1>🎯 Sentinel Intelligence — Track Record</h1>
<div class="big">${accuracyStr}</div>
<div class="note">24-hour prediction accuracy across all signals</div>
<div class="stats">
<div class="stat"><div class="n">${record.totalPredictions}</div><div class="l">Total Predictions</div></div>
<div class="stat"><div class="n">${record.resolved}</div><div class="l">Resolved</div></div>
<div class="stat"><div class="n" style="color:#10b981">${record.correct}</div><div class="l">Correct</div></div>
<div class="stat"><div class="n">${record.pending}</div><div class="l">Pending</div></div>
</div>
<h2>By Signal Type</h2>
<table><thead><tr><th>Signal</th><th>Resolved</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>${typeRows || '<tr><td colspan="4" style="color:#64748b">Accumulating data...</td></tr>'}</tbody></table>
<h2>By Asset</h2>
<table><thead><tr><th>Asset</th><th>Resolved</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>${assetRows || '<tr><td colspan="4" style="color:#64748b">Accumulating data...</td></tr>'}</tbody></table>
<h2>📡 Ecosystem Intelligence — Live Developer Activity</h2>
<div id="ecosystem-data" style="color:#64748b;font-size:.9rem">Loading ecosystem data...</div>
<script>
fetch('/api/botindex/sentinel/ecosystem').then(r=>r.json()).then(d=>{
  let html='';
  if(d.npm&&d.npm.length){
    html+='<h3 style="color:#a78bfa;margin-top:16px;font-size:1rem">npm Package Downloads (weekly)</h3>';
    html+='<table><thead><tr><th>Package</th><th>Asset</th><th>Downloads/wk</th><th>Growth</th></tr></thead><tbody>';
    d.npm.forEach(n=>{
      const color=n.growthPct>0?'#10b981':n.growthPct<0?'#ef4444':'#64748b';
      html+='<tr><td>'+n.package+'</td><td>'+n.asset+'</td><td>'+n.weeklyDownloads.toLocaleString()+'</td><td style="color:'+color+'">'+(n.growthPct>0?'+':'')+n.growthPct+'%</td></tr>';
    });
    html+='</tbody></table>';
  }
  if(d.repos&&d.repos.length){
    html+='<h3 style="color:#a78bfa;margin-top:16px;font-size:1rem">GitHub Development Velocity (7-day)</h3>';
    html+='<table><thead><tr><th>Repository</th><th>Asset</th><th>Stars</th><th>Commits/7d</th></tr></thead><tbody>';
    d.repos.forEach(r=>{
      html+='<tr><td>'+r.repo+'</td><td>'+r.asset+'</td><td>'+r.stars.toLocaleString()+'</td><td>'+r.commitsWeekly+'</td></tr>';
    });
    html+='</tbody></table>';
  }
  html+='<div class="note">Updated: '+new Date(d.fetchedAt).toLocaleString()+' · '+d.sourcesOk+' sources active</div>';
  document.getElementById('ecosystem-data').innerHTML=html;
}).catch(()=>{document.getElementById('ecosystem-data').textContent='Ecosystem data temporarily unavailable';});
</script>
<h2>Recent Signals</h2>
<table><thead><tr><th>Time</th><th>Asset</th><th>Signal</th><th>Direction</th><th>Strength</th><th>Entry Price</th></tr></thead><tbody>${recentRows || '<tr><td colspan="6" style="color:#64748b">No predictions yet...</td></tr>'}</tbody></table>
${ctaHtml}
<div class="note">Data collection started ${record.recentPredictions[0]?.timestamp ? new Date(record.recentPredictions[0].timestamp).toLocaleDateString() : 'today'}. Track record builds over 30-90 days.</div>
</div></body></html>`);
      return;
    }

    // Gate detailed signals behind Sentinel auth
    const isSentinel = isSentinelAuthorized(_req);
    if (!isSentinel) {
      // Public: stats + redacted teasers (no narrative, no entry price, no strength)
      const teaserPredictions = record.recentPredictions.slice(-5).reverse().map(p => ({
        timestamp: p.timestamp,
        asset: p.asset,
        signal_type: p.signal_type,
        direction: p.direction,
        strength: '🔒',
        narrative: '🔒 Available with Sentinel tier',
        entry_price_usd: null,
        resolved: p.resolved,
      }));
      const teaserResolutions = record.recentResolutions.slice(-3).reverse().map(r => ({
        asset: r.asset,
        direction_predicted: r.direction_predicted,
        correct_24h: r.correct_24h,
        pct_change_24h: r.pct_change_24h ? `${r.pct_change_24h > 0 ? '+' : ''}${r.pct_change_24h.toFixed(1)}%` : null,
        entry_price: null,
        price_at_24h: null,
        timestamp: r.timestamp,
      }));
      res.json({
        totalPredictions: record.totalPredictions,
        resolved: record.resolved,
        correct: record.correct,
        incorrect: record.incorrect,
        pending: record.pending,
        accuracy: record.accuracy,
        byAsset: record.byAsset,
        byType: record.byType,
        recentPredictions: teaserPredictions,
        recentResolutions: teaserResolutions,
        message: 'Full signal details (narratives, entry prices, strength scores) available with Sentinel tier.',
        upgrade: { url: 'https://api.botindex.dev/api/botindex/keys/register?plan=sentinel', price: '$49.99/mo', trial: '7-day free trial' },
      });
      return;
    }

    res.json(record);
  } catch (err) {
    logger.error({ err }, 'Track record endpoint failed');
    res.status(500).json({ error: 'track_record_error' });
  }
});

// ── Query Surge Intelligence (PUBLIC teaser, full for Sentinel) ──────

router.get('/sentinel/query-intelligence', async (req: Request, res: Response) => {
  try {
    const surgeFile = path.join(process.env.DATA_DIR || '/data', 'query-surge-history.jsonl');
    if (!fs.existsSync(surgeFile)) {
      res.json({ signals: [], message: 'Query intelligence is accumulating data.' });
      return;
    }

    const lines = fs.readFileSync(surgeFile, 'utf-8').trim().split('\n').filter(Boolean);
    const entries = lines.slice(-288).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    // Aggregate endpoint hit patterns
    const endpointCounts: Record<string, { total: number; spikes: number; lastSeen: string }> = {};
    for (const entry of entries) {
      if (!entry.windows) continue;
      for (const w of entry.windows) {
        const ep = w.endpoint || 'unknown';
        if (!endpointCounts[ep]) endpointCounts[ep] = { total: 0, spikes: 0, lastSeen: '' };
        endpointCounts[ep].total += w.count || 0;
        if (w.isSpike) endpointCounts[ep].spikes++;
        endpointCounts[ep].lastSeen = w.windowStart || entry.timestamp || '';
      }
    }

    const ranked = Object.entries(endpointCounts)
      .map(([endpoint, stats]) => ({ endpoint, ...stats }))
      .sort((a, b) => b.total - a.total);

    const isSentinel = isSentinelAuthorized(req);

    if (!isSentinel) {
      // Public teaser — show top 3 only, hide endpoint names
      const teaser = ranked.slice(0, 3).map((r, i) => ({
        rank: i + 1,
        category: r.endpoint.includes('zora') ? 'NFT/Meme' : r.endpoint.includes('hyperliquid') ? 'DeFi/Perps' : r.endpoint.includes('crypto') ? 'Crypto' : 'Other',
        interest_level: r.total > 1000 ? 'EXTREME' : r.total > 100 ? 'HIGH' : 'MODERATE',
        spike_count: r.spikes,
      }));

      res.json({
        query_intelligence: teaser,
        total_categories_tracked: ranked.length,
        data_window: `${entries.length} snapshots (~${Math.round(entries.length * 5 / 60)}h)`,
        message: 'Full endpoint-level query intelligence available with Sentinel tier.',
        upgrade: { url: REGISTER_URL, price: '$49.99/mo' },
      });
      return;
    }

    // Full Sentinel response
    res.json({
      query_intelligence: ranked,
      total_endpoints: ranked.length,
      total_requests_tracked: ranked.reduce((s, r) => s + r.total, 0),
      total_spikes: ranked.reduce((s, r) => s + r.spikes, 0),
      data_window: `${entries.length} snapshots (~${Math.round(entries.length * 5 / 60)}h)`,
      insight: ranked[0] ? `Highest demand: ${ranked[0].endpoint} with ${ranked[0].total} requests and ${ranked[0].spikes} spike events` : 'Insufficient data',
    });
  } catch (err) {
    logger.error({ err }, 'Query intelligence endpoint failed');
    res.status(500).json({ error: 'query_intelligence_error' });
  }
});

export default router;
