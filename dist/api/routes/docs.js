"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BotIndex API Documentation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.6;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    header {
      text-align: center;
      padding: 60px 0;
      border-bottom: 1px solid #1a1a2e;
      margin-bottom: 48px;
    }
    h1 {
      font-size: 48px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 16px;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 18px;
      color: #a1a1aa;
      max-width: 600px;
      margin: 0 auto;
    }
    h2 {
      font-size: 28px;
      color: #fff;
      margin: 48px 0 24px;
      padding-bottom: 12px;
      border-bottom: 1px solid #1a1a2e;
    }
    h3 {
      font-size: 20px;
      color: #00f0ff;
      margin: 32px 0 16px;
    }
    .section {
      background: #1a1a2e;
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 24px;
      border: 1px solid #27273a;
    }
    .endpoint {
      background: #0a0a0a;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 12px 0;
      border-left: 3px solid #00f0ff;
      display: flex;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }
    .method {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      font-weight: 600;
      color: #00f0ff;
      background: #00f0ff15;
      padding: 4px 10px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .path {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 14px;
      color: #fff;
      flex: 1;
      min-width: 200px;
    }
    .description {
      color: #a1a1aa;
      font-size: 14px;
      width: 100%;
      margin-top: 8px;
    }
    .category {
      margin-bottom: 8px;
    }
    .category-title {
      font-size: 14px;
      font-weight: 600;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 24px 0 12px;
    }
    code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: #0a0a0a;
      padding: 2px 6px;
      border-radius: 4px;
      color: #00f0ff;
      font-size: 13px;
    }
    .code-block {
      background: #0a0a0a;
      border-radius: 8px;
      padding: 20px;
      margin: 16px 0;
      overflow-x: auto;
      border: 1px solid #27273a;
    }
    .code-block pre {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      color: #e5e5e5;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .code-block .comment {
      color: #71717a;
    }
    .quick-start {
      background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%);
    }
    .rate-limits {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .limit-card {
      background: #0a0a0a;
      border-radius: 8px;
      padding: 20px;
      border: 1px solid #27273a;
    }
    .limit-card h4 {
      color: #fff;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .limit-card p {
      color: #a1a1aa;
      font-size: 13px;
    }
    .links-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .link-card {
      background: #0a0a0a;
      border-radius: 8px;
      padding: 20px;
      border: 1px solid #27273a;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .link-card:hover {
      border-color: #00f0ff40;
      background: #00f0ff08;
    }
    .link-card h4 {
      color: #00f0ff;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .link-card p {
      color: #71717a;
      font-size: 12px;
    }
    .auth-methods {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .auth-method {
      background: #0a0a0a;
      border-radius: 8px;
      padding: 16px 20px;
      border: 1px solid #27273a;
    }
    .auth-method strong {
      color: #fff;
      display: block;
      margin-bottom: 4px;
    }
    .auth-method span {
      color: #a1a1aa;
      font-size: 13px;
    }
    .highlight {
      color: #00f0ff;
    }
    footer {
      text-align: center;
      padding: 48px 0;
      border-top: 1px solid #1a1a2e;
      margin-top: 48px;
      color: #71717a;
      font-size: 14px;
    }
    footer a {
      color: #00f0ff;
      text-decoration: none;
    }
    @media (max-width: 768px) {
      h1 { font-size: 32px; }
      .section { padding: 24px; }
      .endpoint { flex-direction: column; }
      .path { min-width: auto; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>BotIndex API Documentation</h1>
      <p class="subtitle">AI-powered market intelligence for agents and developers</p>
    </header>

    <div class="section">
      <h2>Authentication</h2>
      <div class="auth-methods">
        <div class="auth-method">
          <strong>Free Tier</strong>
          <span>Use <code>X-API-Key</code> header or <code>?apiKey=</code> query parameter</span>
        </div>
        <div class="auth-method">
          <strong>Register for Free API Key</strong>
          <span><code>GET /api/botindex/keys/register?plan=free</code></span>
        </div>
        <div class="auth-method">
          <strong>Paid Plans</strong>
          <span><code>GET /api/botindex/keys/register?plan=basic</code> (redirects to Stripe)</span>
        </div>
      </div>
    </div>

    <div class="section quick-start">
      <h2>Quick Start</h2>
      <div class="code-block">
        <pre><span class="comment"># 1. Get a free API key</span>
curl https://api.botindex.dev/api/botindex/keys/register?plan=free

<span class="comment"># 2. Use it</span>
curl -H <span class="highlight">"X-API-Key: YOUR_KEY"</span> https://api.botindex.dev/api/botindex/v1/signals</pre>
      </div>
    </div>

    <div class="section">
      <h2>Endpoint Reference</h2>

      <div class="category">
        <div class="category-title">Signals & Intelligence</div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/v1/signals</span>
          <span class="description">Live market signals</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/v1/sports</span>
          <span class="description">Sports intelligence</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/v1/crypto</span>
          <span class="description">Crypto market data</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/v1/solana</span>
          <span class="description">Solana ecosystem data</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/v1/commerce</span>
          <span class="description">Commerce signals</span>
        </div>
      </div>

      <div class="category">
        <div class="category-title">Hyperliquid</div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/hyperliquid/funding-arb</span>
          <span class="description">Funding rate arbitrage</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/hyperliquid/correlation-leaders</span>
          <span class="description">Correlated pairs</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/hyperliquid/liquidation-heatmap</span>
          <span class="description">Liquidation zones</span>
        </div>
      </div>

      <div class="category">
        <div class="category-title">Social Intelligence</div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/social/convergence</span>
          <span class="description">Cross-platform convergence signals</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/social/twitter/sentiment</span>
          <span class="description">Twitter/X sentiment</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/social/twitter/narratives</span>
          <span class="description">Narrative tracking</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/social/twitter/trending</span>
          <span class="description">Trending topics</span>
        </div>
      </div>

      <div class="category">
        <div class="category-title">Trust Layer</div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/.well-known/aar.json</span>
          <span class="description">Agent Action Receipt public key</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/.well-known/scc</span>
          <span class="description">Session Continuity Certificate</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/trust</span>
          <span class="description">Trust layer status</span>
        </div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/receipts/verify</span>
          <span class="description">Verify a receipt</span>
        </div>
      </div>

      <div class="category">
        <div class="category-title">MCP</div>
        <div class="endpoint">
          <span class="method">POST</span>
          <span class="path">/mcp</span>
          <span class="description">MCP Streamable HTTP transport</span>
        </div>
      </div>

      <div class="category">
        <div class="category-title">x402 (Pay-per-request)</div>
        <div class="endpoint">
          <span class="method">GET</span>
          <span class="path">/api/botindex/x402/correlation-leaders</span>
          <span class="description">$0.02 USDC/req</span>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Rate Limits</h2>
      <div class="rate-limits">
        <div class="limit-card">
          <h4>Free Tier (No Key)</h4>
          <p>5 requests/hour per endpoint</p>
        </div>
        <div class="limit-card">
          <h4>Free Tier (With Key)</h4>
          <p>Unlimited requests</p>
        </div>
        <div class="limit-card">
          <h4>x402 Endpoints</h4>
          <p>Pay per request ($0.02 USDC)</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Links & Resources</h2>
      <div class="links-grid">
        <a href="https://www.npmjs.com/package/botindex-aar" class="link-card" target="_blank" rel="noopener">
          <h4>botindex-aar</h4>
          <p>npm package</p>
        </a>
        <a href="https://www.npmjs.com/package/botindex-scc" class="link-card" target="_blank" rel="noopener">
          <h4>botindex-scc</h4>
          <p>npm package</p>
        </a>
        <a href="https://www.npmjs.com/package/botindex-mcp-server" class="link-card" target="_blank" rel="noopener">
          <h4>botindex-mcp-server</h4>
          <p>npm package</p>
        </a>
        <a href="https://github.com/Cyberweasel777/King-Backend" class="link-card" target="_blank" rel="noopener">
          <h4>GitHub</h4>
          <p>King Backend repository</p>
        </a>
        <a href="https://botindex.dev" class="link-card" target="_blank" rel="noopener">
          <h4>botindex.dev</h4>
          <p>Official website</p>
        </a>
      </div>
    </div>

    <footer>
      <p>BotIndex API — Built for agents, by agents</p>
      <p style="margin-top: 8px;"><a href="https://botindex.dev">botindex.dev</a></p>
    </footer>
  </div>
</body>
</html>`;
router.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
});
exports.default = router;
//# sourceMappingURL=docs.js.map