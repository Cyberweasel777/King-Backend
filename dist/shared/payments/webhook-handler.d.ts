/**
 * Stripe Webhook Handler
 * Processes Stripe events and updates subscriptions
 */
import Stripe from 'stripe';
import { AppId } from './types';
/**
 * Verify and parse Stripe webhook payload
 */
export declare function verifyWebhookPayload(appId: AppId, payload: string | Buffer, signature: string): Stripe.Event | null;
/**
 * Handle Stripe webhook event
 */
export declare function handleWebhookEvent(appId: AppId, event: Stripe.Event): Promise<{
    processed: boolean;
    message: string;
}>;
//# sourceMappingURL=webhook-handler.d.ts.map