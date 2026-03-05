"use strict";
/**
 * Pipeline Scheduler - King Backend
 * Orchestrates all data ingestion pipelines
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerPipeline = triggerPipeline;
exports.getPipelineStats = getPipelineStats;
const cron_1 = require("cron");
const apps_1 = require("../config/apps");
const logger_1 = __importDefault(require("../config/logger"));
const redis_1 = __importDefault(require("../config/redis"));
// Store active jobs for management
const activeJobs = new Map();
// ============================================================
// PIPELINE RUNNER
// ============================================================
/**
 * Run pipeline for a specific app
 */
async function runAppPipeline(appId) {
    const startTime = Date.now();
    logger_1.default.info(`🔄 Starting pipeline for ${appId}`, { app: appId });
    try {
        // Try to load and run app-specific pipeline
        let pipelineModule;
        try {
            pipelineModule = require(`../engines/${appId}`);
        }
        catch (error) {
            logger_1.default.warn(`⚠️  No pipeline engine found for ${appId}, skipping`);
            return;
        }
        if (!pipelineModule.runPipeline) {
            logger_1.default.warn(`⚠️  Pipeline for ${appId} missing runPipeline export`);
            return;
        }
        // Execute pipeline
        await pipelineModule.runPipeline();
        const duration = Date.now() - startTime;
        logger_1.default.info(`✅ Pipeline complete for ${appId} (${duration}ms)`, {
            app: appId,
            duration
        });
        // Store metrics in Redis
        await redis_1.default.hset(`pipeline:stats:${appId}`, {
            lastRun: new Date().toISOString(),
            lastDuration: duration,
            status: 'success',
        });
    }
    catch (error) {
        const duration = Date.now() - startTime;
        logger_1.default.error(`❌ Pipeline failed for ${appId} (${duration}ms):`, error);
        // Store error in Redis
        await redis_1.default.hset(`pipeline:stats:${appId}`, {
            lastRun: new Date().toISOString(),
            lastDuration: duration,
            status: 'error',
            error: error.message,
        });
    }
}
// ============================================================
// SCHEDULER
// ============================================================
/**
 * Schedule all enabled pipelines
 */
function schedulePipelines() {
    const apps = (0, apps_1.getPipelineApps)();
    logger_1.default.info(`📅 Scheduling ${apps.length} pipelines`);
    for (const app of apps) {
        const job = new cron_1.CronJob(app.pipeline.schedule, () => runAppPipeline(app.id), null, // onComplete
        true, // start immediately
        'America/New_York');
        activeJobs.set(app.id, job);
        logger_1.default.info(`📌 Scheduled ${app.name}: ${app.pipeline.schedule}`, {
            app: app.id,
            schedule: app.pipeline.schedule,
            nextRun: job.nextDate().toISO(),
        });
    }
}
// ============================================================
// MANUAL TRIGGER
// ============================================================
/**
 * Manually trigger a pipeline
 */
async function triggerPipeline(appId) {
    const apps = (0, apps_1.getPipelineApps)();
    const app = apps.find(a => a.id === appId);
    if (!app) {
        logger_1.default.error(`Cannot trigger pipeline: ${appId} not found or disabled`);
        return false;
    }
    // Run immediately
    runAppPipeline(appId);
    return true;
}
// ============================================================
// STATS
// ============================================================
/**
 * Get pipeline statistics
 */
async function getPipelineStats() {
    const apps = (0, apps_1.getPipelineApps)();
    const stats = {};
    for (const app of apps) {
        const appStats = await redis_1.default.hgetall(`pipeline:stats:${app.id}`);
        stats[app.id] = {
            name: app.name,
            schedule: app.pipeline.schedule,
            ...appStats,
        };
    }
    return stats;
}
// ============================================================
// MAIN
// ============================================================
async function main() {
    logger_1.default.info('⏰ Pipeline Scheduler starting...');
    // Schedule all pipelines
    schedulePipelines();
    logger_1.default.info(`✅ Scheduler ready with ${activeJobs.size} jobs`);
    // Log next run times
    for (const [appId, job] of activeJobs) {
        logger_1.default.info(`Next run for ${appId}: ${job.nextDate().toISO()}`);
    }
    // Keep process alive
    setInterval(() => {
        // Heartbeat
    }, 60000);
}
// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
async function shutdown(signal) {
    logger_1.default.info(`📴 Received ${signal}, stopping pipelines...`);
    for (const [appId, job] of activeJobs) {
        job.stop();
        logger_1.default.info(`🛑 Stopped pipeline for ${appId}`);
    }
    await redis_1.default.quit();
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Start scheduler
main().catch((error) => {
    logger_1.default.error('Fatal error in scheduler:', error);
    process.exit(1);
});
exports.default = main;
//# sourceMappingURL=scheduler.js.map