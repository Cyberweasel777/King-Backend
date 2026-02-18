import { z } from 'zod';

export const RolloutPhaseSchema = z.enum(['P1', 'P2', 'P3', 'P4', 'P5']);
export type RolloutPhase = z.infer<typeof RolloutPhaseSchema>;

export const AppIdSchema = z.enum([
  'spreadhunter', 'deckvault', 'packpal', 'dropfarm', 'dropscout',
  'launchradar', 'memeradar', 'memestock', 'nftpulse', 'pointtrack',
  'rosterradar', 'skinsignal', 'socialindex', 'botindex', 'arbwatch',
]);
export type ShellAppId = z.infer<typeof AppIdSchema>;

export const EntitlementQuerySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});

export const TimelineQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
  limit: z.coerce.number().int().min(1).max(200).default(30),
});

export const SummaryQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
});

export interface FeatureFlagSnapshot {
  phase: RolloutPhase;
  features: {
    signalSummary: boolean;
    opportunityTimeline: boolean;
    entitlementStatus: boolean;
    pricingMetadata: boolean;
    dashboardStatusBlock: boolean;
  };
}
