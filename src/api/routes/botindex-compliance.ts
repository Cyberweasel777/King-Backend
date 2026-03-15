import { Request, Response, Router } from 'express';
import logger from '../../config/logger';
import { analyzeComplianceHeadlines } from '../../services/botindex/compliance/analyzer';
import { getComplianceScannerNote, scanComplianceHeadlines } from '../../services/botindex/compliance/scanner';

const router = Router();

const PRO_REGISTRATION_LINK = 'https://king-backend.fly.dev/api/botindex/keys/register?plan=pro';

function truncateReasoning(reasoning: string): string {
  const base = reasoning.slice(0, 80);
  return `${base}... [upgrade for full analysis]`;
}

function truncateMarketBrief(brief: string): string {
  return brief.length > 120 ? brief.slice(0, 120) : brief;
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

    const hasPaidPlan = req.apiKeyAuth?.plan === 'pro' || req.apiKeyAuth?.plan === 'basic';
    const hasBypass = Boolean((req as any).__apiKeyAuthenticated);
    const hasFullAccess = hasPaidPlan || hasBypass;

    if (hasFullAccess) {
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

export default router;
