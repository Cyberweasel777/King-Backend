# @botindex/aar

**Agent Action Receipt (AAR) SDK** — cryptographically signed receipts for AI agent actions.

The open standard for verifiable agent actions. Prove what happened, who authorized it, and what it cost — without trusted intermediaries.

[![Spec](https://img.shields.io/badge/spec-AAR%20v1.0-blue)](https://github.com/Cyberweasel777/agent-action-receipt-spec)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install @botindex/aar
```

## Quick Start

### 1. Generate a keypair

```ts
import { generateKeyPair, encodeBase64Url } from '@botindex/aar';

const { secretKey, publicKey } = generateKeyPair();
console.log('Public key:', encodeBase64Url(publicKey));
// Store secretKey securely (env var, secrets manager)
```

### 2. Express middleware (one-liner)

```ts
import express from 'express';
import { aarMiddleware } from '@botindex/aar/middleware/express';

const app = express();

app.use(aarMiddleware({
  agentId: 'my-trading-bot/v2',
  agentName: 'TradingBot',
  agentVersion: '2.0.0',
  secretKey: process.env.AAR_SECRET_KEY!,
}));

// Every response now carries X-AAR-Receipt header
// containing a signed, verifiable receipt
```

### 3. Manual receipt creation

```ts
import {
  createReceipt,
  signAndFinalize,
  hashInput,
  hashOutput,
  generateKeyPair,
} from '@botindex/aar';

const { secretKey } = generateKeyPair();

const unsigned = createReceipt({
  agent: { id: 'trading-bot/v2', name: 'TradingBot' },
  principal: { id: 'user:alice', type: 'user' },
  action: {
    type: 'trade.execute',
    target: 'binance/BTCUSDT',
    method: 'POST',
    status: 'success',
  },
  scope: { permissions: ['trade.spot'] },
  inputHash: hashInput({ pair: 'BTCUSDT', side: 'buy', qty: 0.5 }),
  outputHash: hashOutput('{"orderId":"12345","filled":0.5}'),
  cost: { amount: '0.02', currency: 'USDC' },
});

const receipt = signAndFinalize(unsigned, secretKey);
```

### 4. Verify a receipt

```ts
import { verifyReceipt } from '@botindex/aar';

const result = verifyReceipt(receipt);
if (result.ok) {
  console.log('Receipt is valid and untampered');
} else {
  console.error('Verification failed:', result.reason);
}
```

### 5. Well-known discovery endpoint

```ts
import { wellKnownHandler } from '@botindex/aar';

app.get('/.well-known/aar-configuration', wellKnownHandler({
  agentId: 'my-agent/v1',
  secretKey: process.env.AAR_SECRET_KEY!,
}));
```

Returns:
```json
{
  "specVersion": "1.0",
  "canonicalization": "JCS-SORTED-UTF8-NOWS",
  "signatureAlgorithms": ["Ed25519"],
  "hashAlgorithms": ["sha256"],
  "receiptHeader": "X-AAR-Receipt",
  "agent": {
    "id": "my-agent/v1",
    "publicKey": "base64url-encoded-ed25519-public-key"
  }
}
```

## Mastercard Verifiable Intent Compatibility

AAR maps directly to Mastercard's [Verifiable Intent](https://www.mastercard.com/us/en/news-and-trends/stories/2026/verifiable-intent.html) framework (announced March 5, 2026).

```ts
import { aarToVerifiableIntent, verifiableIntentToAAR } from '@botindex/aar';

// Convert AAR receipt to Verifiable Intent format
const viRecord = aarToVerifiableIntent(receipt);

// Convert back
const partialAAR = verifiableIntentToAAR(viRecord);
```

Both standards solve the same problem — proving AI agent actions are authorized and auditable. AAR approaches it from the crypto-native agent infrastructure side; Verifiable Intent from the card-network side. The compatibility layer bridges them.

## x402 Integration

[x402](https://github.com/coinbase/x402) handles the payment flow (HTTP 402 → pay → retry). AAR handles the proof of what happened after payment. Complementary standards:

- **x402** asks: "Did you pay?"
- **AAR** answers: "What did the agent do with it?"

Use both together for complete agent commerce audit trails.

## How It Works

1. Agent receives instruction from a principal (user, org, service)
2. Agent executes action (API call, payment, trade)
3. AAR receipt is generated:
   - Input/output hashed with SHA-256 (privacy-preserving)
   - Canonicalized with JCS-SORTED-UTF8-NOWS
   - Signed with Ed25519
4. Receipt travels with the response (`X-AAR-Receipt` header)
5. Any party can verify independently — no trusted intermediary

## API Reference

### Core

| Export | Description |
|--------|-------------|
| `generateKeyPair()` | Generate Ed25519 keypair |
| `loadSecretKey(input)` | Load secret key from Uint8Array, base64, or PEM |
| `createReceipt(opts)` | Build an unsigned receipt |
| `signAndFinalize(unsigned, sk)` | Sign and return complete AAR receipt |
| `signReceipt(unsigned, sk)` | Sign an unsigned receipt |
| `verifyReceipt(receipt, pk?)` | Verify receipt signature |
| `hashInput(data)` | SHA-256 hash any input data |
| `hashOutput(data)` | SHA-256 hash response body |
| `canonicalize(value)` | JCS canonical JSON serialization |
| `encodeReceiptHeader(receipt)` | Base64-encode receipt for HTTP header |

### Middleware

| Export | Description |
|--------|-------------|
| `aarMiddleware(opts)` | Express middleware — auto-signs every response |

### Discovery

| Export | Description |
|--------|-------------|
| `wellKnownHandler(opts)` | Express handler for `/.well-known/aar-configuration` |
| `buildWellKnownConfig(opts)` | Build discovery config object |

### Compatibility

| Export | Description |
|--------|-------------|
| `aarToVerifiableIntent(receipt)` | Convert AAR → Mastercard Verifiable Intent |
| `verifiableIntentToAAR(vi)` | Convert Verifiable Intent → partial AAR |

## Design Principles

- **Single dependency:** `tweetnacl` only
- **Transport-agnostic:** HTTP header, response body, on-chain, wherever
- **Privacy by default:** Inputs/outputs are hashed, not embedded
- **Deterministic:** JCS canonicalization ensures identical signing across implementations
- **Edge-compatible:** Core works in Node.js 18+ and edge runtimes

## Spec

Full specification: [Agent Action Receipt Specification (AAR v1.0)](https://github.com/Cyberweasel777/agent-action-receipt-spec)

## License

MIT
