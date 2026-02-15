/**
 * Kalshi Scraper
 * Uses Kalshi API v2
 * Docs: https://trading-api.readme.io/reference/
 */

import { BaseScraper } from './base-scraper';
import { 
  ScrapeResult, PredictionMarket, PredictionEvent, Market, 
  OddsSnapshot, KalshiEvent, KalshiMarket 
} from '../types';

export class KalshiScraper extends BaseScraper {
  // Kalshi migrated their prod Trading API to api.elections.kalshi.com
  private apiUrl = 'https://api.elections.kalshi.com/trade-api/v2';

  constructor() {
    super({
      name: 'Kalshi',
      baseUrl: 'https://kalshi.com',
      rateLimitMs: 500, // 2 requests per second
      maxRetries: 3,
      timeout: 30000,
    });
  }

  getMarketplace(): PredictionMarket {
    return 'kalshi';
  }

  async scrape(): Promise<ScrapeResult> {
    const scrapedAt = new Date().toISOString();
    const errors: string[] = [];
    const events: PredictionEvent[] = [];
    const markets: Market[] = [];
    const oddsSnapshots: OddsSnapshot[] = [];

    try {
      console.log('🔍 Fetching Kalshi events...');

      // Fetch open events (single request)
      const openEvents = await this.fetchActiveEvents();
      const eventByTicker = new Map<string, KalshiEvent>();
      for (const e of openEvents) {
        const t = (e as any).event_ticker || (e as any).ticker;
        if (t) eventByTicker.set(String(t), e);
      }

      // Fetch open markets (single request)
      console.log('🔍 Fetching Kalshi markets...');
      const openMarkets = await this.fetchOpenMarkets();

      const emittedEvents = new Set<string>();

      for (const marketData of openMarkets) {
        try {
          const eventTicker = String((marketData as any).event_ticker || '');
          const eventId = `ks_${eventTicker}`;

          if (eventTicker && !emittedEvents.has(eventTicker)) {
            const eventData = eventByTicker.get(eventTicker);
            const event = eventData ? this.parseEvent(eventData) : {
              id: eventId,
              title: (marketData as any).title || eventTicker,
              description: undefined,
              category: 'General',
              resolutionSource: 'Kalshi Resolution',
              resolutionTime: (marketData as any).close_time,
              status: 'active' as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            events.push(event);
            emittedEvents.add(eventTicker);
          }

          // Some endpoints return status="active" even when filtered with status=open
          const market = this.parseMarket(marketData as any, eventId);
          markets.push(market);

          const snapshot = this.createOddsSnapshot(market);
          oddsSnapshots.push(snapshot);
        } catch (err) {
          errors.push(`Market ${(marketData as any).ticker || ''}: ${(err as Error).message}`);
        }
      }

      console.log(`✅ Kalshi: ${events.length} events, ${markets.length} markets`);

    } catch (error) {
      errors.push(`Kalshi scrape failed: ${(error as Error).message}`);
      console.error('Kalshi scrape error:', error);
    }

    return {
      market: this.getMarketplace(),
      events,
      markets,
      oddsSnapshots,
      errors,
      scrapedAt,
    };
  }

  private async fetchActiveEvents(): Promise<KalshiEvent[]> {
    // Kalshi uses `status=open` for events (not `active`).
    const response = await this.request<{ events: KalshiEvent[] }>({
      method: 'GET',
      url: `${this.apiUrl}/events`,
      params: {
        status: 'open',
        limit: 100,
      },
    });

    return response.events || [];
  }

  private async fetchOpenMarkets(): Promise<KalshiMarket[]> {
    // Pull a page of open markets (no auth required for public market data).
    // Keeping this as a single request avoids N+1 fetches per event.
    const response = await this.request<{ markets: KalshiMarket[] }>({
      method: 'GET',
      url: `${this.apiUrl}/markets`,
      params: {
        status: 'open',
        limit: 200,
      },
    });

    return response.markets || [];
  }

  private parseEvent(eventData: KalshiEvent): PredictionEvent {
    const ticker = (eventData as any).event_ticker || (eventData as any).ticker;

    return {
      id: `ks_${ticker}`,
      title: (eventData as any).title,
      description: (eventData as any).description,
      category: (eventData as any).category || 'General',
      resolutionSource: 'Kalshi Resolution',
      resolutionTime: (eventData as any).close_time,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private parseMarket(marketData: KalshiMarket, eventId: string): Market {
    // Kalshi uses cents (0-100), convert to probability (0-1)
    const yesAsk = (marketData.yes_ask || 50) / 100;
    const yesBid = (marketData.yes_bid || 50) / 100;
    
    // Use midprice as market price
    const yesPrice = (yesAsk + yesBid) / 2;
    const noPrice = 1 - yesPrice;

    const outcomes = ['Yes', 'No'];
    const outcomePrices: Record<string, number> = {
      'Yes': yesPrice,
      'No': noPrice,
    };

    return {
      id: `ks_${marketData.ticker}`,
      eventId: eventId,
      marketSlug: marketData.ticker.toLowerCase().replace(/_/g, '-'),
      question: marketData.title,
      description: undefined,
      outcomes,
      outcomePrices,
      volume24h: marketData.volume || 0,
      volumeTotal: marketData.volume || 0,
      liquidity: marketData.open_interest || 0,
      endDate: undefined,
      status: 'active',
      sourceMarketId: marketData.ticker,
      market: 'kalshi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private createOddsSnapshot(market: Market): OddsSnapshot {
    return {
      id: `ks_snap_${market.id}_${Date.now()}`,
      marketId: market.id,
      market: 'kalshi',
      outcomes: market.outcomePrices,
      impliedProbabilities: { ...market.outcomePrices }, // Kalshi has no vig on binary
      totalVolume: market.volume24h,
      liquidity: market.liquidity,
      timestamp: new Date().toISOString(),
    };
  }
}
