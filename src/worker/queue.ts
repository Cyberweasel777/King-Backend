/**
 * Worker Queue - King Backend
 * Background job processing with BullMQ
 */

import { Worker, Queue } from 'bullmq';
import { getWorkerApps } from '../config/apps';
import logger from '../config/logger';
import redis from '../config/redis';

// Store active workers
const activeWorkers: Worker[] = [];
const activeQueues: Map<string, Queue> = new Map();

// ============================================================
// JOB PROCESSORS
// ============================================================

/**
 * Get processor function for a queue
 */
function getProcessor(appId: string, queueName: string): Function {
  // Try to load app-specific processor
  try {
    const processor = require(`../processors/${appId}/${queueName}`);
    if (processor.default) return processor.default;
    if (processor.process) return processor.process;
  } catch {
    // No specific processor, use generic
  }
  
  // Generic processor
  return async (job: any) => {
    logger.info(`Processing job ${job.id} from ${appId}:${queueName}`, {
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
function createAppWorkers(app: any): Worker[] {
  const workers: Worker[] = [];
  
  for (const queueName of app.worker.queues) {
    const fullQueueName = `${app.id}:${queueName}`;
    
    // Create queue
    const queue = new Queue(fullQueueName, { connection: redis });
    activeQueues.set(fullQueueName, queue);
    
    // Create worker
    const processor = getProcessor(app.id, queueName);
    
    const worker = new Worker(
      fullQueueName,
      async (job) => {
        logger.debug(`Processing ${fullQueueName}:${job.id}`, {
          app: app.id,
          queue: queueName,
          jobId: job.id,
        });
        
        return processor(job);
      },
      {
        connection: redis,
        concurrency: 5,
      }
    );
    
    // Event handlers
    worker.on('completed', (job) => {
      logger.debug(`Job completed: ${fullQueueName}:${job.id}`);
    });
    
    worker.on('failed', (job, err) => {
      logger.error(`Job failed: ${fullQueueName}:${job?.id}`, err);
    });
    
    workers.push(worker);
    logger.info(`👷 Created worker for ${fullQueueName}`);
  }
  
  return workers;
}

// ============================================================
// QUEUE OPERATIONS
// ============================================================

/**
 * Add job to queue
 */
export async function addJob(
  appId: string,
  queueName: string,
  data: any,
  opts: any = {}
): Promise<any> {
  const fullQueueName = `${appId}:${queueName}`;
  let queue = activeQueues.get(fullQueueName);
  
  if (!queue) {
    queue = new Queue(fullQueueName, { connection: redis });
    activeQueues.set(fullQueueName, queue);
  }
  
  return queue.add(fullQueueName, data, opts);
}

/**
 * Get queue stats
 */
export async function getQueueStats(): Promise<Record<string, any>> {
  const stats: Record<string, any> = {};
  
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

async function main(): Promise<void> {
  logger.info('👷 Worker Queue starting...');
  
  const apps = getWorkerApps();
  logger.info(`Found ${apps.length} apps with workers enabled`);
  
  for (const app of apps) {
    const workers = createAppWorkers(app);
    activeWorkers.push(...workers);
  }
  
  logger.info(`✅ Worker ready with ${activeWorkers.length} workers`);
  
  // Periodic stats logging
  setInterval(async () => {
    const stats = await getQueueStats();
    const totalJobs = Object.values(stats).reduce(
      (sum: number, s: any) => sum + s.waiting + s.active, 
      0
    );
    
    if (totalJobs > 0) {
      logger.debug('Queue stats:', stats);
    }
  }, 30000);
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal: string): Promise<void> {
  logger.info(`📴 Received ${signal}, closing workers...`);
  
  await Promise.all(activeWorkers.map(w => w.close()));
  await Promise.all(Array.from(activeQueues.values()).map(q => q.close()));
  await redis.quit();
  
  logger.info('👋 All workers closed');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start workers
main().catch((error) => {
  logger.error('Fatal error in worker:', error);
  process.exit(1);
});

export default main;
