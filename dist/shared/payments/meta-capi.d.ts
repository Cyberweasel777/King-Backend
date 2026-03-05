/**
 * Meta Conversions API (CAPI) Integration
 * Sends server-side events to Facebook for ad attribution
 * Optional - only sends if access token configured
 */
import { AppId } from './types';
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
export declare function sendMetaCapiEvent(appId: AppId, event: CapiEvent): Promise<boolean>;
export {};
//# sourceMappingURL=meta-capi.d.ts.map