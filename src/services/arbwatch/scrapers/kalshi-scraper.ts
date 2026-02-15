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
      
      // Fetch active events
      const activeEvents = await this.fetchActiveEvents();
      
      for (const eventData of activeEvents.slice(0, 50)) {
        try {
          const event = this.parseEvent(eventData);
          events.push(event);

          // Fetch markets for this event
          const eventMarkets = await this.fetchMarketsForEvent(eventData.ticker);

          for (const marketData of eventMarkets) {
            if (marketData.status !== 'active') continue;

            const market = this.parseMarket(marketData, event.id);
            markets.push(market);

            // Get odds snapshot
            const snapshot = this.createOddsSnapshot(market);
            oddsSnapshots.push(snapshot);
          }
        } catch (err) {
          errors.push(`Event ${eventData.ticker}: ${(err as Error).message}`);
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
    const response = await this.request<{ events: KalshiEvent[] }>({
      method: 'GET',
      url: `${this.apiUrl}/events`,
      params: {
        status: 'active',
        limit: 100,
      },
    });

    return response.events || [];
  }

  private async fetchMarketsForEvent(eventTicker: string): Promise<KalshiMarket[]> {
    try {
      const response = await this.request<{ markets: KalshiMarket[] }>({
        method: 'GET',
        url: `${this.apiUrl}/events/${eventTicker}/markets`,
      });
      return response.markets || [];
    } catch (error) {
      console.warn(`Failed to fetch markets for event ${eventTicker}:`, error);
      return [];
    }
  }

  private parseEvent(eventData: KalshiEvent): PredictionEvent {
    return {
      id: `ks_${eventData.ticker}`,
      title: eventData.title,
      description: eventData.description,
      category: eventData.category || 'General',
      resolutionSource: 'Kalshi Resolution',
      resolutionTime: eventData.close_time,
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
