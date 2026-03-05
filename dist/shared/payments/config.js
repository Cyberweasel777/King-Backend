"use strict";
/**
 * Payment Module Configuration
 * Loads environment variables per app
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_TIER_CONFIGS = void 0;
exports.getStripeSecretKey = getStripeSecretKey;
exports.getStripeWebhookSecret = getStripeWebhookSecret;
exports.getStripePriceId = getStripePriceId;
exports.getMetaCapiAccessToken = getMetaCapiAccessToken;
exports.isStripeConfigured = isStripeConfigured;
exports.getAdminUserIds = getAdminUserIds;
exports.isAdmin = isAdmin;
exports.getDefaultTierConfig = getDefaultTierConfig;
exports.getTierConfig = getTierConfig;
exports.getAvailableTiers = getAvailableTiers;
// Map of app IDs to their environment variable prefixes
const APP_ENV_PREFIXES = {
    spreadhunter: 'SPREADHUNTER',
    deckvault: 'DECKVAULT',
    packpal: 'PACKPAL',
    dropfarm: 'DROPFARM',
    dropscout: 'DROPSCOUT',
    launchradar: 'LAUNCHRADAR',
    memeradar: 'MEMERADAR',
    memestock: 'MEMESTOCK',
    nftpulse: 'NFTPULSE',
    pointtrack: 'POINTTRACK',
    rosterradar: 'ROSTERRADAR',
    skinsignal: 'SKINSIGNAL',
    socialindex: 'SOCIALINDEX',
    botindex: 'BOTINDEX',
    arbwatch: 'ARBWATCH',
};
function getStripeSecretKey(appId) {
    const prefix = APP_ENV_PREFIXES[appId];
    return process.env[`${prefix}_STRIPE_SECRET_KEY`];
}
function getStripeWebhookSecret(appId) {
    const prefix = APP_ENV_PREFIXES[appId];
    return process.env[`${prefix}_STRIPE_WEBHOOK_SECRET`];
}
function getStripePriceId(appId, tier) {
    if (tier === 'free')
        return undefined;
    const prefix = APP_ENV_PREFIXES[appId];
    return process.env[`${prefix}_STRIPE_PRICE_${tier.toUpperCase()}`];
}
function getMetaCapiAccessToken(appId) {
    const prefix = APP_ENV_PREFIXES[appId];
    return process.env[`${prefix}_META_CAPI_ACCESS_TOKEN`];
}
function isStripeConfigured(appId) {
    return !!getStripeSecretKey(appId);
}
function getAdminUserIds() {
    const ids = process.env.PAYMENT_ADMIN_IDS || '';
    return ids.split(',').map(id => id.trim()).filter(Boolean);
}
function isAdmin(externalUserId) {
    return getAdminUserIds().includes(externalUserId);
}
// Default tier configurations (apps can override)
function getDefaultTierConfig(tier) {
    switch (tier) {
        case 'free':
            return {
                id: 'free',
                name: 'Free',
                price: 0,
                currency: 'usd',
                interval: 'month',
                features: ['Basic access', 'Limited requests'],
                limits: {
                    requestsPerDay: 10,
                    alertsPerDay: 3,
                    exportAllowed: false,
                    apiAccess: false,
                },
            };
        case 'starter':
            return {
                id: 'starter',
                name: 'Starter',
                price: 3900,
                currency: 'usd',
                interval: 'month',
                features: ['Expanded access', 'Standard alerts', 'Email support'],
                limits: {
                    requestsPerDay: 200,
                    alertsPerDay: 50,
                    exportAllowed: false,
                    apiAccess: false,
                },
            };
        case 'basic':
            return {
                id: 'basic',
                name: 'Basic',
                price: 999, // Legacy tier (kept for backward compatibility)
                currency: 'usd',
                interval: 'month',
                features: ['More requests', 'Email alerts', 'Standard support'],
                limits: {
                    requestsPerDay: 100,
                    alertsPerDay: 20,
                    exportAllowed: false,
                    apiAccess: false,
                },
            };
        case 'pro':
            return {
                id: 'pro',
                name: 'Pro',
                price: 2999, // $29.99
                currency: 'usd',
                interval: 'month',
                features: ['Unlimited requests', 'Priority alerts', 'Data export', 'API access', 'Priority support'],
                limits: {
                    requestsPerDay: Infinity,
                    alertsPerDay: Infinity,
                    exportAllowed: true,
                    apiAccess: true,
                },
            };
        case 'elite':
            return {
                id: 'elite',
                name: 'Elite',
                price: 39900,
                currency: 'usd',
                interval: 'month',
                features: ['Unlimited requests', 'Premium alerts', 'Data export', 'API access', 'Priority support'],
                limits: {
                    requestsPerDay: Infinity,
                    alertsPerDay: Infinity,
                    exportAllowed: true,
                    apiAccess: true,
                },
            };
        case 'enterprise':
            return {
                id: 'enterprise',
                name: 'Enterprise',
                price: 9999, // $99.99
                currency: 'usd',
                interval: 'month',
                features: ['Custom limits', 'Dedicated support', 'SLA', 'Custom integrations'],
                limits: {
                    requestsPerDay: Infinity,
                    alertsPerDay: Infinity,
                    exportAllowed: true,
                    apiAccess: true,
                },
            };
        default:
            return getDefaultTierConfig('free');
    }
}
// App-specific tier configs can be defined here
exports.APP_TIER_CONFIGS = {
    arbwatch: {
        free: {
            features: ['Market overview', 'Basic opportunities'],
            limits: {
                scanner: false,
                heatmap: false,
                premiumAlerts: false,
            },
        },
        starter: {
            id: 'starter',
            name: 'Starter',
            price: 3900,
            features: ['Expanded market coverage', 'Standard alerts'],
            limits: {
                scanner: false,
                heatmap: false,
                premiumAlerts: false,
            },
        },
        pro: {
            id: 'pro',
            name: 'Pro',
            price: 12900,
            features: ['Scanner access', 'Heatmap access', 'Premium alerts'],
            limits: {
                scanner: true,
                heatmap: true,
                premiumAlerts: true,
            },
        },
        elite: {
            id: 'elite',
            name: 'Elite',
            price: 39900,
            features: ['Scanner access', 'Heatmap access', 'Premium alerts', 'Priority support'],
            limits: {
                scanner: true,
                heatmap: true,
                premiumAlerts: true,
            },
        },
    },
};
function getTierConfig(appId, tier) {
    const defaults = getDefaultTierConfig(tier);
    const overrides = exports.APP_TIER_CONFIGS[appId]?.[tier] || {};
    const stripePriceId = getStripePriceId(appId, tier);
    return {
        ...defaults,
        ...overrides,
        id: tier,
        stripePriceId,
    };
}
function getAvailableTiers(appId) {
    const tiers = appId === 'arbwatch'
        ? ['free', 'starter', 'pro', 'elite']
        : ['free', 'basic', 'pro'];
    return tiers.map(tier => getTierConfig(appId, tier));
}
//# sourceMappingURL=config.js.map