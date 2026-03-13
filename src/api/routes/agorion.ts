import { Router, type Request, type Response } from 'express';
import logger from '../../config/logger';
import { runCrawlCycle } from '../../services/agorion/crawler';
import { discover, getAll, getHealthy, search } from '../../services/agorion/registry';

const router = Router();
const ADMIN_ID = process.env.ADMIN_ID || '8063432083';

function extractAdminId(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function sourceBreakdown(providers: Awaited<ReturnType<typeof getAll>>): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const provider of providers) {
    breakdown[provider.source] = (breakdown[provider.source] || 0) + 1;
  }
  return breakdown;
}

router.get('/discover', async (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  try {
    const providers = query ? await discover(query) : await getHealthy();
    const ranked = providers.sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name));

    res.json({
      query: query || null,
      count: ranked.length,
      providers: ranked,
    });
  } catch (error) {
    logger.error({ err: error }, 'Agorion discover endpoint failed');
    res.status(500).json({ error: 'discover_failed' });
  }
});

router.get('/providers', async (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  try {
    const providers = query ? await search(query) : await getAll();
    res.json({
      count: providers.length,
      providers,
    });
  } catch (error) {
    logger.error({ err: error }, 'Agorion providers endpoint failed');
    res.status(500).json({ error: 'providers_failed' });
  }
});

router.get('/providers/:id', async (req: Request, res: Response) => {
  const providerId = req.params.id;

  try {
    const providers = await getAll();
    const provider = providers.find((item) => item.id === providerId);

    if (!provider) {
      res.status(404).json({ error: 'provider_not_found' });
      return;
    }

    res.json(provider);
  } catch (error) {
    logger.error({ err: error }, 'Agorion provider detail endpoint failed');
    res.status(500).json({ error: 'provider_detail_failed' });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const providers = await getAll();
    const healthy = providers.filter((provider) => provider.healthScore > 50);

    res.json({
      totalProviders: providers.length,
      healthyCount: healthy.length,
      unhealthyCount: Math.max(0, providers.length - healthy.length),
      sources: sourceBreakdown(providers),
      averageHealthScore: providers.length
        ? Math.round(providers.reduce((sum, provider) => sum + provider.healthScore, 0) / providers.length)
        : 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Agorion stats endpoint failed');
    res.status(500).json({ error: 'stats_failed' });
  }
});

router.post('/crawl', async (req: Request, res: Response) => {
  const adminId = extractAdminId(req.query.adminId);
  if (adminId !== ADMIN_ID) {
    res.status(403).json({ error: 'unauthorized' });
    return;
  }

  try {
    const providers = await runCrawlCycle();
    const healthy = providers.filter((provider) => provider.healthScore > 50).length;

    res.json({
      ok: true,
      totalProviders: providers.length,
      healthyProviders: healthy,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Agorion crawl endpoint failed');
    res.status(500).json({ error: 'crawl_failed' });
  }
});

export default router;
