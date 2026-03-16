import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { analyzeComplianceHeadlines } from '../../services/botindex/compliance/analyzer';
import { getComplianceScannerNote, scanComplianceHeadlines } from '../../services/botindex/compliance/scanner';
import { scanProjectExposure } from '../../services/botindex/compliance/exposure-scanner';
import { getThreatRadar } from '../../services/botindex/compliance/threat-radar';
import { trackFunnelEvent } from '../../services/botindex/funnel-tracker';
import { buildFreeCTA } from '../../shared/response-cta';

const router = Router();

const PRO_REGISTRATION_LINK = 'https://king-backend.fly.dev/api/botindex/keys/register?plan=pro';
const BASIC_REGISTRATION_LINK = 'https://king-backend.fly.dev/api/botindex/keys/register?plan=basic';

type VerdictAction = 'TRADE' | 'HOLD' | 'AVOID' | 'MONITOR' | 'HEDGE' | 'CLEAR';

type EndpointVerdict = {
  action: VerdictAction;
  confidence: number;
  one_liner: string;
};

function truncateReasoning(reasoning: string): string {
  const base = reasoning.slice(0, 80);
  return `${base}... [upgrade for full analysis]`;
}

function truncateMarketBrief(brief: string): string {
  return brief.length > 120 ? brief.slice(0, 120) : brief;
}

