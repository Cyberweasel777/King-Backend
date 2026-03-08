import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { createX402Gate } from '../middleware/x402Gate';
import { AgentActionReceipt, getReceiptPublicKeyBase64 } from '../middleware/receiptMiddleware';
import {
  signReceipt as signAARReceipt,
  verifyReceipt as verifyAARReceipt,
} from '../../services/botindex/trust/aar-service';
import {
  anchorSCC,
  SCCCertificate,
  verifyAnchor,
  verifySCCChain,
} from '../../services/botindex/trust/scc-service';

const router = Router();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readRequiredString(body: Record<string, unknown>, key: string): string | null {
  const raw = body[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function readOptionalString(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const raw = body[key];
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || null;
}

function readSessionIndex(body: Record<string, unknown>): string | number | null {
  const raw = body.sessionIndex;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function isValidCost(value: unknown): value is string | number | null {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

function parseReceipt(value: unknown): AgentActionReceipt | null {
  const body = asRecord(value);
  if (!body) return null;

  const costRaw = body.cost;
  if (!isValidCost(costRaw)) return null;

  const receipt: AgentActionReceipt = {
    receiptId: readRequiredString(body, 'receiptId') || '',
    agent: readRequiredString(body, 'agent') || '',
    principal: readRequiredString(body, 'principal') || '',
    action: readRequiredString(body, 'action') || '',
    scope: readRequiredString(body, 'scope') || '',
    inputHash: readRequiredString(body, 'inputHash') || '',
    outputHash: readRequiredString(body, 'outputHash') || '',
    timestamp: readRequiredString(body, 'timestamp') || '',
    cost: costRaw ?? null,
    signature: readRequiredString(body, 'signature') || '',
  };

  if (
    !receipt.receiptId ||
    !receipt.agent ||
    !receipt.principal ||
    !receipt.action ||
    !receipt.scope ||
    !receipt.inputHash ||
    !receipt.outputHash ||
    !receipt.timestamp ||
    !receipt.signature
  ) {
    return null;
  }

  return receipt;
}

function parseSCCCertificate(value: unknown): SCCCertificate | null {
  const body = asRecord(value);
  if (!body) return null;

  const parentHash = readOptionalString(body, 'parentHash');
  if (parentHash === undefined) return null;

  const certificateId = readRequiredString(body, 'certificateId');
  const agentId = readRequiredString(body, 'agentId');
  const sessionIndex = readRequiredString(body, 'sessionIndex');
  const memoryRoot = readRequiredString(body, 'memoryRoot');
  const capabilityHash = readRequiredString(body, 'capabilityHash');
  const stateHash = readRequiredString(body, 'stateHash');
  const merkleRoot = readRequiredString(body, 'merkleRoot');
  const timestamp = readRequiredString(body, 'timestamp');
  const signature = readRequiredString(body, 'signature');

  if (
    !certificateId ||
    !agentId ||
    !sessionIndex ||
    !memoryRoot ||
    !capabilityHash ||
    !stateHash ||
    !merkleRoot ||
    !timestamp ||
    !signature
  ) {
    return null;
  }

  return {
    certificateId,
    agentId,
    sessionIndex,
    parentHash,
    memoryRoot,
    capabilityHash,
    stateHash,
    merkleRoot,
    timestamp,
    signature,
  };
}

function trustPortalHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BotIndex Trust Verification Portal</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --panel: #18181b;
      --panel-border: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --accent: #38bdf8;
      --accent-muted: rgba(56, 189, 248, 0.15);
      --success: #22c55e;
      --error: #f43f5e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      background:
        radial-gradient(1200px 600px at 10% -10%, rgba(56, 189, 248, 0.15), transparent 60%),
        radial-gradient(900px 500px at 110% 0%, rgba(148, 163, 184, 0.12), transparent 60%),
        var(--bg);
      color: var(--text);
      padding: 24px;
    }
    .container {
      max-width: 980px;
      margin: 0 auto;
      border: 1px solid var(--panel-border);
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(24,24,27,0.95), rgba(10,10,10,0.95));
      overflow: hidden;
    }
    .header {
      padding: 24px;
      border-bottom: 1px solid var(--panel-border);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      font-size: 1.4rem;
      letter-spacing: 0.01em;
    }
    .sub {
      margin-top: 8px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .link {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
    .tabs {
      display: flex;
      gap: 8px;
      padding: 16px 24px 0;
    }
    .tab-btn {
      border: 1px solid var(--panel-border);
      background: transparent;
      color: var(--muted);
      border-radius: 999px;
      padding: 8px 14px;
      cursor: pointer;
    }
    .tab-btn.active {
      border-color: rgba(56, 189, 248, 0.5);
      background: var(--accent-muted);
      color: var(--text);
    }
    .panel {
      display: none;
      padding: 24px;
    }
    .panel.active {
      display: block;
    }
    .field {
      margin-bottom: 14px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.88rem;
      color: var(--muted);
    }
    textarea, input {
      width: 100%;
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      background: #0f0f12;
      color: var(--text);
      padding: 10px 12px;
      font-size: 0.9rem;
      outline: none;
    }
    textarea:focus, input:focus {
      border-color: rgba(56, 189, 248, 0.7);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }
    textarea {
      min-height: 180px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .btn {
      border: 1px solid rgba(56, 189, 248, 0.45);
      background: var(--accent-muted);
      color: var(--text);
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      font-weight: 600;
    }
    .hint {
      color: var(--muted);
      font-size: 0.85rem;
    }
    pre {
      margin: 14px 0 0;
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      background: #0f0f12;
      padding: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 60px;
      color: #d4d4d8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.86rem;
    }
    .status-ok { color: var(--success); }
    .status-fail { color: var(--error); }
    @media (max-width: 720px) {
      body { padding: 12px; }
      .header, .panel { padding: 16px; }
      .tabs { padding: 12px 16px 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>BotIndex Trust Verification Portal</h1>
        <div class="sub">Verify Agent Action Receipts and SCC continuity chains.</div>
      </div>
      <div class="sub">
        Built by BotIndex Trust Layer<br/>
        <a class="link" href="https://aar.botindex.dev" target="_blank" rel="noreferrer">aar.botindex.dev</a>
      </div>
    </div>
    <div class="tabs">
      <button type="button" id="tab-receipt" class="tab-btn active">Verify Receipt</button>
      <button type="button" id="tab-chain" class="tab-btn">Verify Chain</button>
    </div>

    <section id="panel-receipt" class="panel active">
      <div class="field">
        <label for="receipt-json">Receipt JSON</label>
        <textarea id="receipt-json" placeholder='{"receiptId":"...","agent":"..."}'></textarea>
      </div>
      <div class="field">
        <label for="receipt-public-key">Public Key (Base64, optional)</label>
        <input id="receipt-public-key" placeholder="Uses BotIndex signing key if omitted" />
      </div>
      <div class="actions">
        <button type="button" id="verify-receipt-btn" class="btn">Verify Receipt</button>
        <span class="hint">Endpoint: POST /api/botindex/trust/aar/verify</span>
      </div>
      <pre id="receipt-result">Awaiting verification input...</pre>
    </section>

    <section id="panel-chain" class="panel">
      <div class="field">
        <label for="chain-json">SCC Certificates JSON Array</label>
        <textarea id="chain-json" placeholder='[{"certificateId":"...","agentId":"..."}]'></textarea>
      </div>
      <div class="actions">
        <button type="button" id="verify-chain-btn" class="btn">Verify Chain</button>
        <span class="hint">Endpoint: POST /api/botindex/trust/scc/verify-chain</span>
      </div>
      <pre id="chain-result">Awaiting verification input...</pre>
    </section>
  </div>

  <script>
    const receiptTab = document.getElementById('tab-receipt');
    const chainTab = document.getElementById('tab-chain');
    const receiptPanel = document.getElementById('panel-receipt');
    const chainPanel = document.getElementById('panel-chain');

    function setTab(tab) {
      const receiptActive = tab === 'receipt';
      receiptTab.classList.toggle('active', receiptActive);
      chainTab.classList.toggle('active', !receiptActive);
      receiptPanel.classList.toggle('active', receiptActive);
      chainPanel.classList.toggle('active', !receiptActive);
    }

    receiptTab.addEventListener('click', () => setTab('receipt'));
    chainTab.addEventListener('click', () => setTab('chain'));

    function parseJsonInput(raw) {
      return JSON.parse(raw);
    }

    function showResult(pre, payload, ok) {
      pre.textContent = JSON.stringify(payload, null, 2);
      pre.classList.remove('status-ok');
      pre.classList.remove('status-fail');
      pre.classList.add(ok ? 'status-ok' : 'status-fail');
    }

    document.getElementById('verify-receipt-btn').addEventListener('click', async () => {
      const receiptRaw = document.getElementById('receipt-json').value.trim();
      const keyRaw = document.getElementById('receipt-public-key').value.trim();
      const resultPre = document.getElementById('receipt-result');

      try {
        if (!receiptRaw) {
          showResult(resultPre, { error: 'missing_receipt', message: 'Paste a receipt JSON payload.' }, false);
          return;
        }

        const payload = { receipt: parseJsonInput(receiptRaw) };
        if (keyRaw) {
          payload.publicKey = keyRaw;
        }

        const response = await fetch('/api/botindex/trust/aar/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        showResult(resultPre, data, response.ok && data.valid === true);
      } catch (error) {
        showResult(
          resultPre,
          { error: 'verification_failed', message: error && error.message ? error.message : String(error) },
          false
        );
      }
    });

    document.getElementById('verify-chain-btn').addEventListener('click', async () => {
      const chainRaw = document.getElementById('chain-json').value.trim();
      const resultPre = document.getElementById('chain-result');

      try {
        if (!chainRaw) {
          showResult(resultPre, { error: 'missing_chain', message: 'Paste a certificate JSON array.' }, false);
          return;
        }

        const certificates = parseJsonInput(chainRaw);
        const response = await fetch('/api/botindex/trust/scc/verify-chain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificates: certificates }),
        });
        const data = await response.json();
        showResult(resultPre, data, response.ok && data.valid === true);
      } catch (error) {
        showResult(
          resultPre,
          { error: 'verification_failed', message: error && error.message ? error.message : String(error) },
          false
        );
      }
    });
  </script>
</body>
</html>`;
}

router.post(
  '/trust/aar/sign',
  createX402Gate({ price: '$0.001', description: 'Sign an Agent Action Receipt' }),
  async (req: Request, res: Response) => {
    try {
      const body = asRecord(req.body);
      if (!body) {
        res.status(400).json({
          error: 'invalid_payload',
          message: 'Request body must be an object',
        });
        return;
      }

      const agent = readRequiredString(body, 'agent');
      const principal = readRequiredString(body, 'principal');
      const action = readRequiredString(body, 'action');
      const scope = readRequiredString(body, 'scope');

      if (!agent || !principal || !action || !scope || !('input' in body) || !('output' in body)) {
        res.status(400).json({
          error: 'invalid_payload',
          message: 'Fields agent, principal, action, scope, input, and output are required',
        });
        return;
      }

      if ('cost' in body && !isValidCost(body.cost)) {
        res.status(400).json({
          error: 'invalid_payload',
          message: 'cost must be a string, number, or null',
        });
        return;
      }

      const receipt = signAARReceipt({
        agent,
        principal,
        action,
        scope,
        inputData: body.input,
        outputData: body.output,
        cost: (body.cost as string | number | null | undefined) ?? null,
      });

      res.json({
        receipt,
        publicKey: getReceiptPublicKeyBase64(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to sign BotIndex AAR');
      res.status(500).json({
        error: 'aar_sign_failed',
        message: 'Failed to sign Agent Action Receipt',
      });
    }
  }
);

router.post('/trust/aar/verify', (req: Request, res: Response) => {
  const body = asRecord(req.body);
  if (!body) {
    res.status(400).json({
      error: 'invalid_payload',
      message: 'Request body must be an object',
    });
    return;
  }

  const receipt = parseReceipt(body.receipt);
  if (!receipt) {
    res.status(400).json({
      error: 'invalid_payload',
      message: 'receipt must be a valid AgentActionReceipt object',
    });
    return;
  }

  const publicKey =
    typeof body.publicKey === 'string' && body.publicKey.trim() ? body.publicKey.trim() : undefined;

  const result = verifyAARReceipt(receipt, publicKey);
  res.json(result);
});

router.post(
  '/trust/scc/anchor',
  createX402Gate({ price: '$0.01', description: 'Anchor a Session Continuity Certificate' }),
  async (req: Request, res: Response) => {
    try {
      const body = asRecord(req.body);
      if (!body) {
        res.status(400).json({
          error: 'invalid_payload',
          message: 'Request body must be an object',
        });
        return;
      }

      const agentId = readRequiredString(body, 'agentId');
      const sessionIndex = readSessionIndex(body);
      const memoryRoot = readRequiredString(body, 'memoryRoot');
      const capabilityHash = readRequiredString(body, 'capabilityHash');
      const stateHash = readRequiredString(body, 'stateHash');
      const parentHash = readOptionalString(body, 'parentHash');

      if (!agentId || sessionIndex === null || !memoryRoot || !capabilityHash || !stateHash) {
        res.status(400).json({
          error: 'invalid_payload',
          message:
            'Fields agentId, sessionIndex, memoryRoot, capabilityHash, and stateHash are required',
        });
        return;
      }

      const anchored = anchorSCC({
        agentId,
        sessionIndex,
        parentHash: parentHash ?? null,
        memoryRoot,
        capabilityHash,
        stateHash,
      });

      res.json(anchored);
    } catch (error) {
      logger.error({ err: error }, 'Failed to anchor SCC certificate');
      res.status(500).json({
        error: 'scc_anchor_failed',
        message: 'Failed to anchor Session Continuity Certificate',
      });
    }
  }
);

router.get('/trust/scc/verify/:anchorHash', (req: Request, res: Response) => {
  const anchorHash = String(req.params.anchorHash || '').trim();
  if (!anchorHash) {
    res.status(400).json({
      error: 'invalid_anchor_hash',
      message: 'Path parameter anchorHash is required',
    });
    return;
  }

  const verification = verifyAnchor(anchorHash);
  if (!verification.found) {
    res.json({ found: false });
    return;
  }

  res.json(verification);
});

router.post('/trust/scc/verify-chain', (req: Request, res: Response) => {
  const body = asRecord(req.body);
  if (!body || !Array.isArray(body.certificates)) {
    res.status(400).json({
      error: 'invalid_payload',
      message: 'certificates must be an array',
    });
    return;
  }

  const certificates: SCCCertificate[] = [];
  for (let idx = 0; idx < body.certificates.length; idx += 1) {
    const parsed = parseSCCCertificate(body.certificates[idx]);
    if (!parsed) {
      res.status(400).json({
        error: 'invalid_payload',
        message: `certificates[${idx}] must be a valid SCC certificate`,
      });
      return;
    }
    certificates.push(parsed);
  }

  const result = verifySCCChain(certificates);
  res.json(result);
});

router.get('/trust/verify', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(trustPortalHtml());
});

export default router;
