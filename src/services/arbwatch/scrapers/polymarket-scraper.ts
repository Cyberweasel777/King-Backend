/**
 * Polymarket Scraper
 * Uses Polymarket CLOB API and Gamma API
 * Docs: https://docs.polymarket.com/
 */

import { BaseScraper } from './base-scraper';
import { 
  ScrapeResult, PredictionMarket, PredictionEvent, Market, 
  OddsSnapshot, PolymarketEvent 
} from '../types';

export class PolymarketScraper extends BaseScraper {
  private gammaApiUrl = 'https://gamma-api.polymarket.com';
  private clobApiUrl = 'https://clob.polymarket.com';

  constructor() {
    super({
      name: 'Polymarket',
      baseUrl: 'https://polymarket.com',
      rateLimitMs: 500, // 2 requests per second
      maxRetries: 3,
      timeout: 30000,
    });
  }

  getMarketplace(): PredictionMarket {
    return 'polymarket';
  }

  async scrape(): Promise<ScrapeResult> {
    const scrapedAt = new Date().toISOString();
    const errors: string[] = [];
    const events: PredictionEvent[] = [];
    const markets: Market[] = [];
    const oddsSnapshots: OddsSnapshot[] = [];

    try {
      console.log('🔍 Fetching Polymarket events...');
      
      // Fetch active markets from Gamma API
      const activeEvents = await this.fetchActiveEvents();
      
      for (const eventData of activeEvents.slice(0, 50)) { // Limit to 50 events per scrape
        try {
          const event = this.parseEvent(eventData);
          events.push(event);

          // Process each market in the event
          for (const marketData of eventData.markets || []) {
            if (!marketData.active || marketData.closed) continue;

            const market = this.parseMarket(marketData, event.id);
            markets.push(market);

            // Get odds snapshot
            const snapshot = this.createOddsSnapshot(market);
            oddsSnapshots.push(snapshot);
          }
        } catch (err) {
          errors.push(`Event ${eventData.id}: ${(err as Error).message}`);
        }
      }

      console.log(`✅ Polymarket: ${events.length} events, ${markets.length} markets`);

    } catch (error) {
      errors.push(`Polymarket scrape failed: ${(error as Error).message}`);
      console.error('Polymarket scrape error:', error);
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

  private async fetchActiveEvents(): Promise<PolymarketEvent[]> {
    // Fetch events from Gamma API
    const response = await this.request<PolymarketEvent[]>({
      method: 'GET',
      url: `${this.gammaApiUrl}/events`,
      params: {
        active: true,
        closed: false,
        limit: 100,
        sort: 'volume',
        order: 'desc',
      },
    });

    return response;
  }

  private async fetchMarketOrderbook(marketId: string) {
    try {
      const response = await this.request<any>({
        method: 'GET',
        url: `${this.clobApiUrl}/markets/${marketId}`,
      });
      return response;
    } catch (error) {
      console.warn(`Failed to fetch orderbook for ${marketId}:`, error);
      return null;
    }
  }

  private parseEvent(eventData: PolymarketEvent): PredictionEvent {
    return {
      id: `pm_${eventData.id}`,
      title: eventData.title,
      description: eventData.description,
      category: eventData.category || 'General',
      imageUrl: eventData.imageUrl,
      resolutionSource: 'Polymarket Oracle',
      resolutionTime: eventData.endDate,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private parseMarket(marketData: any, eventId: string): Market {
    const outcomes: string[] = [];
    const outcomePrices: Record<string, number> = {};

    // Parse outcomes from market data
    if (marketData.outcomes) {
      for (let i = 0; i < marketData.outcomes.length; i++) {
        const outcome = marketData.outcomes[i];
        const price = marketData.outcomePrices?.[i] || '0.5';
        
        outcomes.push(outcome);
        outcomePrices[outcome] = this.parsePrice(price);
      }
    } else {
      // Binary market (Yes/No)
      outcomes.push('Yes', 'No');
      const yesPrice = this.parsePrice(marketData.outcomePrices?.['Yes'] || '0.5');
      outcomePrices['Yes'] = yesPrice;
      outcomePrices['No'] = 1 - yesPrice;
    }

    return {
      id: `pm_${marketData.id}`,
      eventId: eventId,
      marketSlug: marketData.slug,
      question: marketData.question,
      description: marketData.description,
      outcomes,
      outcomePrices,
      volume24h: parseFloat(marketData.volume24hr || '0'),
      volumeTotal: parseFloat(marketData.volume || '0'),
      liquidity: parseFloat(marketData.liquidity || '0'),
      endDate: marketData.endDate,
      status: 'active',
      sourceMarketId: marketData.id,
      market: 'polymarket',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private createOddsSnapshot(market: Market): OddsSnapshot {
    // Calculate implied probabilities (remove vig if needed)
    const impliedProbabilities: Record<string, number> = {};
    let totalProb = 0;

    for (const [outcome, price] of Object.entries(market.outcomePrices)) {
      totalProb += price;
    }

    // Normalize to remove vig
    for (const [outcome, price] of Object.entries(market.outcomePrices)) {
      impliedProbabilities[outcome] = totalProb > 0 ? price / totalProb : price;
    }

    return {
      id: `pm_snap_${market.id}_${Date.now()}`,
      marketId: market.id,
      market: 'polymarket',
      outcomes: market.outcomePrices,
      impliedProbabilities,
      totalVolume: market.volume24h,
      liquidity: market.liquidity,
      timestamp: new Date().toISOString(),
    };
  }
}
