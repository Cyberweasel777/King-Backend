"use strict";
/**
 * MemeRadar Alert Processor
 * Processes alert jobs from the queue
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = processAlertJob;
const database_1 = __importDefault(require("../../../config/database"));
const logger_1 = __importDefault(require("../../../config/logger"));
const TABLE_PREFIX = 'memeradar_';
/**
 * Process alert job
 */
async function processAlertJob(job) {
    const { type, data } = job;
    logger_1.default.info(`Processing alert job: ${type}`, { jobId: job.id, type, data });
    switch (type) {
        case 'opportunity':
            return await handleOpportunityAlert(data);
        case 'price_target':
            return await handlePriceTargetAlert(data);
        case 'whale_movement':
            return await handleWhaleAlert(data);
        default:
            logger_1.default.warn(`Unknown alert type: ${type}`);
            return { processed: false, reason: 'unknown_type' };
    }
}
/**
 * Handle opportunity alert
 */
async function handleOpportunityAlert(data) {
    const { token, address, signal, confidence } = data;
    // Find users tracking this token or with relevant alerts
    const { data: users } = await database_1.default
        .from(`${TABLE_PREFIX}tracked`)
        .select('user_id')
        .eq('token_symbol', token);
    if (!users || users.length === 0) {
        return { sent: 0, reason: 'no_subscribers' };
    }
    // Send notifications (Telegram bot would handle this)
    const notifications = users.map(u => ({
        user_id: u.user_id,
        type: 'opportunity',
        message: `🚨 ${token} showing ${signal} signal (confidence: ${(confidence * 100).toFixed(0)}%)`,
        created_at: new Date().toISOString(),
    }));
    await database_1.default.from(`${TABLE_PREFIX}notifications`).insert(notifications);
    logger_1.default.info(`Queued ${notifications.length} opportunity alerts for ${token}`);
    return {
        sent: notifications.length,
        token,
        signal,
    };
}
/**
 * Handle price target alert
 */
async function handlePriceTargetAlert(data) {
    const { alert_id, token, price, target_price } = data;
    // Mark alert as triggered
    await database_1.default
        .from(`${TABLE_PREFIX}alerts`)
        .update({
        triggered: true,
        triggered_at: new Date().toISOString()
    })
        .eq('id', alert_id);
    return {
        processed: true,
        alert_id,
        message: `${token} reached $${target_price}!`,
    };
}
/**
 * Handle whale movement alert
 */
async function handleWhaleAlert(data) {
    const { wallet, token, amount, type } = data;
    // Only alert on significant movements
    if (amount < 10000) {
        return { processed: false, reason: 'below_threshold' };
    }
    // Find users interested in this token
    const { data: users } = await database_1.default
        .from(`${TABLE_PREFIX}tracked`)
        .select('user_id')
        .eq('token_symbol', token);
    if (!users || users.length === 0) {
        return { processed: false, reason: 'no_subscribers' };
    }
    const emoji = type === 'buy' ? '🟢' : '🔴';
    const action = type === 'buy' ? 'bought' : 'sold';
    const notifications = users.map(u => ({
        user_id: u.user_id,
        type: 'whale',
        message: `${emoji} Whale ${action} $${amount.toLocaleString()} of ${token}`,
        created_at: new Date().toISOString(),
    }));
    await database_1.default.from(`${TABLE_PREFIX}notifications`).insert(notifications);
    return { sent: notifications.length, token, type };
}
//# sourceMappingURL=alerts.js.map