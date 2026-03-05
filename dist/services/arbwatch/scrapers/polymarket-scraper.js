"use strict";
/**
 * Polymarket Scraper
 * Uses Polymarket CLOB API and Gamma API
 * Docs: https://docs.polymarket.com/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolymarketScraper = void 0;
const base_scraper_1 = require("./base-scraper");
class PolymarketScraper extends base_scraper_1.BaseScraper {
    gammaApiUrl = 'https://gamma-api.polymarket.com';
    clobApiUrl = 'https://clob.polymarket.com';
    constructor() {
        super({
            name: 'Polymarket',
            baseUrl: 'https://polymarket.com',
            rateLimitMs: 500, // 2 requests per second
            maxRetries: 3,
            timeout: 30000,
        });
    }
    getMarketplace() {
        return 'polymarket';
    }
    async scrape() {
        const scrapedAt = new Date().toISOString();
        const errors = [];
        const events = [];
        const markets = [];
        const oddsSnapshots = [];
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
                        if (!marketData.active || marketData.closed)
                            continue;
                        const market = this.parseMarket(marketData, event.id);
                        markets.push(market);
                        // Get odds snapshot
                        const snapshot = this.createOddsSnapshot(market);
                        oddsSnapshots.push(snapshot);
                    }
                }
                catch (err) {
                    errors.push(`Event ${eventData.id}: ${err.message}`);
                }
            }
            console.log(`✅ Polymarket: ${events.length} events, ${markets.length} markets`);
        }
        catch (error) {
            errors.push(`Polymarket scrape failed: ${error.message}`);
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
    async fetchActiveEvents() {
        // Fetch events from Gamma API
        const response = await this.request({
            method: 'GET',
            url: `${this.gammaApiUrl}/events`,
            params: {
                active: true,
                closed: false,
                limit: 100,
                // NOTE: Gamma API sorting params have changed over time; keep this call minimal
                // to avoid 422 validation errors (e.g. "order fields are not valid").
            },
        });
        return response;
    }
    async fetchMarketOrderbook(marketId) {
        try {
            const response = await this.request({
                method: 'GET',
                url: `${this.clobApiUrl}/markets/${marketId}`,
            });
            return response;
        }
        catch (error) {
            console.warn(`Failed to fetch orderbook for ${marketId}:`, error);
            return null;
        }
    }
    parseEvent(eventData) {
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
    parseMarket(marketData, eventId) {
        const outcomes = [];
        const outcomePrices = {};
        // Parse outcomes from market data
        if (marketData.outcomes) {
            for (let i = 0; i < marketData.outcomes.length; i++) {
                const outcome = marketData.outcomes[i];
                const price = marketData.outcomePrices?.[i] || '0.5';
                outcomes.push(outcome);
                outcomePrices[outcome] = this.parsePrice(price);
            }
        }
        else {
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
    createOddsSnapshot(market) {
        // Calculate implied probabilities (remove vig if needed)
        const impliedProbabilities = {};
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
exports.PolymarketScraper = PolymarketScraper;
//# sourceMappingURL=polymarket-scraper.js.map