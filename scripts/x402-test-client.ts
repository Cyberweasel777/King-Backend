import 'dotenv/config';

type EndpointTest = {
  label: string;
  path: string;
  price: string;
  gated: boolean;
};

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const BASE_URL = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

const ENDPOINTS: EndpointTest[] = [
  { label: '1. Free discovery', path: '/api/botindex/v1/', price: 'free', gated: false },
  { label: '2. Trace BotIndex', path: '/api/botindex/v1/trace/botindex', price: '$0.05', gated: true },
  { label: '3. Signals', path: '/api/botindex/v1/signals', price: '$0.10', gated: true },
  {
    label: '4. Agent BotIndex history',
    path: '/api/botindex/v1/agent/botindex/history',
    price: '$0.25',
    gated: true,
  },
  { label: '5. Dashboard', path: '/api/botindex/v1/dashboard', price: '$0.50', gated: true },
  {
    label: '6. Legacy correlation leaders',
    path: '/api/botindex/x402/correlation-leaders',
    price: '$0.01',
    gated: true,
  },
];

function parseEnabledFlag(rawValue: string | undefined): boolean {
  if (!rawValue) return false;
  return ['1', 'true', 'yes', 'on'].includes(rawValue.toLowerCase());
}

function expectedStatus(endpoint: EndpointTest, x402Enabled: boolean): number {
  if (!endpoint.gated) return 200;
  return x402Enabled ? 402 : 200;
}

function statusColor(status: number): string {
  if (status >= 500) return COLORS.red;
  if (status === 402) return COLORS.yellow;
  if (status === 200) return COLORS.green;
  return COLORS.reset;
}

function previewBody(body: string): string {
  return body.slice(0, 200).replace(/\s+/g, ' ').trim();
}

async function run(): Promise<void> {
  const x402Enabled = parseEnabledFlag(process.env.X402_ENABLED);
  let hasServerError = false;

  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`X402_ENABLED=${x402Enabled ? '1' : '0'}\n`);

  for (const endpoint of ENDPOINTS) {
    const url = `${BASE_URL}${endpoint.path}`;
    let status = 0;
    let bodyText = '';

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          // Simulated local-dev x402 headers (non-signed and intentionally unpaid).
          ...(endpoint.gated
            ? {
                'x-payment': 'simulated-local-dev-payment-proof',
                'x-x402-network': process.env.X402_NETWORK || 'base-sepolia',
                'x-x402-simulated': '1',
              }
            : {}),
        },
      });

      status = response.status;
      bodyText = await response.text();
    } catch (error) {
      status = 599;
      bodyText = `Request failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    const expected = expectedStatus(endpoint, x402Enabled);
    const color = statusColor(status);
    const statusDisplay = `${color}${status}${COLORS.reset}`;
    const bodyPreview = previewBody(bodyText);

    console.log(`${endpoint.label} (${endpoint.price})`);
    console.log(`URL: ${url}`);
    console.log(`Status: ${statusDisplay} (expected ${expected})`);
    console.log(`Body[0..200]: ${bodyPreview || '<empty>'}\n`);

    if (status >= 500) {
      hasServerError = true;
    }
  }

  if (hasServerError) {
    console.error(`${COLORS.red}One or more endpoints returned 5xx.${COLORS.reset}`);
    process.exit(1);
  }

  console.log(`${COLORS.green}No 5xx responses detected.${COLORS.reset}`);
  process.exit(0);
}

run().catch((error) => {
  console.error(`${COLORS.red}Unexpected failure: ${error instanceof Error ? error.message : String(error)}${COLORS.reset}`);
  process.exit(1);
});
