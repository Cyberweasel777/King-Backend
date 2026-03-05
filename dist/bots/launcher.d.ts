/**
 * Bot Launcher
 * Orchestrates all Telegram bots
 */
export declare function launchBots(): Promise<void>;
export declare const launchAllBots: typeof launchBots;
export declare function shutdownAllBots(): Promise<void>;
export declare function getBotStatus(): Record<string, boolean>;
//# sourceMappingURL=launcher.d.ts.map