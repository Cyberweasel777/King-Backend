/**
 * BotIndex Magic Link Authentication
 * 
 * Flow:
 * 1. User enters email on /sentinel/dashboard
 * 2. POST /api/botindex/auth/magic-link → sends email with login link
 * 3. User clicks link → frontend extracts token from URL
 * 4. Frontend stores token in localStorage, uses it for API calls
 * 5. Token = JWT (24h expiry) containing email + plan
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../../config/logger';
import { getAllApiKeys } from '../middleware/apiKeyAuth';

const router = Router();

// Secret for signing magic link JWTs — falls back to a derived key from BOTINDEX_STRIPE_SECRET_KEY
const JWT_SECRET = process.env.BOTINDEX_JWT_SECRET
  || (process.env.BOTINDEX_STRIPE_SECRET_KEY
    ? crypto.createHash('sha256').update(`botindex-auth-${process.env.BOTINDEX_STRIPE_SECRET_KEY}`).digest('hex')
    : 'botindex-dev-secret-change-me');

const MAGIC_LINK_EXPIRY = '15m';   // Link expires in 15 minutes
const SESSION_EXPIRY = '24h';       // Session lasts 24 hours
const DASHBOARD_URL = 'https://botindex.dev/sentinel/dashboard';
const RESEND_API_BASE = 'https://api.resend.com/emails';
const FROM_EMAIL = process.env.BOTINDEX_EMAIL_FROM || 'BotIndex <onboarding@resend.dev>';

/**
 * Find API key entry by email
 */
function findKeyByEmail(email: string): { key: string; plan: string; status: string } | null {
  const allKeys = getAllApiKeys();
  for (const item of allKeys) {
    if (item.entry.email?.toLowerCase() === email.toLowerCase() && item.entry.status === 'active') {
      return { key: item.key, plan: item.entry.plan, status: item.entry.status };
    }
  }
  return null;
}

/**
 * POST /api/botindex/auth/magic-link
 * Body: { email: string }
 * Sends a magic link to the email if they have an active API key.
 */
router.post('/auth/magic-link', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'valid_email_required', message: 'Please provide a valid email address.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find the user's API key by email
    const keyEntry = findKeyByEmail(normalizedEmail);

    if (!keyEntry) {
      // Don't reveal whether the email exists — always say "check your email"
      // But log it for debugging
      logger.info(`Magic link requested for unknown email: ${normalizedEmail}`);
      res.json({
        ok: true,
        message: 'If an account exists with that email, a login link has been sent. Check your inbox.',
      });
      return;
    }

    // Generate a short-lived magic link token
    const magicToken = jwt.sign(
      {
        email: normalizedEmail,
        plan: keyEntry.plan,
        type: 'magic_link',
      },
      JWT_SECRET,
      { expiresIn: MAGIC_LINK_EXPIRY }
    );

    const loginUrl = `${DASHBOARD_URL}?token=${magicToken}`;

    // Send email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      logger.error('RESEND_API_KEY not configured — cannot send magic link');
      res.status(500).json({ error: 'email_not_configured' });
      return;
    }

    const emailResponse = await fetch(RESEND_API_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [normalizedEmail],
        subject: 'Your BotIndex Sentinel Login Link',
        text: [
          'Click the link below to access your Sentinel dashboard:',
          '',
          loginUrl,
          '',
          'This link expires in 15 minutes.',
          '',
          'If you didn\'t request this, you can safely ignore this email.',
        ].join('\n'),
        html: `
          <div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.6;color:#e4e4e7;background:#0a0a0a;padding:32px;border-radius:12px;max-width:480px">
            <h2 style="color:#fff;margin:0 0 16px">Sentinel Dashboard Login</h2>
            <p style="margin:0 0 24px;color:#a1a1aa">Click the button below to access your signals dashboard.</p>
            <a href="${loginUrl}" style="display:inline-block;padding:12px 28px;background:#22d3ee;color:#000;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
              Open Dashboard →
            </a>
            <p style="margin:24px 0 0;font-size:13px;color:#52525b">This link expires in 15 minutes. If you didn't request this, ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const body = await emailResponse.text().catch(() => '');
      logger.error(`Resend magic link error (${emailResponse.status}): ${body.slice(0, 400)}`);
      res.status(500).json({ error: 'email_send_failed' });
      return;
    }

    logger.info(`Magic link sent to ${normalizedEmail} (plan: ${keyEntry.plan})`);

    res.json({
      ok: true,
      message: 'If an account exists with that email, a login link has been sent. Check your inbox.',
    });
  } catch (err) {
    logger.error('Magic link error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /api/botindex/auth/verify
 * Body: { token: string }
 * Validates a magic link token and returns a session token.
 */
router.post('/auth/verify', (req: Request, res: Response): void => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'token_required' });
      return;
    }

    // Verify the magic link token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      email: string;
      plan: string;
      type: string;
    };

    if (decoded.type !== 'magic_link') {
      res.status(401).json({ error: 'invalid_token_type' });
      return;
    }

    // Confirm the user still has an active key
    const keyEntry = findKeyByEmail(decoded.email);
    if (!keyEntry) {
      res.status(401).json({ error: 'no_active_key', message: 'No active API key found for this email.' });
      return;
    }

    // Issue a session token (longer-lived)
    const sessionToken = jwt.sign(
      {
        email: decoded.email,
        plan: keyEntry.plan,
        type: 'session',
      },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    logger.info(`Session issued for ${decoded.email} (plan: ${keyEntry.plan})`);

    res.json({
      ok: true,
      session: sessionToken,
      email: decoded.email,
      plan: keyEntry.plan,
      expiresIn: SESSION_EXPIRY,
    });
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'token_expired', message: 'Login link has expired. Please request a new one.' });
      return;
    }
    if (err?.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'invalid_token', message: 'Invalid login link.' });
      return;
    }
    logger.error('Auth verify error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/botindex/auth/session
 * Header: Authorization: Bearer <session_token>
 * Returns current session info if valid.
 */
router.get('/auth/session', (req: Request, res: Response): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'not_authenticated' });
      return;
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as {
      email: string;
      plan: string;
      type: string;
      exp: number;
    };

    if (decoded.type !== 'session') {
      res.status(401).json({ error: 'invalid_token_type' });
      return;
    }

    // Confirm active key still exists
    const keyEntry = findKeyByEmail(decoded.email);
    if (!keyEntry) {
      res.status(401).json({ error: 'no_active_key' });
      return;
    }

    res.json({
      ok: true,
      email: decoded.email,
      plan: keyEntry.plan,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    });
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'session_expired', message: 'Session has expired. Please log in again.' });
      return;
    }
    res.status(401).json({ error: 'invalid_session' });
  }
});

/**
 * Middleware: require a valid session token (for protecting dashboard API calls)
 */
export function requireDashboardAuth(req: Request, res: Response, next: Function): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'not_authenticated', message: 'Please log in at https://botindex.dev/sentinel/dashboard' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as {
      email: string;
      plan: string;
      type: string;
    };

    if (decoded.type !== 'session') {
      res.status(401).json({ error: 'invalid_token_type' });
      return;
    }

    // Attach user info to request
    (req as any).dashboardUser = {
      email: decoded.email,
      plan: decoded.plan,
    };

    next();
  } catch {
    res.status(401).json({ error: 'session_expired', message: 'Session has expired. Please log in again.' });
  }
}

export default router;
