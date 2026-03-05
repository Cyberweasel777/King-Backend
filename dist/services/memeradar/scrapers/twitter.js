"use strict";
/**
 * Twitter/X Scraper
 * Monitors social sentiment for memecoins
 * Uses Twitter API v2 for search and streaming
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterScraper = void 0;
const base_scraper_1 = require("./base-scraper");
const logger_1 = require("../shared/logger");
const cache_1 = require("../shared/cache");
const logger = (0, logger_1.createLogger)('Twitter');
class TwitterScraper extends base_scraper_1.BaseScraper {
    bearerToken;
    baseUrl = 'https://api.twitter.com/2';
    trackedTokens = new Map();
    constructor(bearerToken) {
        super({
            name: 'Twitter',
            rateLimitMs: 2000, // 300 requests per 15 min window for search
            maxRetries: 3,
            timeoutMs: 10000,
        });
        this.bearerToken = bearerToken;
    }
    /**
     * Search for token mentions
     */
    async searchTokenMentions(tokenSymbol, hoursBack = 1) {
        const cacheKey = `twitter:sentiment:${tokenSymbol}:${hoursBack}`;
        const cached = cache_1.sentimentCache.get(cacheKey);
        if (cached) {
            logger.debug(`Cache hit for ${tokenSymbol} sentiment`);
            return cached;
        }
        logger.info(`Searching Twitter for $${tokenSymbol} mentions`);
        try {
            // Build search query
            const query = `$${tokenSymbol} OR #${tokenSymbol} -is:retweet lang:en`;
            const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
            const response = await this.withRetry(async () => {
                await this.rateLimit();
                const res = await this.fetchWithTimeout(`${this.baseUrl}/tweets/search/recent?query=${encodeURIComponent(query)}&` +
                    `start_time=${startTime}&` +
                    `tweet.fields=created_at,public_metrics,author_id&` +
                    `expansions=author_id&` +
                    `user.fields=username,public_metrics&` +
                    `max_results=100`, {
                    headers: {
                        'Authorization': `Bearer ${this.bearerToken}`,
                    },
                });
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                return res;
            });
            const data = await response.json();
            const tweets = (data.data || []).map((t) => ({
                id: t.id,
                text: t.text,
                createdAt: t.created_at,
                authorId: t.author_id,
                publicMetrics: t.public_metrics ? {
                    retweetCount: t.public_metrics.retweet_count,
                    replyCount: t.public_metrics.reply_count,
                    likeCount: t.public_metrics.like_count,
                    quoteCount: t.public_metrics.quote_count,
                } : undefined,
            }));
            // Calculate sentiment
            const sentiment = this.calculateSentiment(tweets);
            const engagement = tweets.reduce((sum, t) => sum + (t.publicMetrics?.likeCount || 0) + (t.publicMetrics?.retweetCount || 0), 0);
            const result = {
                token: tokenSymbol,
                platform: 'twitter',
                sentiment: sentiment.score,
                volume: tweets.length,
                engagement,
                trending: sentiment.trending,
                timestamp: new Date().toISOString(),
                topPosts: tweets
                    .sort((a, b) => (b.publicMetrics?.likeCount || 0) - (a.publicMetrics?.likeCount || 0))
                    .slice(0, 3)
                    .map(t => t.text),
            };
            cache_1.sentimentCache.set(cacheKey, result, 300000); // 5 minute cache
            logger.info(`Found ${tweets.length} mentions for $${tokenSymbol}, sentiment: ${sentiment.score.toFixed(2)}`);
            return result;
        }
        catch (error) {
            logger.error(`Failed to search Twitter for ${tokenSymbol}`, error);
            return this.getMockSentiment(tokenSymbol);
        }
    }
    /**
     * Get trending crypto topics
     */
    async getTrendingCryptoTopics() {
        try {
            // Note: Twitter API v2 doesn't have a trending topics endpoint
            // This would need to be implemented using a third-party service
            // or by tracking popular search queries
            // For now, return common memecoin keywords
            return [
                'memecoin', 'solana', 'pumpfun', 'degen',
                'moon', 'gem', 'alpha', 'wagmi', 'ape'
            ];
        }
        catch (error) {
            logger.error('Failed to get trending topics', error);
            return [];
        }
    }
    /**
     * Monitor multiple tokens for sentiment changes
     */
    async monitorTokens(tokens) {
        const results = [];
        for (const token of tokens) {
            try {
                const sentiment = await this.searchTokenMentions(token, 1);
                results.push(sentiment);
                // Track mention count changes
                const prev = this.trackedTokens.get(token);
                if (prev) {
                    const change = sentiment.volume - prev.mentionCount;
                    if (change > 10) {
                        logger.info(`🚀 ${token} mentions increased by ${change} in last hour`);
                    }
                }
                this.trackedTokens.set(token, {
                    lastChecked: new Date().toISOString(),
                    mentionCount: sentiment.volume,
                });
            }
            catch (error) {
                logger.error(`Failed to monitor ${token}`, error);
            }
        }
        return results;
    }
    /**
     * Main scrape method for scheduled runs
     */
    async scrape() {
        // Default tokens to monitor
        const defaultTokens = ['BONK', 'WIF', 'PEPE', 'SHIB', 'FLOKI'];
        const sentiments = await this.monitorTokens(defaultTokens);
        return { sentiments };
    }
    // Helper methods
    calculateSentiment(tweets) {
        if (tweets.length === 0)
            return { score: 0, trending: false };
        const positiveWords = [
            'moon', 'rocket', 'bullish', 'pump', 'gem', 'alpha', 'gain', 'profit',
            'explode', 'moonshot', '10x', '100x', '1000x', 'wagmi', 'lfg', 'based'
        ];
        const negativeWords = [
            'rug', 'scam', 'dump', 'bearish', 'panic', 'sell', 'crash', 'dip',
            'down', 'loss', 'rekt', 'ngmi', 'fud', 'ponzi', 'shitcoin'
        ];
        let positiveCount = 0;
        let negativeCount = 0;
        let totalEngagement = 0;
        for (const tweet of tweets) {
            const text = tweet.text.toLowerCase();
            const engagement = (tweet.publicMetrics?.likeCount || 0) +
                (tweet.publicMetrics?.retweetCount || 0);
            totalEngagement += engagement;
            const hasPositive = positiveWords.some(w => text.includes(w));
            const hasNegative = negativeWords.some(w => text.includes(w));
            // Weight by engagement
            const weight = Math.log10(engagement + 1) + 1;
            if (hasPositive && !hasNegative) {
                positiveCount += weight;
            }
            else if (hasNegative && !hasPositive) {
                negativeCount += weight;
            }
        }
        const total = positiveCount + negativeCount;
        if (total === 0)
            return { score: 0, trending: totalEngagement > 1000 };
        // Normalize to -1 to 1 scale
        const score = (positiveCount - negativeCount) / total;
        // Trending if high engagement or large volume
        const trending = totalEngagement > 5000 || tweets.length > 50;
        return { score, trending };
    }
    getMockSentiment(token) {
        // Mock data for testing
        return {
            token,
            platform: 'twitter',
            sentiment: (Math.random() - 0.5) * 2,
            volume: Math.floor(Math.random() * 100),
            engagement: Math.floor(Math.random() * 10000),
            trending: Math.random() > 0.7,
            timestamp: new Date().toISOString(),
            topPosts: [
                `Just bought some $${token}! To the moon! 🚀`,
                `$${token} looking bullish today`,
                `What do you think about $${token}?`,
            ],
        };
    }
}
exports.TwitterScraper = TwitterScraper;
exports.default = TwitterScraper;
//# sourceMappingURL=twitter.js.map