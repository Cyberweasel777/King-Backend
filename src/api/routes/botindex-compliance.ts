import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { analyzeComplianceHeadlines } from '../../services/botindex/compliance/analyzer';
import { getComplianceScannerNote, scanComplianceHeadlines } from '../../services/botindex/compliance/scanner';
import { scanProjectExposure } from '../../services/botindex/compliance/exposure-scanner';
import { getThreatRadar } from '../../services/botindex/compliance/threat-radar';

const router = Router();

const PRO_REGISTRATION_LINK = 'https://king-backend.fly.dev/api/botindex/keys/register?plan=pro';

function truncateReasoning(reasoning: string): string {
  const base = reasoning.slice(0, 80);
  return `${base}... [upgrade for full analysis]`;
}

function truncateMarketBrief(brief: string): string {
  return brief.length > 120 ? brief.slice(0, 120) : brief;
}

function hasFullAccess(req: Request): boolean {
  const hasPaidPlan = req.apiKeyAuth?.plan === 'pro' || req.apiKeyAuth?.plan === 'basic';
  const hasBypass = Boolean((req as any).__apiKeyAuthenticated);
  return hasPaidPlan || hasBypass;
}

function parseProjectQuery(req: Request): string | null {
  const project = typeof req.query.project === 'string' ? req.query.project.trim() : '';
  const protocol = typeof req.query.protocol === 'string' ? req.query.protocol.trim() : '';
  const value = project || protocol;
  return value || null;
}

function getTopJurisdictions(
  jurisdictionRisk: { US: number; EU: number; APAC: number; LATAM: number } | null | undefined,
): Array<{ jurisdiction: string; risk: number }> {
  if (!jurisdictionRisk) return [];
  return Object.entries(jurisdictionRisk)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([jurisdiction, risk]) => ({ jurisdiction, risk }));
}

router.get('/compliance/headlines', async (_req: Request, res: Response) => {
  try {
    const headlines = await scanComplianceHeadlines();
    const note = getComplianceScannerNote();

    res.json({
      headlines,
      count: headlines.length,
      scannedAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    });
  } catch (error) {
    logger.error({ err: error }, '[compliance.headlines] failed');
    res.status(500).json({
      error: 'compliance_headline_scan_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/compliance/signal-desk', async (req: Request, res: Response) => {
  try {
    const headlines = await scanComplianceHeadlines();
    const analysis = await analyzeComplianceHeadlines(headlines);

    if (hasFullAccess(req)) {
      res.json({
        ...analysis,
        isTruncated: false,
      });
      return;
    }

    const teaserSignals = analysis.signals.slice(0, 2).map((signal) => ({
      ...signal,
      reasoning: truncateReasoning(signal.reasoning),
    }));

    res.json({
      ...analysis,
      signals: teaserSignals,
      marketBrief: truncateMarketBrief(analysis.marketBrief),
      topAction: null,
      isTruncated: true,
      upgrade: {
        message: 'Upgrade to Pro or Basic for full compliance signal desk output.',
        register: PRO_REGISTRATION_LINK,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[compliance.signal-desk] failed');
    res.status(500).json({
      error: 'compliance_signal_desk_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/compliance/threat-radar', async (req: Request, res: Response) => {
  try {
    const radar = await getThreatRadar();
    if (!radar) {
      res.status(503).json({
        error: 'compliance_threat_radar_unavailable',
        message: 'Threat radar cache is empty and live generation is unavailable.',
      });
      return;
    }

    if (hasFullAccess(req)) {
      res.json({
        ...radar,
        isTruncated: false,
      });
      return;
    }

    res.json({
      overallThreatLevel: radar.overallThreatLevel,
      threatTrend: radar.threatTrend,
      isTruncated: true,
      upgrade: {
        message: 'Upgrade to Pro or Basic for full threat radar intelligence.',
        register: PRO_REGISTRATION_LINK,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[compliance.threat-radar] failed');
    res.status(500).json({
      error: 'compliance_threat_radar_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/compliance/exposure', async (req: Request, res: Response) => {
  try {
    const project = parseProjectQuery(req);
    if (!project) {
      res.status(400).json({
        error: 'missing_project',
        message: 'Query param required: ?project=<name> (or ?protocol=<name>).',
      });
      return;
    }

    const exposure = await scanProjectExposure(project);

    if (hasFullAccess(req)) {
      res.json({
        ...exposure,
        isTruncated: false,
      });
      return;
    }

    res.json({
      project: exposure.project,
      exposureLevel: exposure.exposureLevel,
      exposureScore: exposure.exposureScore,
      isTruncated: true,
      upgrade: {
        message: 'Upgrade to Pro or Basic for full project exposure details.',
        register: PRO_REGISTRATION_LINK,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[compliance.exposure] failed');
    res.status(500).json({
      error: 'compliance_exposure_scan_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/compliance/overview', async (_req: Request, res: Response) => {
  try {
    const [headlines, cachedThreatRadar] = await Promise.all([
      scanComplianceHeadlines(),
      getThreatRadar({ cacheOnly: true }),
    ]);

    const signalDeskSummary = headlines.slice(0, 3).map((headline) => headline.title);

    res.json({
      headlineCount: headlines.length,
      signalDeskSummary: {
        source: 'headlines-cache',
        highlights: signalDeskSummary,
      },
      threatRadar: {
        level: cachedThreatRadar?.overallThreatLevel ?? null,
        trend: cachedThreatRadar?.threatTrend ?? null,
        cached: Boolean(cachedThreatRadar),
      },
      topJurisdictions: getTopJurisdictions(cachedThreatRadar?.jurisdictionRisk || null),
      availableEndpoints: [
        '/api/botindex/compliance/overview',
        '/api/botindex/compliance/signal-desk',
        '/api/botindex/compliance/threat-radar',
        '/api/botindex/compliance/exposure?project=uniswap',
        '/api/botindex/compliance/headlines',
      ],
      scannedAt: new Date().toISOString(),
      isTruncated: false,
    });
  } catch (error) {
    logger.error({ err: error }, '[compliance.overview] failed');
    res.status(500).json({
      error: 'compliance_overview_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
