import { Router, Request, Response } from 'express';
import logger from '../../config/logger';

const router = Router();
const ADMIN_ID = process.env.ADMIN_ID || '8063432083';

function checkAdmin(req: Request, res: Response): boolean {
  const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : '';
  if (adminId !== ADMIN_ID) {
    res.status(403).send('Access denied');
    return false;
  }
  return true;
}

router.get('/', (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BotIndex Admin Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      padding: 24px;
      line-height: 1.5;
    }
    h1 { font-size: 28px; margin-bottom: 24px; color: #fff; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: #a78bfa; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 20px;
    }
    .card h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #888;
      margin-bottom: 8px;
    }
    .card .value {
      font-size: 32px;
      font-weight: 700;
      color: #fff;
    }
    .card .change {
      font-size: 12px;
      color: #10b981;
      margin-top: 4px;
    }
    .card .change.down { color: #ef4444; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #2a2a2a;
    }
    th {
      color: #888;
      font-weight: 500;
      font-size: 12px;
      text-transform: uppercase;
    }
    .status-good { color: #10b981; }
    .status-warn { color: #f59e0b; }
    .status-bad { color: #ef4444; }
    .funnel-bar {
      display: flex;
      height: 32px;
      border-radius: 6px;
      overflow: hidden;
      margin-top: 8px;
    }
    .funnel-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
    }
    .refresh-btn {
      background: #7c3aed;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .refresh-btn:hover { background: #6d28d9; }
    .loading { opacity: 0.6; }
    .error { color: #ef4444; padding: 20px; background: #1a1a1a; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>BotIndex Admin Dashboard</h1>
  <button class="refresh-btn" onclick="loadData()">Refresh Data</button>
  
  <div id="content">
    <div class="loading">Loading...</div>
  </div>

  <script>
    const ADMIN_ID = '${ADMIN_ID}';
    
    async function fetchData() {
      const [hitsRes, funnelRes] = await Promise.all([
        fetch(\`/api/botindex/admin/hits?adminId=\${ADMIN_ID}\`),
        fetch(\`/api/botindex/keys/admin/funnel?adminId=\${ADMIN_ID}\`)
      ]);
      
      if (!hitsRes.ok || !funnelRes.ok) {
        throw new Error('Failed to fetch data');
      }
      
      const hits = await hitsRes.json();
      const funnel = await funnelRes.json();
      return { hits, funnel };
    }
    
    function render(data) {
      const { hits, funnel } = data;
      
      // Get top endpoints
      const endpoints = Object.entries(hits.endpoints || {})
        .map(([path, info]) => ({ path, count: info.count, uniques: info.uniqueVisitors }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      // Calculate conversion rates
      const regToCheckout = funnel.registerHits > 0 
        ? ((funnel.checkoutCreated / funnel.registerHits) * 100).toFixed(1) 
        : 0;
      const checkoutToComplete = funnel.checkoutCreated > 0 
        ? ((funnel.checkoutCompleted / funnel.checkoutCreated) * 100).toFixed(1) 
        : 0;
      const overall = funnel.registerHits > 0 
        ? ((funnel.apiKeysIssued / funnel.registerHits) * 100).toFixed(1) 
        : 0;
      
      document.getElementById('content').innerHTML = \`
        <div class="grid">
          <div class="card">
            <h3>Total Hits</h3>
            <div class="value">\${hits.total_hits?.toLocaleString() || 0}</div>
          </div>
          <div class="card">
            <h3>Unique Visitors</h3>
            <div class="value">\${hits.unique_visitors_total?.toLocaleString() || 0}</div>
          </div>
          <div class="card">
            <h3>Register Clicks</h3>
            <div class="value">\${funnel.registerHits || 0}</div>
          </div>
          <div class="card">
            <h3>Checkouts Started</h3>
            <div class="value">\${funnel.checkoutCreated || 0}</div>
          </div>
          <div class="card">
            <h3>Payments Completed</h3>
            <div class="value status-good">\${funnel.checkoutCompleted || 0}</div>
          </div>
          <div class="card">
            <h3>API Keys Issued</h3>
            <div class="value status-good">\${funnel.apiKeysIssued || 0}</div>
          </div>
        </div>
        
        <h2>Conversion Funnel</h2>
        <div class="card">
          <div class="funnel-bar">
            <div class="funnel-segment" style="width: 100%; background: #3b82f6;">
              Register: \${funnel.registerHits}
            </div>
          </div>
          <div class="funnel-bar">
            <div class="funnel-segment" style="width: \${regToCheckout}%; background: #8b5cf6;">
              Checkout: \${funnel.checkoutCreated}
            </div>
          </div>
          <div class="funnel-bar">
            <div class="funnel-segment" style="width: \${checkoutToComplete}%; background: #10b981;">
              Paid: \${funnel.checkoutCompleted}
            </div>
          </div>
          <p style="margin-top: 12px; font-size: 14px; color: #888;">
            Overall conversion: <strong class="status-good">\${overall}%</strong> 
            (\${funnel.apiKeysIssued} paid from \${funnel.registerHits} registrations)
          </p>
        </div>
        
        <h2>Top Endpoints</h2>
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Hits</th>
                <th>Uniques</th>
              </tr>
            </thead>
            <tbody>
              \${endpoints.map(ep => \`
                <tr>
                  <td>\${ep.path}</td>
                  <td>\${ep.count}</td>
                  <td>\${ep.uniques}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
        
        <h2>System Status</h2>
        <div class="grid">
          <div class="card">
            <h3>API Status</h3>
            <div class="value status-good">Healthy</div>
            <div style="font-size: 12px; color: #888; margin-top: 4px;">
              Uptime: \${Math.floor(hits.uptime_seconds / 3600)}h \${Math.floor((hits.uptime_seconds % 3600) / 60)}m
            </div>
          </div>
          <div class="card">
            <h3>Events Tracked</h3>
            <div class="value">\${funnel.eventsTracked || 0}</div>
            <div style="font-size: 12px; color: #888; margin-top: 4px;">
              Since \${new Date(funnel.since).toLocaleDateString()}
            </div>
          </div>
        </div>
      \`;
    }
    
    async function loadData() {
      document.getElementById('content').innerHTML = '<div class="loading">Loading...</div>';
      try {
        const data = await fetchData();
        render(data);
      } catch (err) {
        document.getElementById('content').innerHTML = 
          '<div class="error">Error loading data: ' + err.message + '</div>';
      }
    }
    
    loadData();
  </script>
</body>
</html>`);
});

export default router;
