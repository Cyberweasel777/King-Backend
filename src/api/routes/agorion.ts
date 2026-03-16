import { Router, type Request, type Response } from 'express';
import * as crypto from 'crypto';
import logger from '../../config/logger';
import { runCrawlCycle } from '../../services/agorion/crawler';
import { discover, getAll, getHealthy, purgeUnhealthy, search } from '../../services/agorion/registry';

const router = Router();
const ADMIN_ID = process.env.ADMIN_ID || '8063432083';
type CrawlJobStatus = 'running' | 'completed' | 'failed';
type CrawlJobResult = {
  totalProviders: number;
  healthyProviders: number;
};

type CrawlJob = {
  jobId: string;
  status: CrawlJobStatus;
  startedAt: string;
  completedAt: string | null;
  result: CrawlJobResult | null;
  error: string | null;
};

const crawlJobs = new Map<string, CrawlJob>();
let latestCrawlJobId: string | null = null;
let runningCrawlJobId: string | null = null;

const COMMON_ARTIFACT_NAMES = new Set([
  'privacy',
  'terms',
  'blog',
  'discord',
  'support',
  'settings',
  'submit',
  'partners',
  'explore',
  'pricing',
  'cases',
  'connectors',
  'vdp',
  'models',
  'gateway',
  'clients',
  'reddit 216 members',
  'create a free account',
  'terms of service',
  'privacy policy',
  'view all',
  'playground',
  'all systems online',
  'dxt',
]);

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

function isScrapedArtifactName(name: string): boolean {
  const trimmed = name.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized) return true;
  if (COMMON_ARTIFACT_NAMES.has(normalized)) return true;

  // Matches mcp.so-style artifacts like "A AgentQL MCP Server Model Context Protocol ..."
  if (/^[a-z]\s+.+/i.test(trimmed) && trimmed.length >= 45 && /(mcp|model context protocol)/i.test(trimmed)) {
    return true;
  }

  return false;
}

function hasInvalidProviderUrl(url: string): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed) return true;
  return !/^https?:\/\//i.test(trimmed);
}

function shouldPurgeProvider(provider: Awaited<ReturnType<typeof getAll>>[number]): boolean {
  if (provider.healthScore < 15 && provider.lastHealthy === null) return true;
  if (isScrapedArtifactName(provider.name)) return true;
  if (hasInvalidProviderUrl(provider.url)) return true;
  return false;
}

router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Agorion Agent Registry',
    description: 'Discover AI agent services, MCP servers, and API providers',
    version: '1.0.0',
    endpoints: {
      discover: {
        path: '/api/agorion/discover',
        method: 'GET',
        description: 'Find healthy providers. ?q=crypto to search.',
      },
      providers: {
        path: '/api/agorion/providers',
        method: 'GET',
        description: 'List all indexed providers. ?q=search to filter.',
      },
      provider_detail: {
        path: '/api/agorion/providers/:id',
        method: 'GET',
        description: 'Get a single provider by ID.',
      },
      stats: {
        path: '/api/agorion/stats',
        method: 'GET',
        description: 'Registry statistics and health summary.',
      },
    },
    links: {
      botindex: 'https://king-backend.fly.dev/api/botindex/v1/',
      spec: 'https://github.com/Cyberweasel777/agorion',
    },
  });
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const providers = await getAll();
    const healthy = providers.filter((p) => p.healthScore > 50);
    res.json({
      status: 'ok',
      totalProviders: providers.length,
      healthyProviders: healthy.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Registry unavailable' });
  }
});

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

  if (runningCrawlJobId) {
    res.json({
      ok: false,
      error: 'crawl_in_progress',
      jobId: runningCrawlJobId,
    });
    return;
  }

  const jobId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const job: CrawlJob = {
    jobId,
    status: 'running',
    startedAt,
    completedAt: null,
    result: null,
    error: null,
  };

  crawlJobs.set(jobId, job);
  latestCrawlJobId = jobId;
  runningCrawlJobId = jobId;

  logger.info({ jobId, startedAt }, 'Agorion crawl started');

  void (async () => {
    try {
      const providers = await runCrawlCycle();
      const healthyProviders = providers.filter((provider) => provider.healthScore > 50).length;
      const completedAt = new Date().toISOString();
      const current = crawlJobs.get(jobId);

      if (current) {
        current.status = 'completed';
        current.completedAt = completedAt;
        current.result = {
          totalProviders: providers.length,
          healthyProviders,
        };
      }

      logger.info(
        { jobId, completedAt, totalProviders: providers.length, healthyProviders },
        'Agorion crawl completed',
      );
    } catch (error) {
      const completedAt = new Date().toISOString();
      const current = crawlJobs.get(jobId);

      if (current) {
        current.status = 'failed';
        current.completedAt = completedAt;
        current.error = error instanceof Error ? error.message : 'crawl_failed';
      }

      logger.error({ err: error, jobId, completedAt }, 'Agorion crawl failed');
    } finally {
      if (runningCrawlJobId === jobId) {
        runningCrawlJobId = null;
      }
    }
  })();

  res.json({
    ok: true,
    jobId,
    status: 'running',
    message: 'Crawl started',
  });
});

router.get('/crawl/status', (req: Request, res: Response) => {
  const adminId = extractAdminId(req.query.adminId);
  if (adminId !== ADMIN_ID) {
    res.status(403).json({ error: 'unauthorized' });
    return;
  }

  const requestedJobId = extractAdminId(req.query.jobId);
  const targetJobId = requestedJobId || latestCrawlJobId;

  if (!targetJobId) {
    res.status(404).json({ ok: false, error: 'crawl_not_found' });
    return;
  }

  const job = crawlJobs.get(targetJobId);
  if (!job) {
    res.status(404).json({ ok: false, error: 'crawl_not_found', jobId: targetJobId });
    return;
  }

  res.json({
    ok: true,
    ...job,
  });
});

router.post('/purge', async (req: Request, res: Response) => {
  const adminId = extractAdminId(req.query.adminId);
  if (adminId !== ADMIN_ID) {
    res.status(403).json({ error: 'unauthorized' });
    return;
  }

  try {
    await getAll();
    const purged = await purgeUnhealthy((provider) => shouldPurgeProvider(provider));
    const remaining = (await getAll()).length;

    res.json({ purged, remaining });
  } catch (error) {
    logger.error({ err: error }, 'Agorion purge endpoint failed');
    res.status(500).json({ error: 'purge_failed' });
  }
});

export default router;
