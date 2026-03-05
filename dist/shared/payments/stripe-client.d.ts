/**
 * Stripe Client
 * Creates checkout sessions and manages Stripe API
 */
import Stripe from 'stripe';
import { AppId, CheckoutSessionRequest, CheckoutSessionResponse, PortalSessionRequest } from './types';
/**
 * Get Stripe client for an app
 */
export declare function getStripeClient(appId: AppId): Stripe | null;
/**
 * Create a checkout session for subscription
 */
export declare function createCheckoutSession(appId: AppId, request: CheckoutSessionRequest): Promise<CheckoutSessionResponse>;
/**
 * Create customer portal session
 */
export declare function createPortalSession(appId: AppId, request: PortalSessionRequest): Promise<string>;
/**
 * Get subscription details from Stripe
 */
export declare function getStripeSubscription(appId: AppId, subscriptionId: string): Promise<Stripe.Subscription | null>;
/**
 * Cancel subscription in Stripe
 */
export declare function cancelStripeSubscription(appId: AppId, subscriptionId: string): Promise<boolean>;
//# sourceMappingURL=stripe-client.d.ts.map