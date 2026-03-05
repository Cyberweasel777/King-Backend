import { FeatureFlagSnapshot } from './types';
export declare function getShellFeatureFlags(): FeatureFlagSnapshot;
export declare function assertFeatureEnabled(feature: keyof FeatureFlagSnapshot['features']): {
    enabled: true;
    snapshot: FeatureFlagSnapshot;
} | {
    enabled: false;
    snapshot: FeatureFlagSnapshot;
};
//# sourceMappingURL=feature-flags.d.ts.map