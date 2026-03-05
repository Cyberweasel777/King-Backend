"use strict";
/**
 * Kalshi Scraper
 * Uses Kalshi API v2
 * Docs: https://trading-api.readme.io/reference/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KalshiScraper = void 0;
const base_scraper_1 = require("./base-scraper");
class KalshiScraper extends base_scraper_1.BaseScraper {
    // Kalshi migrated their prod Trading API to api.elections.kalshi.com
    apiUrl = 'https://api.elections.kalshi.com/trade-api/v2';
    constructor() {
        super({
            name: 'Kalshi',
            baseUrl: 'https://kalshi.com',
            rateLimitMs: 500, // 2 requests per second
            maxRetries: 3,
            timeout: 30000,
        });
    }
    getMarketplace() {
        return 'kalshi';
    }
    async scrape() {
        const scrapedAt = new Date().toISOString();
        const errors = [];
        const events = [];
        const markets = [];
        const oddsSnapshots = [];
        try {
            console.log('🔍 Fetching Kalshi events...');
            // Fetch open events (single request)
            const openEvents = await this.fetchActiveEvents();
            const eventByTicker = new Map();
            for (const e of openEvents) {
                const t = e.event_ticker || e.ticker;
                if (t)
                    eventByTicker.set(String(t), e);
            }
            // Fetch open markets (single request)
            console.log('🔍 Fetching Kalshi markets...');
            const openMarkets = await this.fetchOpenMarkets();
            const emittedEvents = new Set();
            for (const marketData of openMarkets) {
                try {
                    const eventTicker = String(marketData.event_ticker || '');
                    const eventId = `ks_${eventTicker}`;
                    if (eventTicker && !emittedEvents.has(eventTicker)) {
                        const eventData = eventByTicker.get(eventTicker);
                        const event = eventData ? this.parseEvent(eventData) : {
                            id: eventId,
                            title: marketData.title || eventTicker,
                            description: undefined,
                            category: 'General',
                            resolutionSource: 'Kalshi Resolution',
                            resolutionTime: marketData.close_time,
                            status: 'active',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        };
                        events.push(event);
                        emittedEvents.add(eventTicker);
                    }
                    // Some endpoints return status="active" even when filtered with status=open
                    const market = this.parseMarket(marketData, eventId);
                    markets.push(market);
                    const snapshot = this.createOddsSnapshot(market);
                    oddsSnapshots.push(snapshot);
                }
                catch (err) {
                    errors.push(`Market ${marketData.ticker || ''}: ${err.message}`);
                }
            }
            console.log(`✅ Kalshi: ${events.length} events, ${markets.length} markets`);
        }
        catch (error) {
            errors.push(`Kalshi scrape failed: ${error.message}`);
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
    async fetchActiveEvents() {
        // Kalshi uses `status=open` for events (not `active`).
        const response = await this.request({
            method: 'GET',
            url: `${this.apiUrl}/events`,
            params: {
                status: 'open',
                limit: 100,
            },
        });
        return response.events || [];
    }
    async fetchOpenMarkets() {
        // Pull a page of open markets (no auth required for public market data).
        // Keeping this as a single request avoids N+1 fetches per event.
        const response = await this.request({
            method: 'GET',
            url: `${this.apiUrl}/markets`,
            params: {
                status: 'open',
                limit: 200,
            },
        });
        return response.markets || [];
    }
    parseEvent(eventData) {
        const ticker = eventData.event_ticker || eventData.ticker;
        return {
            id: `ks_${ticker}`,
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
    parseMarket(marketData, eventId) {
        // Kalshi uses cents (0-100), convert to probability (0-1)
        const yesAsk = (marketData.yes_ask || 50) / 100;
        const yesBid = (marketData.yes_bid || 50) / 100;
        // Use midprice as market price
        const yesPrice = (yesAsk + yesBid) / 2;
        const noPrice = 1 - yesPrice;
        const outcomes = ['Yes', 'No'];
        const outcomePrices = {
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
    createOddsSnapshot(market) {
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
exports.KalshiScraper = KalshiScraper;
//# sourceMappingURL=kalshi-scraper.js.map