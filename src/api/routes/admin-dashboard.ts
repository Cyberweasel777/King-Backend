import { Router, Request, Response } from 'express';

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

  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BotIndex Admin — Single Source of Truth</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:24px;line-height:1.5}
    h1{font-size:28px;margin-bottom:8px;color:#fff}
    .subtitle{color:#888;font-size:14px;margin-bottom:24px}
    h2{font-size:16px;margin:28px 0 12px;color:#a78bfa;text-transform:uppercase;letter-spacing:.5px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:16px}
    .card h3{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666;margin-bottom:6px}
    .card .v{font-size:28px;font-weight:700;color:#fff}
    .v.green{color:#10b981} .v.yellow{color:#f59e0b} .v.red{color:#ef4444} .v.purple{color:#a78bfa} .v.cyan{color:#22d3ee}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{text-align:left;padding:10px;border-bottom:1px solid #222}
    th{color:#666;font-weight:500;font-size:11px;text-transform:uppercase}
    .bar{height:28px;border-radius:5px;display:flex;align-items:center;padding:0 10px;font-size:11px;font-weight:600;margin:4px 0;min-width:60px}
    .refresh{background:#7c3aed;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:24px}
    .refresh:hover{background:#6d28d9}
    .loading{opacity:.5}
    .error{color:#ef4444;padding:16px;background:#1a1a1a;border-radius:8px}
    .sentinel-badge{display:inline-block;background:#f59e0b20;color:#f59e0b;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600}
    .ts{color:#555;font-size:11px}
  </style>
</head>
<body>
  <h1>BotIndex Admin Dashboard</h1>
  <div class="subtitle">Single Source of Truth — <span id="ts"></span></div>
  <button class="refresh" onclick="load()">↻ Refresh</button>
  <div id="c"><div class="loading">Loading...</div></div>
  <script>
    const A='${ADMIN_ID}';
    async function load(){
      document.getElementById('c').innerHTML='<div class="loading">Loading...</div>';
      try{
        const [truthRes,hitsRes,eventsRes,keyHealthRes]=await Promise.all([
          fetch('/api/botindex/keys/admin/truth?adminId='+A),
          fetch('/api/botindex/admin/hits?adminId='+A),
          fetch('/api/botindex/admin/events/summary').catch(()=>({ok:false})),
          fetch('/api/botindex/admin/key-health').catch(()=>({ok:false}))
        ]);
        if(!truthRes.ok||!hitsRes.ok) throw new Error('fetch failed');
        const truth=await truthRes.json();
        const hits=await hitsRes.json();
        const events=eventsRes.ok?await eventsRes.json():null;
        const keyHealth=keyHealthRes.ok?await keyHealthRes.json():null;
        render(truth,hits,events,keyHealth);
      }catch(e){
        document.getElementById('c').innerHTML='<div class="error">'+e.message+'</div>';
      }
    }
    function pct(a,b){return b>0?((a/b)*100).toFixed(1):'0.0'}
    function render(t,h,ev,kh){
      document.getElementById('ts').textContent=t.timestamp;
      const k=t.keys||{};
      const f=t.funnel||{};
      const s=f.sentinel||{};
      const st=t.stripe||{};
      const bp=t.funnel?.byTypePlan||{};
      
      // Top endpoints
      const eps=Object.entries(h.endpoints||{})
        .filter(([p])=>!p.includes('beacon'))
        .map(([p,i])=>({p,c:i.count,u:i.uniqueVisitors}))
        .sort((a,b)=>b.c-a.c).slice(0,12);
      
      // Beacon pages
      const beacons=Object.entries(h.endpoints||{})
        .filter(([p])=>p.includes('beacon:'))
        .map(([p,i])=>({page:p.replace('/botindex/beacon:','').replace('/polyhacks/beacon:',''),c:i.count,u:i.uniqueVisitors}))
        .sort((a,b)=>b.c-a.c);
      const beaconViews=beacons.reduce((s,b)=>s+b.c,0);
      
      // Funnel totals
      const regHits=(bp.register_page_hit||{});
      const totalReg=Object.values(regHits).reduce((s,v)=>s+v,0);
      const checkouts=Object.values(bp.checkout_session_created||{}).reduce((s,v)=>s+v,0);
      const completed=Object.values(bp.checkout_completed||{}).reduce((s,v)=>s+v,0);
      const issued=Object.values(bp.api_key_issued||{}).reduce((s,v)=>s+v,0);
      
      document.getElementById('c').innerHTML=\`
        <h2>💰 Revenue</h2>
        <div class="grid">
          <div class="card"><h3>Stripe Charges (30d)</h3><div class="v green">\${st.charges30d||0}</div></div>
          <div class="card"><h3>Active Subscriptions</h3><div class="v green">\${st.activeSubscriptions||0}</div></div>
          <div class="card"><h3>Sentinel Subs</h3><div class="v \${st.activeSentinelSubscriptions>0?'green':'yellow'}">\${st.activeSentinelSubscriptions||0}</div></div>
          <div class="card"><h3>MRR</h3><div class="v green">$\${((st.activeSubscriptions||0)*9.99+(st.activeSentinelSubscriptions||0)*49.99).toFixed(2)}</div></div>
        </div>
        
        <h2>🛡️ Sentinel Funnel</h2>
        <div class="grid">
          <div class="card"><h3>Register Hits</h3><div class="v purple">\${s.registerHits||0}</div></div>
          <div class="card"><h3>Checkouts Created</h3><div class="v purple">\${s.checkoutCreated||0}</div></div>
          <div class="card"><h3>Completed</h3><div class="v \${s.checkoutCompleted>0?'green':'red'}">\${s.checkoutCompleted||0}</div></div>
          <div class="card"><h3>Keys Issued</h3><div class="v \${s.keysIssued>0?'green':'red'}">\${s.keysIssued||0}</div></div>
        </div>
        
        <h2>🔑 API Keys</h2>
        <div class="grid">
          <div class="card"><h3>Total Keys</h3><div class="v">\${k.total||0}</div></div>
          <div class="card"><h3>Active Keys</h3><div class="v cyan">\${k.activeKeys||0}</div></div>
          \${Object.entries(k.byPlan||{}).map(([plan,count])=>
            '<div class="card"><h3>'+plan+'</h3><div class="v">'+count+'</div></div>'
          ).join('')}
        </div>
        
        <h2>📊 Full Conversion Funnel</h2>
        <div class="card">
          <div class="bar" style="width:100%;background:#3b82f6">Register: \${totalReg} (free:\${regHits.free||0} pro:\${regHits.pro||0} sentinel:\${regHits.sentinel||0})</div>
          <div class="bar" style="width:\${pct(checkouts,totalReg)}%;background:#8b5cf6">Checkout: \${checkouts} (\${pct(checkouts,totalReg)}%)</div>
          <div class="bar" style="width:\${pct(completed,totalReg)}%;background:#10b981;min-width:\${completed>0?'80px':'60px'}">Paid: \${completed} (\${pct(completed,totalReg)}%)</div>
          <div class="bar" style="width:\${pct(issued,totalReg)}%;background:#22d3ee;min-width:\${issued>0?'80px':'60px'}">Keys: \${issued} (\${pct(issued,totalReg)}%)</div>
          <p style="margin-top:12px;font-size:13px;color:#888">Overall: <strong style="color:#10b981">\${pct(issued,totalReg)}%</strong> (\${issued} keys from \${totalReg} registrations)</p>
        </div>
        
        <h2>🌐 Traffic</h2>
        <div class="grid">
          <div class="card"><h3>Total Hits</h3><div class="v">\${(h.total_hits||0).toLocaleString()}</div></div>
          <div class="card"><h3>Unique Visitors</h3><div class="v">\${(h.unique_visitors_total||0).toLocaleString()}</div></div>
          <div class="card"><h3>Hits/Min</h3><div class="v">\${(h.hits_per_minute||0).toFixed(1)}</div></div>
          <div class="card"><h3>Uptime</h3><div class="v">\${Math.floor((h.uptime_seconds||0)/3600)}h</div></div>
        </div>
        
        <h2>🏠 Landing Pages</h2>
        <div class="grid">
          <div class="card"><h3>Page Views</h3><div class="v">\${beaconViews.toLocaleString()}</div></div>
        </div>
        \${beacons.length>0?'<div class="card" style="margin-bottom:20px"><table><thead><tr><th>Page</th><th>Views</th><th>Uniques</th></tr></thead><tbody>'+beacons.map(b=>'<tr><td style="color:#a78bfa">'+b.page+'</td><td>'+b.c+'</td><td>'+b.u+'</td></tr>').join('')+'</tbody></table></div>':''}
        
        <h2>🔥 Top Endpoints</h2>
        <div class="card">
          <table>
            <thead><tr><th>Endpoint</th><th>Hits</th><th>Uniques</th></tr></thead>
            <tbody>\${eps.map(e=>'<tr><td>'+e.p+'</td><td>'+e.c+'</td><td>'+e.u+'</td></tr>').join('')}</tbody>
          </table>
        </div>
        
        <h2>📢 Monetization Prompts (persisted)</h2>
        \${(()=>{
          const m=t.monetizationPrompts||{};
          const rows=[
            ['429 Rate Limit Walls','anon_rate_limit_429'],
            ['Soft-Gate Truncations','soft_gate_truncated'],
            ['CTA Blocks Injected','cta_injected'],
            ['Paywall Hits','paywall_hit'],
            ['Upgrade CTA Shown','upgrade_cta_shown'],
            ['Checkout Redirects','checkout_redirect'],
            ['First Auth Call','first_auth_call'],
            ['Second Auth Call','second_auth_call'],
            ['Key Daily Active','key_daily_active'],
          ];
          return '<div class="card"><table><thead><tr><th>Event</th><th>Total</th><th>Last 24h</th><th>Last Hour</th></tr></thead><tbody>'+
            rows.map(([label,key])=>{
              const s=m[key]||{total:0,last24h:0,lastHour:0};
              return '<tr><td>'+label+'</td><td style="font-weight:700">'+s.total+'</td><td>'+s.last24h+'</td><td>'+s.lastHour+'</td></tr>';
            }).join('')+
            '</tbody></table></div>';
        })()}
        
        <h2>📡 Event Logger (JSONL)</h2>
        \${ev?
          '<div class="grid">'+
            '<div class="card"><h3>Total Events</h3><div class="v">'+(ev.total_events||0).toLocaleString()+'</div></div>'+
            '<div class="card"><h3>Last 24h</h3><div class="v">'+(ev.events_last_24h||0).toLocaleString()+'</div></div>'+
            '<div class="card"><h3>Unique IPs</h3><div class="v cyan">'+(ev.unique_ips||0).toLocaleString()+'</div></div>'+
            '<div class="card"><h3>Authenticated</h3><div class="v green">'+(ev.authenticated||0)+'</div></div>'+
            '<div class="card"><h3>Anonymous</h3><div class="v yellow">'+(ev.anonymous||0).toLocaleString()+'</div></div>'+
            '<div class="card"><h3>Auth %</h3><div class="v">'+(ev.auth_pct||'0%')+'</div></div>'+
          '</div>'+
          '<div class="card" style="margin-bottom:12px"><h3 style="margin-bottom:8px">Top Paths</h3><table><thead><tr><th>Path</th><th>Hits</th><th>%</th></tr></thead><tbody>'+
            (ev.top_paths||[]).slice(0,10).map(p=>'<tr><td>'+p.path+'</td><td>'+p.count+'</td><td>'+p.pct+'</td></tr>').join('')+
          '</tbody></table></div>'+
          '<div class="card" style="margin-bottom:20px"><h3 style="margin-bottom:8px">Top User Agents</h3><table><thead><tr><th>UA</th><th>Hits</th><th>%</th></tr></thead><tbody>'+
            (ev.top_user_agents||[]).slice(0,10).map(u=>'<tr><td>'+u.user_agent+'</td><td>'+u.count+'</td><td>'+u.pct+'</td></tr>').join('')+
          '</tbody></table></div>'
          :'<div class="card" style="color:#888">Event logger not available</div>'
        }
        
        <h2>🔑 Key Health & Retention</h2>
        \${kh?
          '<div class="grid">'+
            '<div class="card"><h3>Total Keys</h3><div class="v">'+(kh.total_keys||0)+'</div></div>'+
            '<div class="card"><h3>1+ Calls</h3><div class="v cyan">'+(kh.activated_1_call||0)+'</div></div>'+
            '<div class="card"><h3>2+ Calls</h3><div class="v purple">'+(kh.activated_2_calls||0)+'</div></div>'+
            '<div class="card"><h3>Active Today</h3><div class="v green">'+(kh.active_today||0)+'</div></div>'+
            '<div class="card"><h3>Active 7d</h3><div class="v green">'+(kh.active_7d||0)+'</div></div>'+
            '<div class="card"><h3>7d Retention</h3><div class="v '+(parseFloat(kh.retention_7d_pct)>20?'green':'red')+'">'+(kh.retention_7d_pct||'N/A')+'</div></div>'+
            '<div class="card"><h3>Median hrs to 2nd call</h3><div class="v">'+(kh.median_hours_to_second_call!==null?kh.median_hours_to_second_call:'—')+'</div></div>'+
          '</div>'
          :'<div class="card" style="color:#888">Key health not available</div>'
        }
        
        <h2>🤖 Agorion Registry</h2>
        \${t.agorion?
          '<div class="grid">'+
            '<div class="card"><h3>Total Providers</h3><div class="v">'+t.agorion.totalProviders+'</div></div>'+
            '<div class="card"><h3>Healthy</h3><div class="v '+(t.agorion.healthyProviders>0?'green':'yellow')+'">'+t.agorion.healthyProviders+'</div></div>'+
            Object.entries(t.agorion.bySource||{}).map(([src,ct])=>'<div class="card"><h3>'+src+'</h3><div class="v">'+ct+'</div></div>').join('')+
          '</div>'
          :'<div class="card" style="color:#888">Agorion data unavailable on this machine</div>'
        }
        
        <h2>⚙️ Config</h2>
        <div class="card">
          <table>
            <tr><td>Sentinel Configured</td><td class="\${t.offering?.sentinelConfigured?'v green':'v red'}">\${t.offering?.sentinelConfigured?'✅':'❌'}</td></tr>
            <tr><td>Sentinel Price ID</td><td style="color:#888;font-family:monospace;font-size:12px">\${t.offering?.sentinelPriceId||'not set'}</td></tr>
            <tr><td>Pro Price ID</td><td style="color:#888;font-family:monospace;font-size:12px">\${t.offering?.proPriceId||'not set'}</td></tr>
            <tr><td>Register URL</td><td style="color:#888;font-family:monospace;font-size:12px">\${t.offering?.registrationUrl||'—'}</td></tr>
          </table>
        </div>
        
        <div class="ts" style="margin-top:24px">Last refresh: \${new Date().toLocaleString()}</div>
      \`;
    }
    load();
  </script>
</body>
</html>`);
});

export default router;
