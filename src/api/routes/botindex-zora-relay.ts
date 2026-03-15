import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { relayZoraAlphaToTelegram } from '../../services/botindex/zora/telegram-relay';

const router = Router();

const RELAY_COOLDOWN_MS = 5 * 60 * 1000;
let lastRelayCallMs = 0;

router.post('/zora/relay', async (_req: Request, res: Response) => {
  const nowMs = Date.now();
  const elapsedMs = nowMs - lastRelayCallMs;

  if (lastRelayCallMs > 0 && elapsedMs < RELAY_COOLDOWN_MS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((RELAY_COOLDOWN_MS - elapsedMs) / 1000));
    res.status(429).json({
      error: 'relay_rate_limited',
      message: 'Zora relay can only be called once every 5 minutes',
      retryAfterSeconds,
    });
    return;
  }

  lastRelayCallMs = nowMs;

  try {
    const result = await relayZoraAlphaToTelegram();
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Unhandled error in /zora/relay endpoint');
    res.status(500).json({
      error: 'zora_relay_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
