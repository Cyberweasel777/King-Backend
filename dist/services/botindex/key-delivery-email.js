"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendApiKeyEmail = sendApiKeyEmail;
const logger_1 = __importDefault(require("../../config/logger"));
const RESEND_API_BASE = 'https://api.resend.com/emails';
const DEFAULT_FROM = process.env.BOTINDEX_EMAIL_FROM || 'BotIndex <onboarding@resend.dev>';
function docsUrlForPlan(plan) {
    return plan === 'pro'
        ? 'https://botindex.dev#quickstart'
        : 'https://botindex.dev#pricing';
}
function plainTextBody({ apiKey, plan }) {
    return [
        `Your BotIndex ${plan.toUpperCase()} API key is ready.`,
        '',
        `API Key: ${apiKey}`,
        '',
        'Quick start:',
        'curl -H "X-API-Key: <YOUR_KEY>" https://api.botindex.dev/api/botindex/v1/',
        '',
        `Docs: ${docsUrlForPlan(plan)}`,
        'MCP endpoint: https://api.botindex.dev/mcp',
        '',
        'If this email was unexpected, rotate your key immediately from support.',
    ].join('\n');
}
function htmlBody({ apiKey, plan }) {
    return `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.5;color:#111">
    <h2 style="margin:0 0 12px">BotIndex ${plan.toUpperCase()} key issued</h2>
    <p style="margin:0 0 12px">Your API key is ready:</p>
    <pre style="background:#0b1020;color:#d1e7ff;padding:12px;border-radius:8px;overflow:auto">${apiKey}</pre>
    <p style="margin:12px 0 6px"><strong>Quick start</strong></p>
    <pre style="background:#f6f8fa;padding:10px;border-radius:8px;overflow:auto">curl -H "X-API-Key: &lt;YOUR_KEY&gt;" https://api.botindex.dev/api/botindex/v1/</pre>
    <p style="margin:12px 0 6px"><a href="${docsUrlForPlan(plan)}">Docs</a> · <a href="https://api.botindex.dev/mcp">MCP endpoint</a></p>
    <p style="font-size:12px;color:#666">If this was unexpected, rotate your key immediately.</p>
  </div>`;
}
async function sendApiKeyEmail(params) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger_1.default.info('RESEND_API_KEY missing; skipping BotIndex API key email delivery');
        return;
    }
    const payload = {
        from: DEFAULT_FROM,
        to: [params.to],
        subject: `Your BotIndex ${params.plan.toUpperCase()} API key`,
        text: plainTextBody({ apiKey: params.apiKey, plan: params.plan }),
        html: htmlBody({ apiKey: params.apiKey, plan: params.plan }),
    };
    const response = await fetch(RESEND_API_BASE, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Resend API error (${response.status}): ${body.slice(0, 400)}`);
    }
}
//# sourceMappingURL=key-delivery-email.js.map