/**
 * Meta Conversions API (CAPI) Integration
 * Sends server-side events to Facebook for ad attribution
 * Optional - only sends if access token configured
 */

import crypto from 'crypto';
import { AppId } from './types';
import { getMetaCapiAccessToken } from './config';

interface CapiEvent {
  eventName: string;
  externalUserId: string;
  email?: string;
  value?: number;
  currency?: string;
  eventId?: string;
}

/**
 * Send event to Meta CAPI
 */
export async function sendMetaCapiEvent(
  appId: AppId,
  event: CapiEvent
): Promise<boolean> {
  const accessToken = getMetaCapiAccessToken(appId);
  
  if (!accessToken) {
    // CAPI not configured for this app, skip silently
    return false;
  }

  const pixelId = extractPixelId(accessToken);
  if (!pixelId) {
    console.error(`Invalid Meta CAPI token for ${appId}`);
    return false;
  }

  const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`;

  // Hash PII for privacy
  const hashedEmail = event.email ? hashSha256(event.email.toLowerCase().trim()) : undefined;
  const hashedExternalId = hashSha256(event.externalUserId);

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.eventId || `${event.externalUserId}_${Date.now()}`,
        user_data: {
          em: hashedEmail,
          external_id: hashedExternalId,
        },
        custom_data: event.value !== undefined ? {
          value: event.value / 100, // Convert cents to dollars
          currency: event.currency?.toUpperCase() || 'USD',
        } : undefined,
        action_source: 'website',
      },
    ],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Meta CAPI error for ${appId}:`, error);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Failed to send Meta CAPI event for ${appId}:`, err);
    return false;
  }
}

/**
 * Hash string using SHA-256
 */
function hashSha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Extract pixel ID from access token (first part before '|')
 */
function extractPixelId(accessToken: string): string | null {
  const parts = accessToken.split('|');
  return parts.length >= 2 ? parts[0] : null;
}
