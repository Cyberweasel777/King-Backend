#!/usr/bin/env node
"use strict";
/**
 * Scraper Agent Entry Point
 * Runs the scraping infrastructure
 */
Object.defineProperty(exports, "__esModule", { value: true });
const orchestrator_1 = require("./orchestrator");
const logger_1 = require("../shared/logger");
const logger = (0, logger_1.createLogger)('ScraperAgent');
// Configuration from environment
const config = {
    heliusApiKey: process.env.HELIUS_API_KEY,
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
};
async function main() {
    logger.info('🚀 Starting MemeRadar Scraper Agent');
    const orchestrator = new orchestrator_1.ScraperOrchestrator(config);
    // Set up event logging
    orchestrator.onEvent((event) => {
        switch (event.type) {
            case 'TOKEN_DISCOVERED':
                logger.info(`🔍 New token discovered: ${event.data.symbol} ($${event.data.priceUsd.toFixed(6)})`);
                break;
            case 'PRICE_UPDATE':
                logger.debug(`📊 Price update: ${event.data.symbol} ${event.data.priceChange24h.toFixed(2)}%`);
                break;
            case 'WHALE_TRADE':
                logger.info(`🐋 Whale trade: ${event.data.wallet} ${event.data.type} ${event.data.tokenOut}`);
                break;
            case 'SENTIMENT_UPDATE':
                logger.debug(`💭 Sentiment: ${event.data.token} (${event.data.sentiment.toFixed(2)})`);
                break;
        }
    });
    // Add some default whale wallets to track (example)
    if (config.heliusApiKey) {
        // These are example addresses - replace with actual whale wallets
        orchestrator.trackWallet('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVbAW5qr5b6pNX', 'Example Whale 1', ['whale']);
    }
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        logger.info('Shutting down scraper agent...');
        orchestrator.stop();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        logger.info('Shutting down scraper agent...');
        orchestrator.stop();
        process.exit(0);
    });
    // Start continuous scraping (every 30 seconds)
    orchestrator.start(30000);
    // Also run an immediate scrape
    await orchestrator.scrape();
}
main().catch((error) => {
    logger.error('Fatal error', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map