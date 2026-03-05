import { Request, Response, Router } from 'express';
import { getApiKeyInfo, isValidEmail, registerApiKey } from '../middleware/apiKeyAuth';

const router = Router();

router.post('/register', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';

  if (!email || !isValidEmail(email)) {
    res.status(400).json({
      error: 'invalid_email',
      message: 'Please provide a valid email address.',
    });
    return;
  }

  const created = registerApiKey(email);
  res.json(created);
});

router.get('/info', (req: Request, res: Response) => {
  const apiKeyHeader = req.headers['x-api-key'];
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  if (!apiKey) {
    res.status(401).json({
      error: 'missing_api_key',
      message: 'Provide X-API-Key header.',
    });
    return;
  }

  const info = getApiKeyInfo(apiKey);
  if (!info) {
    res.status(401).json({
      error: 'invalid_api_key',
      message: 'API key not recognized.',
    });
    return;
  }

  res.json(info);
});

export default router;
