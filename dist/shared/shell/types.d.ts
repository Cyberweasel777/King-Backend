import { z } from 'zod';
export declare const RolloutPhaseSchema: z.ZodEnum<["P1", "P2", "P3", "P4", "P5"]>;
export type RolloutPhase = z.infer<typeof RolloutPhaseSchema>;
export declare const AppIdSchema: z.ZodEnum<["spreadhunter", "deckvault", "packpal", "dropfarm", "dropscout", "launchradar", "memeradar", "memestock", "nftpulse", "pointtrack", "rosterradar", "skinsignal", "socialindex", "botindex", "arbwatch"]>;
export type ShellAppId = z.infer<typeof AppIdSchema>;
export declare const EntitlementQuerySchema: z.ZodObject<{
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    userId: string;
}, {
    userId: string;
}>;
export declare const TimelineQuerySchema: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    days: number;
}, {
    limit?: number | undefined;
    days?: number | undefined;
}>;
export declare const SummaryQuerySchema: z.ZodObject<{
    windowHours: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    windowHours: number;
}, {
    windowHours?: number | undefined;
}>;
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
//# sourceMappingURL=types.d.ts.map