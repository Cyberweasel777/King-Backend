/**
 * PostHog Product Analytics — tracks user behavior, not just pageviews.
 * Free tier: 1M events/mo.
 */

import { PostHog } from 'posthog-node';
import logger from './logger';

let client: PostHog | null = null;

export function initPostHog(): void {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) {
    logger.warn('No POSTHOG_API_KEY — product analytics disabled');
    return;
  }

  client = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 20,
    flushInterval: 10000,
  });

  logger.info('PostHog product analytics initialized');
}

export function trackEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!client) return;
  client.capture({
    distinctId,
    event,
    properties,
  });
}

export function identifyUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!client) return;
  client.identify({
    distinctId,
    properties,
  });
}

export async function shutdownPostHog(): Promise<void> {
  if (client) {
    await client.shutdown();
  }
}
