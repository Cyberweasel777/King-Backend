import { Telegraf } from 'telegraf';
export type ChatId = number;
export declare class MemeRadarScheduler {
    private bot;
    private subscribers;
    private scoreHistory;
    private started;
    private alertCooldownMs;
    private alertLastSentAt;
    private maxAlertMessagesPerPoll;
    private pollIntervalId?;
    private digestIntervalId?;
    constructor(bot: Telegraf);
    subscribe(chatId: ChatId): void;
    unsubscribe(chatId: ChatId): void;
    start(): void;
    stop(): void;
    private pollAndPushAlerts;
    private pushDailyDigest;
}
//# sourceMappingURL=scheduler.d.ts.map