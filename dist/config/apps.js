"use strict";
/**
 * App Registry
 * Configuration for all canary apps
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apps = void 0;
exports.getEnabledApps = getEnabledApps;
exports.getPipelineApps = getPipelineApps;
exports.getWorkerApps = getWorkerApps;
exports.getDbPrefix = getDbPrefix;
exports.apps = [
    {
        id: 'botindex',
        name: 'BotIndex',
        enabled: true,
        api: {
            prefix: '/api/botindex',
            rateLimit: '100/min'
        },
        bot: {
            telegram: {
                enabled: true,
                tokenEnv: 'BOTINDEX_BOT_TOKEN'
            }
        },
        pipeline: {
            enabled: true,
            schedule: '*/5 * * * *' // Every 5 minutes
        }
    },
    {
        id: 'memeradar',
        name: 'MemeRadar',
        enabled: true,
        api: {
            prefix: '/api/memeradar',
            rateLimit: '100/min'
        },
        bot: {
            telegram: {
                enabled: true,
                tokenEnv: 'MEMERADAR_BOT_TOKEN'
            }
        },
        pipeline: {
            enabled: true,
            schedule: '*/5 * * * *'
        }
    },
    {
        id: 'arbwatch',
        name: 'ArbWatch',
        enabled: true,
        api: {
            prefix: '/api/arbwatch',
            rateLimit: '100/min'
        },
        bot: {
            telegram: {
                enabled: true,
                tokenEnv: 'ARBWATCH_BOT_TOKEN'
            }
        },
        pipeline: {
            enabled: true,
            schedule: '*/2 * * * *' // Every 2 minutes (faster for arb)
        }
    },
    {
        id: 'skinsignal',
        name: 'SkinSignal',
        enabled: true,
        api: {
            prefix: '/api/skinsignal',
            rateLimit: '60/min'
        },
        bot: {
            telegram: {
                enabled: true,
                tokenEnv: 'SKINSIGNAL_BOT_TOKEN'
            }
        },
        pipeline: {
            enabled: true,
            schedule: '*/5 * * * *' // Every 5 minutes (respects Steam rate limits)
        }
    }
];
function getEnabledApps() {
    return exports.apps.filter(app => app.enabled);
}
function getPipelineApps() {
    return exports.apps.filter(app => app.enabled && app.pipeline.enabled);
}
function getWorkerApps() {
    return getEnabledApps().map(app => ({
        ...app,
        worker: { queues: ['alerts', 'notifications'] },
    }));
}
function getDbPrefix(appId) {
    return `${appId}_`;
}
//# sourceMappingURL=apps.js.map