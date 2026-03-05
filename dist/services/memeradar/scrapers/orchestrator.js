"use strict";
/**
 * Scraper Orchestrator
 * Coordinates all scrapers and manages data flow
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperOrchestrator = void 0;
const dexscreener_1 = require("./dexscreener");
const helius_1 = require("./helius");
const twitter_1 = require("./twitter");
const logger_1 = require("../shared/logger");
const logger = (0, logger_1.createLogger)('ScraperOrchestrator');
class ScraperOrchestrator {
    dexscreener;
    helius;
    twitter;
    eventHandlers = [];
    isRunning = false;
    constructor(config = {}) {
        this.dexscreener = new dexscreener_1.DexScreenerScraper();
        if (config.heliusApiKey) {
            this.helius = new helius_1.HeliusScraper(config.heliusApiKey);
        }
        if (config.twitterBearerToken) {
            this.twitter = new twitter_1.TwitterScraper(config.twitterBearerToken);
        }
    }
    /**
     * Register event handler for scraped data
     */
    onEvent(handler) {
        this.eventHandlers.push(handler);
    }
    /**
     * Emit event to all handlers
     */
    emit(event) {
        for (const handler of this.eventHandlers) {
            try {
                handler(event);
            }
            catch (error) {
                logger.error('Event handler failed', error);
            }
        }
    }
    /**
     * Run single scrape cycle
     */
    async scrape() {
        logger.info('Starting scrape cycle');
        const startTime = Date.now();
        try {
            // Run scrapers in parallel
            const results = await Promise.allSettled([
                this.scrapeDexScreener(),
                this.scrapeHelius(),
                this.scrapeTwitter(),
            ]);
            const duration = Date.now() - startTime;
            logger.info(`Scrape cycle completed in ${duration}ms`);
            // Log any failures
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    logger.error(`Scraper ${index} failed`, result.reason);
                }
            });
        }
        catch (error) {
            logger.error('Scrape cycle failed', error);
        }
    }
    /**
     * Start continuous scraping
     */
    start(intervalMs = 60000) {
        if (this.isRunning) {
            logger.warn('Scraper already running');
            return;
        }
        this.isRunning = true;
        logger.info(`Starting continuous scraping (interval: ${intervalMs}ms)`);
        // Initial scrape
        this.scrape();
        // Schedule recurring scrapes
        const interval = setInterval(() => {
            if (!this.isRunning) {
                clearInterval(interval);
                return;
            }
            this.scrape();
        }, intervalMs);
    }
    /**
     * Stop scraping
     */
    stop() {
        this.isRunning = false;
        logger.info('Stopped scraping');
    }
    /**
     * Add whale wallet to track
     */
    trackWallet(address, label, tags = []) {
        if (this.helius) {
            this.helius.trackWallet(address, label, tags);
        }
        else {
            logger.warn('Helius scraper not configured, cannot track wallet');
        }
    }
    /**
     * Remove whale wallet from tracking
     */
    untrackWallet(address) {
        if (this.helius) {
            this.helius.untrackWallet(address);
        }
    }
    // Individual scraper methods
    async scrapeDexScreener() {
        try {
            const { trending, profiles } = await this.dexscreener.scrape();
            // Emit token discovered events for new trending tokens
            for (const item of trending.slice(0, 5)) {
                this.emit({
                    type: 'TOKEN_DISCOVERED',
                    data: item.token,
                });
            }
            // Emit price updates for all trending
            for (const item of trending) {
                this.emit({
                    type: 'PRICE_UPDATE',
                    data: item.token,
                });
            }
            logger.debug(`DexScreener: ${trending.length} trending, ${profiles.length} profiles`);
        }
        catch (error) {
            logger.error('DexScreener scrape failed', error);
        }
    }
    async scrapeHelius() {
        if (!this.helius)
            return;
        try {
            const { transactions, wallets } = await this.helius.scrape();
            // Emit whale trade events
            for (const tx of transactions) {
                this.emit({
                    type: 'WHALE_TRADE',
                    data: tx,
                });
            }
            logger.debug(`Helius: ${transactions.length} whale trades, ${wallets.length} wallets tracked`);
        }
        catch (error) {
            logger.error('Helius scrape failed', error);
        }
    }
    async scrapeTwitter() {
        if (!this.twitter)
            return;
        try {
            const { sentiments } = await this.twitter.scrape();
            // Emit sentiment update events
            for (const sentiment of sentiments) {
                this.emit({
                    type: 'SENTIMENT_UPDATE',
                    data: sentiment,
                });
            }
            logger.debug(`Twitter: ${sentiments.length} sentiment updates`);
        }
        catch (error) {
            logger.error('Twitter scrape failed', error);
        }
    }
}
exports.ScraperOrchestrator = ScraperOrchestrator;
exports.default = ScraperOrchestrator;
//# sourceMappingURL=orchestrator.js.map