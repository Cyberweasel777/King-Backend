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
export declare const apps: AppConfig[];
export declare function getEnabledApps(): AppConfig[];
export declare function getPipelineApps(): AppConfig[];
export declare function getWorkerApps(): (AppConfig & {
    worker: {
        queues: string[];
    };
})[];
export declare function getDbPrefix(appId: string): string;
//# sourceMappingURL=apps.d.ts.map