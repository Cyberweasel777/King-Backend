import { Router, Request, Response } from 'express';
import { sendContactEmails, ContactPayload } from '../../services/analycys/contact-email';
import logger from '../../config/logger';

const router = Router();

// POST /api/analycys/contact
router.post('/contact', async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      businessName,
      email,
      phone,
      domain,
      employees,
      prompt,
      source,
    } = req.body || {};

    // Validation
    if (!firstName || !lastName || !businessName || !email || !domain || !employees) {
      res.status(400).json({
        error: 'Missing required fields: firstName, lastName, businessName, email, domain, employees',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }

    const payload: ContactPayload = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      businessName: String(businessName).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone ? String(phone).trim() : undefined,
      domain: String(domain).trim(),
      employees: String(employees).trim(),
      prompt: prompt ? String(prompt).trim() : undefined,
      source: source ? String(source).trim() : undefined,
    };

    await sendContactEmails(payload);

    logger.info({ email: payload.email, business: payload.businessName }, 'Analycys contact form submitted');

    res.json({
      ok: true,
      message: "Request received. We'll follow up within one business day to schedule your scoping call.",
    });
  } catch (err) {
    logger.error({ err }, 'Analycys contact route error');
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/analycys/health
router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'analycys', ts: new Date().toISOString() });
});

export default router;
