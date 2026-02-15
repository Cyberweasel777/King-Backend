/**
 * Scraper Orchestrator
 * Coordinates all scrapers and manages data flow
 */

import { DexScreenerScraper } from './dexscreener';
import { HeliusScraper } from './helius';
import { TwitterScraper } from './twitter';
import { createLogger } from '../shared/logger';
import { MemeRadarEvent } from '../shared/types';

const logger = createLogger('ScraperOrchestrator');

interface ScraperConfig {
  heliusApiKey?: string;
  twitterBearerToken?: string;
}

export class ScraperOrchestrator {
  private dexscreener: DexScreenerScraper;
  private helius?: HeliusScraper;
  private twitter?: TwitterScraper;
  private eventHandlers: Array<(event: MemeRadarEvent) => void> = [];
  private isRunning = false;

  constructor(config: ScraperConfig = {}) {
    this.dexscreener = new DexScreenerScraper();
    
    if (config.heliusApiKey) {
      this.helius = new HeliusScraper(config.heliusApiKey);
    }
    
    if (config.twitterBearerToken) {
      this.twitter = new TwitterScraper(config.twitterBearerToken);
    }
  }

  /**
   * Register event handler for scraped data
   */
  onEvent(handler: (event: MemeRadarEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit event to all handlers
   */
  private emit(event: MemeRadarEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        logger.error('Event handler failed', error);
      }
    }
  }

  /**
   * Run single scrape cycle
   */
  async scrape(): Promise<void> {
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
    } catch (error) {
      logger.error('Scrape cycle failed', error);
    }
  }

  /**
   * Start continuous scraping
   */
  start(intervalMs: number = 60000): void {
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
  stop(): void {
    this.isRunning = false;
    logger.info('Stopped scraping');
  }

  /**
   * Add whale wallet to track
   */
  trackWallet(address: string, label?: string, tags: string[] = []): void {
    if (this.helius) {
      this.helius.trackWallet(address, label, tags);
    } else {
      logger.warn('Helius scraper not configured, cannot track wallet');
    }
  }

  /**
   * Remove whale wallet from tracking
   */
  untrackWallet(address: string): void {
    if (this.helius) {
      this.helius.untrackWallet(address);
    }
  }

  // Individual scraper methods
  private async scrapeDexScreener(): Promise<void> {
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
    } catch (error) {
      logger.error('DexScreener scrape failed', error);
    }
  }

  private async scrapeHelius(): Promise<void> {
    if (!this.helius) return;

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
    } catch (error) {
      logger.error('Helius scrape failed', error);
    }
  }

  private async scrapeTwitter(): Promise<void> {
    if (!this.twitter) return;

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
    } catch (error) {
      logger.error('Twitter scrape failed', error);
    }
  }
}

export default ScraperOrchestrator;
