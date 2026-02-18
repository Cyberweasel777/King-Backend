import { FeatureFlagSnapshot, RolloutPhase, RolloutPhaseSchema } from './types';

const phaseDefaults: Record<RolloutPhase, FeatureFlagSnapshot['features']> = {
  P1: {
    signalSummary: true,
    opportunityTimeline: false,
    entitlementStatus: false,
    pricingMetadata: false,
    dashboardStatusBlock: false,
  },
  P2: {
    signalSummary: true,
    opportunityTimeline: true,
    entitlementStatus: false,
    pricingMetadata: false,
    dashboardStatusBlock: false,
  },
  P3: {
    signalSummary: true,
    opportunityTimeline: true,
    entitlementStatus: true,
    pricingMetadata: false,
    dashboardStatusBlock: false,
  },
  P4: {
    signalSummary: true,
    opportunityTimeline: true,
    entitlementStatus: true,
    pricingMetadata: true,
    dashboardStatusBlock: false,
  },
  P5: {
    signalSummary: true,
    opportunityTimeline: true,
    entitlementStatus: true,
    pricingMetadata: true,
    dashboardStatusBlock: true,
  },
};

function parsePhase(raw: string | undefined): RolloutPhase {
  const parsed = RolloutPhaseSchema.safeParse(raw ?? 'P1');
  return parsed.success ? parsed.data : 'P1';
}

function parseOverrides(raw: string | undefined): Partial<FeatureFlagSnapshot['features']> {
  if (!raw) return {};

  return raw.split(',').reduce((acc, pair) => {
    const [k, v] = pair.split('=').map(x => x?.trim());
    if (!k || typeof v === 'undefined') return acc;
    if (!(k in phaseDefaults.P5)) return acc;
    (acc as any)[k] = v === '1' || v.toLowerCase() === 'true';
    return acc;
  }, {} as Partial<FeatureFlagSnapshot['features']>);
}

export function getShellFeatureFlags(): FeatureFlagSnapshot {
  const phase = parsePhase(process.env.SHELL_ROLLOUT_PHASE);
  const defaults = phaseDefaults[phase];
  const overrides = parseOverrides(process.env.SHELL_FEATURE_OVERRIDES);

  return {
    phase,
    features: {
      ...defaults,
      ...overrides,
    },
  };
}

export function assertFeatureEnabled(
  feature: keyof FeatureFlagSnapshot['features']
): { enabled: true; snapshot: FeatureFlagSnapshot } | { enabled: false; snapshot: FeatureFlagSnapshot } {
  const snapshot = getShellFeatureFlags();
  return snapshot.features[feature]
    ? { enabled: true, snapshot }
    : { enabled: false, snapshot };
}
