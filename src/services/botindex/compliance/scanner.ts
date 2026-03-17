import logger from '../../../config/logger';
import { complianceSearchMulti, type SearchResult } from './search-provider';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const COMPLIANCE_SEARCH_QUERIES = [
  'prediction market regulation',
  'stablecoin regulation SEC',
  'crypto compliance enforcement',
  'AI agent trading CFTC',
];

const SAMPLE_NOTE = 'Sample headlines only. Set FIRECRAWL_API_KEY or BRAVE_API_KEY for live scanning.';

export interface ComplianceHeadline {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt: string;
}

const scannerCache = new Map<string, { data: ComplianceHeadline[]; expiresAt: number }>();

function getSampleHeadlines(): ComplianceHeadline[] {
  const now = new Date().toISOString();
  return [
    {
      title: 'CFTC Signals Tighter Oversight for Event-Contract Prediction Venues',
      url: 'https://example.com/sample/cftc-prediction-oversight',
      source: 'sample_feed',
      snippet: `US derivatives oversight is tightening around prediction-style contracts. ${SAMPLE_NOTE}`,
      publishedAt: now,
    },
    {
      title: 'SEC Staff Commentary Revives Stablecoin Disclosure Debate',
      url: 'https://example.com/sample/sec-stablecoin-disclosure',
      source: 'sample_feed',
      snippet: 'Regulatory focus is shifting toward reserves, redemptions, and issuer transparency.',
      publishedAt: now,
    },
    {
      title: 'EU Policymakers Discuss Cross-Border Rules for Crypto Compliance Tooling',
      url: 'https://example.com/sample/eu-crypto-compliance-tooling',
      source: 'sample_feed',
      snippet: 'New policy language may affect KYC orchestration and monitoring workflows across regions.',
      publishedAt: now,
    },
    {
      title: 'State-Level U.S. Agencies Expand AI Trading Agent Review Programs',
      url: 'https://example.com/sample/us-state-ai-trading-review',
      source: 'sample_feed',
      snippet: 'Automated strategy agents are drawing increased scrutiny around disclosures and consumer harm.',
      publishedAt: now,
    },
    {
      title: 'Banking Watchdogs Highlight DeFi Interface Liability in New Remarks',
      url: 'https://example.com/sample/defi-interface-liability',
      source: 'sample_feed',
      snippet: 'Protocol front-end operators face renewed questions on compliance accountability.',
      publishedAt: now,
    },
  ];
}

function searchResultToHeadline(result: SearchResult): ComplianceHeadline {
  return {
    title: result.title,
    url: result.url,
    source: result.source,
    snippet: result.snippet,
    publishedAt: new Date().toISOString(),
  };
}

export async function scanComplianceHeadlines(): Promise<ComplianceHeadline[]> {
  const cacheKey = 'compliance:headlines:latest';
  const now = Date.now();
  const cached = scannerCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const hasSearchKey = process.env.FIRECRAWL_API_KEY || process.env.BRAVE_API_KEY;
  if (!hasSearchKey) {
    logger.warn('[compliance.scanner] No search API keys configured, serving sample headlines');
    const sample = getSampleHeadlines();
    scannerCache.set(cacheKey, { data: sample, expiresAt: now + CACHE_TTL_MS });
    return sample;
  }

  try {
    const results = await complianceSearchMulti(COMPLIANCE_SEARCH_QUERIES);
    if (results.length === 0) {
      logger.warn('[compliance.scanner] Search returned 0 results, serving sample headlines');
      const sample = getSampleHeadlines();
      scannerCache.set(cacheKey, { data: sample, expiresAt: now + CACHE_TTL_MS });
      return sample;
    }

    const headlines = results
      .map(searchResultToHeadline)
      .slice(0, 30);

    scannerCache.set(cacheKey, { data: headlines, expiresAt: now + CACHE_TTL_MS });
    return headlines;
  } catch (error) {
    logger.error({ err: error }, '[compliance.scanner] live scan failed, serving sample headlines');
    const sample = getSampleHeadlines();
    scannerCache.set(cacheKey, { data: sample, expiresAt: now + CACHE_TTL_MS });
    return sample;
  }
}

export function getComplianceScannerNote(): string | null {
  const hasKey = process.env.FIRECRAWL_API_KEY || process.env.BRAVE_API_KEY;
  return hasKey ? null : SAMPLE_NOTE;
}
