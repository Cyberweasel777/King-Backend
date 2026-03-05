/**
 * Scraper Orchestrator
 * Coordinates all scrapers and manages data flow
 */
import { MemeRadarEvent } from '../shared/types';
interface ScraperConfig {
    heliusApiKey?: string;
    twitterBearerToken?: string;
}
export declare class ScraperOrchestrator {
    private dexscreener;
    private helius?;
    private twitter?;
    private eventHandlers;
    private isRunning;
    constructor(config?: ScraperConfig);
    /**
     * Register event handler for scraped data
     */
    onEvent(handler: (event: MemeRadarEvent) => void): void;
    /**
     * Emit event to all handlers
     */
    private emit;
    /**
     * Run single scrape cycle
     */
    scrape(): Promise<void>;
    /**
     * Start continuous scraping
     */
    start(intervalMs?: number): void;
    /**
     * Stop scraping
     */
    stop(): void;
    /**
     * Add whale wallet to track
     */
    trackWallet(address: string, label?: string, tags?: string[]): void;
    /**
     * Remove whale wallet from tracking
     */
    untrackWallet(address: string): void;
    private scrapeDexScreener;
    private scrapeHelius;
    private scrapeTwitter;
}
export default ScraperOrchestrator;
//# sourceMappingURL=orchestrator.d.ts.map