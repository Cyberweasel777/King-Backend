"use strict";
/**
 * Worker Queue - King Backend
 * Background job processing with BullMQ
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addJob = addJob;
exports.getQueueStats = getQueueStats;
const bullmq_1 = require("bullmq");
const apps_1 = require("../config/apps");
const logger_1 = __importDefault(require("../config/logger"));
const redis_1 = __importDefault(require("../config/redis"));
// Store active workers
const activeWorkers = [];
const activeQueues = new Map();
// ============================================================
// JOB PROCESSORS
// ============================================================
/**
 * Get processor function for a queue
 */
function getProcessor(appId, queueName) {
    // Try to load app-specific processor
    try {
        const processor = require(`../processors/${appId}/${queueName}`);
        if (processor.default)
            return processor.default;
        if (processor.process)
            return processor.process;
    }
    catch {
        // No specific processor, use generic
    }
    // Generic processor
    return async (job) => {
        logger_1.default.info(`Processing job ${job.id} from ${appId}:${queueName}`, {
            app: appId,
            queue: queueName,
            jobId: job.id,
            data: job.data,
        });
        // Default: just log and succeed
        return { processed: true, timestamp: new Date().toISOString() };
    };
}
// ============================================================
// WORKER CREATION
// ============================================================
/**
 * Create workers for an app
 */
function createAppWorkers(app) {
    const workers = [];
    for (const queueName of app.worker.queues) {
        const fullQueueName = `${app.id}:${queueName}`;
        // Create queue
        const queue = new bullmq_1.Queue(fullQueueName, { connection: redis_1.default });
        activeQueues.set(fullQueueName, queue);
        // Create worker
        const processor = getProcessor(app.id, queueName);
        const worker = new bullmq_1.Worker(fullQueueName, async (job) => {
            logger_1.default.debug(`Processing ${fullQueueName}:${job.id}`, {
                app: app.id,
                queue: queueName,
                jobId: job.id,
            });
            return processor(job);
        }, {
            connection: redis_1.default,
            concurrency: 5,
        });
        // Event handlers
        worker.on('completed', (job) => {
            logger_1.default.debug(`Job completed: ${fullQueueName}:${job.id}`);
        });
        worker.on('failed', (job, err) => {
            logger_1.default.error(`Job failed: ${fullQueueName}:${job?.id}`, err);
        });
        workers.push(worker);
        logger_1.default.info(`👷 Created worker for ${fullQueueName}`);
    }
    return workers;
}
// ============================================================
// QUEUE OPERATIONS
// ============================================================
/**
 * Add job to queue
 */
async function addJob(appId, queueName, data, opts = {}) {
    const fullQueueName = `${appId}:${queueName}`;
    let queue = activeQueues.get(fullQueueName);
    if (!queue) {
        queue = new bullmq_1.Queue(fullQueueName, { connection: redis_1.default });
        activeQueues.set(fullQueueName, queue);
    }
    return queue.add(fullQueueName, data, opts);
}
/**
 * Get queue stats
 */
async function getQueueStats() {
    const stats = {};
    for (const [name, queue] of activeQueues) {
        const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
        ]);
        stats[name] = { waiting, active, completed, failed };
    }
    return stats;
}
// ============================================================
// MAIN
// ============================================================
async function main() {
    logger_1.default.info('👷 Worker Queue starting...');
    const apps = (0, apps_1.getWorkerApps)();
    logger_1.default.info(`Found ${apps.length} apps with workers enabled`);
    for (const app of apps) {
        const workers = createAppWorkers(app);
        activeWorkers.push(...workers);
    }
    logger_1.default.info(`✅ Worker ready with ${activeWorkers.length} workers`);
    // Periodic stats logging
    setInterval(async () => {
        const stats = await getQueueStats();
        const totalJobs = Object.values(stats).reduce((sum, s) => sum + s.waiting + s.active, 0);
        if (totalJobs > 0) {
            logger_1.default.debug('Queue stats:', stats);
        }
    }, 30000);
}
// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
async function shutdown(signal) {
    logger_1.default.info(`📴 Received ${signal}, closing workers...`);
    await Promise.all(activeWorkers.map(w => w.close()));
    await Promise.all(Array.from(activeQueues.values()).map(q => q.close()));
    await redis_1.default.quit();
    logger_1.default.info('👋 All workers closed');
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Start workers
main().catch((error) => {
    logger_1.default.error('Fatal error in worker:', error);
    process.exit(1);
});
exports.default = main;
//# sourceMappingURL=queue.js.map