/**
 * App Registry
 * Configuration for all canary apps
 */

export interface AppConfig {
  id: string;
  name: string;
  enabled: boolean;
  api: {
    prefix: string;
    rateLimit: string;
  };
  bot: {
    telegram: {
      enabled: boolean;
      tokenEnv: string;
    };
  };
  pipeline: {
    enabled: boolean;
    schedule: string;
  };
}

export const apps: AppConfig[] = [
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
      schedule: '*/5 * * * *'  // Every 5 minutes
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
      schedule: '*/2 * * * *'  // Every 2 minutes (faster for arb)
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
      schedule: '*/5 * * * *'  // Every 5 minutes (respects Steam rate limits)
    }
  }
];

export function getEnabledApps(): AppConfig[] {
  return apps.filter(app => app.enabled);
}

export function getPipelineApps(): AppConfig[] {
  return apps.filter(app => app.enabled && app.pipeline.enabled);
}

export function getWorkerApps(): (AppConfig & { worker: { queues: string[] } })[] {
  return getEnabledApps().map(app => ({
    ...app,
    worker: { queues: ['alerts', 'notifications'] },
  }));
}

export function getDbPrefix(appId: string): string {
  return `${appId}_`;
}