function hasFullAccess(req: Request): boolean {
  const hasPaidPlan = req.apiKeyAuth?.plan === 'pro' || req.apiKeyAuth?.plan === 'basic' || req.apiKeyAuth?.plan === 'starter';
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

function getTopJurisdictionLabel(
  jurisdictionRisk: { US: number; EU: number; APAC: number; LATAM: number } | null | undefined,
): string {
  const top = getTopJurisdictions(jurisdictionRisk)[0];
  if (!top) return 'N/A';
  return `${top.jurisdiction} (${top.risk}/100)`;
}

function firstSentence(input: string): string {
  const normalized = String(input || '').trim();
  if (!normalized) return '';
  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return match?.[1] ? match[1].trim() : normalized.slice(0, 110);
}

function buildThreatRadarVerdict(radar: Awaited<ReturnType<typeof getThreatRadar>>): EndpointVerdict {
  const threatLevel = radar?.overallThreatLevel ?? 0;
  const trend = radar?.threatTrend ?? 'stable';
  const topJurisdiction = getTopJurisdictionLabel(radar?.jurisdictionRisk);
  const action: VerdictAction = threatLevel > 60 ? 'AVOID' : threatLevel > 30 ? 'MONITOR' : 'CLEAR';

  return {
    action,
    confidence: threatLevel,
    one_liner: `Regulatory environment: ${trend}. Threat level ${threatLevel}/100. ${topJurisdiction} highest risk.`,
  };
}

function buildExposureVerdict(exposure: Awaited<ReturnType<typeof scanProjectExposure>>): EndpointVerdict {
  const level = exposure.exposureLevel;
  const action: VerdictAction =
    level === 'high' || level === 'critical'
      ? 'AVOID'
      : level === 'medium'
        ? 'MONITOR'
        : 'CLEAR';
  const topRiskSnippet = exposure.riskFactors[0]
    ? firstSentence(exposure.riskFactors[0])
    : firstSentence(exposure.recommendation);

  return {
    action,
    confidence: exposure.exposureScore,
    one_liner: `${exposure.project}: ${level} exposure, score ${exposure.exposureScore}/100. ${topRiskSnippet}`,
  };
}

router.get('/compliance/headlines', async (_req: Request, res: Response) => {
  try {
    const headlines = await scanComplianceHeadlines();
    const note = getComplianceScannerNote();
    const sourceCount = new Set(headlines.map((headline) => headline.source)).size;
    const topHeadlineTitle = headlines[0]?.title ?? 'No headline available.';

    res.json({
      headlines,
      count: headlines.length,
      summary: `${headlines.length} regulatory headlines from ${sourceCount} sources. Top: ${topHeadlineTitle}.`,
      scannedAt: new Date().toISOString(),
      ...(note ? { note } : {}),
      ...buildFreeCTA('DeepSeek threat radar: scores regulatory risk 0-100 with jurisdiction breakdown and enforcement tracking. Upgrade for full signal desk.'),
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

    trackFunnelEvent('paywall_hit', { endpoint: req.path, plan: 'free' });
    trackFunnelEvent('upgrade_cta_shown', { endpoint: req.path });
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
    const verdict = buildThreatRadarVerdict(radar);

    if (hasFullAccess(req)) {
      res.json({
        ...radar,
        verdict,
        isTruncated: false,
      });
      return;
    }

    // Build a teaser preview from the paid data
    const enforcementCount = radar.activeEnforcements?.length ?? 0;
    const topJurisdiction = radar.jurisdictionRisk
      ? Object.entries(radar.jurisdictionRisk).sort((a, b) => (b[1] as number) - (a[1] as number))[0]
      : null;
    const previewParts: string[] = [];
    if (enforcementCount > 0) previewParts.push(`${enforcementCount} active enforcement action${enforcementCount > 1 ? 's' : ''} detected`);
    if (topJurisdiction) previewParts.push(`highest risk: ${topJurisdiction[0]} (${topJurisdiction[1]}/100)`);
    if (radar.safeHarbors?.length) previewParts.push(`${radar.safeHarbors.length} safe harbor${radar.safeHarbors.length > 1 ? 's' : ''} identified`);
    const preview = previewParts.length > 0
      ? `${previewParts.join(' · ')} — upgrade for full details`
      : 'Regulatory intelligence available — upgrade for full details';
    const jurisdictionDetailCount = radar.jurisdictionRisk ? Object.keys(radar.jurisdictionRisk).length : 0;
    const highestHiddenConfidence = radar.overallThreatLevel ?? 0;

    trackFunnelEvent('paywall_hit', { endpoint: req.path, plan: 'free' });
    trackFunnelEvent('upgrade_cta_shown', { endpoint: req.path });
    res.json({
      overallThreatLevel: radar.overallThreatLevel,
      threatTrend: radar.threatTrend,
      verdict,
      preview,
      isTruncated: true,
      missed: {
        count: enforcementCount,
        description: `${enforcementCount} active enforcement item${enforcementCount === 1 ? '' : 's'} and ${jurisdictionDetailCount} jurisdiction risk detail${jurisdictionDetailCount === 1 ? '' : 's'} are hidden`,
        highest_hidden_confidence: highestHiddenConfidence,
        hidden_jurisdiction_details_count: jurisdictionDetailCount,
      },
      upgrade: {
        message: `You are missing ${enforcementCount} active enforcement signal${enforcementCount === 1 ? '' : 's'}. Upgrade to see all.`,
        register: BASIC_REGISTRATION_LINK,
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
    const verdict = buildExposureVerdict(exposure);

    if (hasFullAccess(req)) {
      res.json({
        ...exposure,
        verdict,
        isTruncated: false,
      });
      return;
    }

    // Build a teaser preview from the paid data
    const actionCount = exposure.activeActions?.length ?? 0;
    const riskCount = exposure.riskFactors?.length ?? 0;
    const exposureParts: string[] = [];
    if (actionCount > 0) exposureParts.push(`${actionCount} active regulatory action${actionCount > 1 ? 's' : ''}`);
    if (riskCount > 0) exposureParts.push(`${riskCount} risk factor${riskCount > 1 ? 's' : ''} identified`);
    if (exposure.recommendation) exposureParts.push(`recommendation available`);
    const exposurePreview = exposureParts.length > 0
      ? `${exposureParts.join(' · ')} — upgrade for full report`
      : `Exposure analysis complete — upgrade for full report`;
    const hiddenActionCount = exposure.activeActions.length;
    const hiddenRiskFactorCount = exposure.riskFactors.length;

    trackFunnelEvent('paywall_hit', { endpoint: req.path, plan: 'free' });
    trackFunnelEvent('upgrade_cta_shown', { endpoint: req.path });
    res.json({
      project: exposure.project,
      exposureLevel: exposure.exposureLevel,
      exposureScore: exposure.exposureScore,
      verdict,
      preview: exposurePreview,
      isTruncated: true,
      missed: {
        count: hiddenActionCount,
        description: `${hiddenActionCount} active action${hiddenActionCount === 1 ? '' : 's'} and ${hiddenRiskFactorCount} risk factor${hiddenRiskFactorCount === 1 ? '' : 's'} are hidden`,
        highest_hidden_confidence: exposure.exposureScore,
        hidden_risk_factor_count: hiddenRiskFactorCount,
      },
      upgrade: {
        message: `You are missing ${hiddenActionCount} active regulatory action${hiddenActionCount === 1 ? '' : 's'}. Upgrade to see all.`,
        register: BASIC_REGISTRATION_LINK,
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
      summary: `${headlines.length} compliance headlines cached. Threat trend: ${cachedThreatRadar?.threatTrend ?? 'unavailable'}, level: ${cachedThreatRadar?.overallThreatLevel ?? 'n/a'}/100.`,
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
