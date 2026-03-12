import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import {
  crawlAll,
  discoverServices,
  getOwnManifest,
  getStats,
  loadRegistry,
  registerProvider,
} from '../../services/agorion/registry';

const router = Router();
const AGORION_ADMIN_ID = '8063432083';

function parseNumberQuery(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value.trim()) return null;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLimit(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return 25;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 25;
  return Math.min(parsed, 200);
}

function checkAdmin(req: Request, res: Response): boolean {
  const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : '';
  if (adminId !== AGORION_ADMIN_ID) {
    res.status(403).json({ error: 'forbidden', message: 'adminId is required' });
    return false;
  }
  return true;
}

function getBaseUrl(req: Request): string {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  return `${req.protocol}://${req.get('host')}`;
}

router.post('/register', async (req: Request, res: Response) => {
  const body = req.body as { url?: unknown; contact?: unknown } | undefined;
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  const contact = typeof body?.contact === 'string' && body.contact.trim()
    ? body.contact.trim()
    : undefined;

  if (!url) {
    res.status(400).json({ error: 'invalid_request', message: 'url is required' });
    return;
  }

  try {
    const provider = await registerProvider(url, contact);
    res.json(provider.manifest);
  } catch (error) {
    logger.warn({ err: error, providerUrl: url }, 'Failed to register Agorion provider');
    res.status(502).json({
      error: 'register_failed',
      message: error instanceof Error ? error.message : 'Failed to register provider',
    });
  }
});

router.get('/discover', async (req: Request, res: Response) => {
  const capability = typeof req.query.capability === 'string' ? req.query.capability : undefined;
  const network = typeof req.query.network === 'string' ? req.query.network : undefined;
  const maxPriceRaw = parseNumberQuery(req.query.maxPrice);
  const limit = parseLimit(req.query.limit);

  if (req.query.maxPrice !== undefined && maxPriceRaw === null) {
    res.status(400).json({ error: 'invalid_request', message: 'maxPrice must be a number' });
    return;
  }
  if (maxPriceRaw !== null && maxPriceRaw < 0) {
    res.status(400).json({ error: 'invalid_request', message: 'maxPrice must be >= 0' });
    return;
  }

  try {
    const services = await discoverServices({
      capability,
      network,
      maxPrice: maxPriceRaw ?? undefined,
      limit,
    });

    res.json({
      filters: {
        capability: capability ?? null,
        network: network ?? null,
        maxPrice: maxPriceRaw ?? null,
        limit,
      },
      count: services.length,
      services,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to discover Agorion services');
    res.status(500).json({ error: 'internal_error', message: 'Failed to discover services' });
  }
});

router.get('/providers', async (_req: Request, res: Response) => {
  try {
    const registry = await loadRegistry();
    const providers = registry.providers.map((provider) => ({
      url: provider.url,
      contact: provider.contact,
      serviceCount: provider.manifest.services.length,
      registeredAt: provider.registeredAt,
      lastCrawledAt: provider.lastCrawledAt,
      status: provider.status,
    }));

    res.json({
      count: providers.length,
      updatedAt: registry.updatedAt,
      providers,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list Agorion providers');
    res.status(500).json({ error: 'internal_error', message: 'Failed to list providers' });
  }
});

router.get('/manifest', (req: Request, res: Response) => {
  const manifest = getOwnManifest(getBaseUrl(req));
  res.json(manifest);
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    logger.error({ err: error }, 'Failed to compute Agorion stats');
    res.status(500).json({ error: 'internal_error', message: 'Failed to compute stats' });
  }
});

router.post('/crawl', async (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  try {
    const summary = await crawlAll();
    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'Failed to crawl Agorion providers');
    res.status(500).json({ error: 'internal_error', message: 'Failed to crawl providers' });
  }
});

export default router;

