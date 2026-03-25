import logger from '../../config/logger';

const RESEND_API_BASE = 'https://api.resend.com/emails';
const FROM = process.env.ANALYCYS_EMAIL_FROM || 'Analycys <noreply@resend.dev>';
const NOTIFY_TO = process.env.ANALYCYS_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'andrew@analycys.com';
const ADMIN_CHAT_ID = '8063432083';

export type ContactPayload = {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone?: string;
  domain: string;
  employees: string;
  prompt?: string;
  source?: string;
};

function adminHtml(p: ContactPayload): string {
  return `
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.6;color:#111;max-width:600px">
  <h2 style="margin:0 0 16px;color:#1a1a1a">🔐 New Analycys Lead</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:8px 12px;background:#f6f8fa;font-weight:600;width:160px">Name</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${p.firstName} ${p.lastName}</td></tr>
    <tr><td style="padding:8px 12px;background:#f6f8fa;font-weight:600">Business</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${p.businessName}</td></tr>
    <tr><td style="padding:8px 12px;background:#f6f8fa;font-weight:600">Email</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><a href="mailto:${p.email}">${p.email}</a></td></tr>
    <tr><td style="padding:8px 12px;background:#f6f8fa;font-weight:600">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${p.phone || '—'}</td></tr>
    <tr><td style="padding:8px 12px;background:#f6f8fa;font-weight:600">Domain</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${p.domain}</td></tr>
    <tr><td style="padding:8px 12px;background:#f6f8fa;font-weight:600">Employees</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${p.employees}</td></tr>
    <tr><td style="padding:8px 12px;background:#f6f8fa;font-weight:600">Source</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${p.source || '—'}</td></tr>
    ${p.prompt ? `<tr><td style="padding:8px 12px;background:#f6f8fa;font-weight:600;vertical-align:top">Notes</td><td style="padding:8px 12px">${p.prompt}</td></tr>` : ''}
  </table>
  <p style="margin-top:20px;font-size:12px;color:#888">Received: ${new Date().toISOString()}</p>
</div>`;
}

function confirmationHtml(p: ContactPayload): string {
  return `
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.6;color:#111;max-width:600px">
  <h2 style="margin:0 0 12px">We received your request.</h2>
  <p style="color:#444">Hi ${p.firstName},</p>
  <p style="color:#444">We received your External Exposure Review request for <strong>${p.businessName}</strong> and will follow up within one business day to schedule your scoping conversation.</p>
  <p style="color:#444">The scoping call takes about 30 minutes. No technical preparation needed on your end.</p>
  <p style="color:#444;margin-top:20px">— Analycys</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="font-size:12px;color:#888">You submitted this request from analycys.com. If you did not submit this form, please disregard this message.</p>
</div>`;
}

async function sendTelegramNotification(p: ContactPayload): Promise<void> {
  const botToken = process.env.ANALYCYS_BOT_TOKEN || process.env.BOTINDEX_BOT_TOKEN;
  if (!botToken) return;

  const text = [
    '🔐 *Analycys Lead — External Exposure Review*',
    '',
    `*Name:* ${p.firstName} ${p.lastName}`,
    `*Business:* ${p.businessName}`,
    `*Email:* ${p.email}`,
    `*Domain:* ${p.domain}`,
    `*Employees:* ${p.employees}`,
    p.phone ? `*Phone:* ${p.phone}` : '',
    p.prompt ? `*Notes:* ${p.prompt}` : '',
    '',
    `_${new Date().toISOString()}_`,
  ].filter(Boolean).join('\n');

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: 'Markdown' }),
  }).catch(err => logger.error({ err }, 'Analycys Telegram notification failed'));
}

export async function sendContactEmails(p: ContactPayload): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;

  // Always fire Telegram notification regardless of Resend status
  await sendTelegramNotification(p);

  if (!resendKey) {
    logger.warn('RESEND_API_KEY missing — skipping Analycys email delivery');
    return;
  }

  // Admin notification email
  const adminPayload = {
    from: FROM,
    to: [NOTIFY_TO],
    subject: `Analycys Lead: ${p.firstName} ${p.lastName} — ${p.businessName}`,
    html: adminHtml(p),
    text: `New lead: ${p.firstName} ${p.lastName} | ${p.businessName} | ${p.email} | ${p.domain} | ${p.employees} employees`,
  };

  // Confirmation email to prospect
  const confirmPayload = {
    from: FROM,
    to: [p.email],
    subject: 'We received your External Exposure Review request — Analycys',
    html: confirmationHtml(p),
    text: `Hi ${p.firstName}, we received your External Exposure Review request for ${p.businessName} and will follow up within one business day.`,
  };

  const [adminRes, confirmRes] = await Promise.allSettled([
    fetch(RESEND_API_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(adminPayload),
    }),
    fetch(RESEND_API_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmPayload),
    }),
  ]);

  if (adminRes.status === 'rejected') {
    logger.error({ err: adminRes.reason }, 'Analycys admin email failed');
  }
  if (confirmRes.status === 'rejected') {
    logger.error({ err: confirmRes.reason }, 'Analycys confirmation email failed');
  }
}
