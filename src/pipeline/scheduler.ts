/**
 * Pipeline Scheduler - King Backend
 * Orchestrates all data ingestion pipelines
 */

import { CronJob } from 'cron';
import { getPipelineApps } from '../config/apps';
import logger from '../config/logger';
import redis from '../config/redis';

// Store active jobs for management
const activeJobs: Map<string, CronJob> = new Map();

// ============================================================
// PIPELINE RUNNER
// ============================================================

/**
 * Run pipeline for a specific app
 */
async function runAppPipeline(appId: string): Promise<void> {
  const startTime = Date.now();
  
  logger.info(`🔄 Starting pipeline for ${appId}`, { app: appId });
  
  try {
    // Try to load and run app-specific pipeline
    let pipelineModule;
    try {
      pipelineModule = require(`../engines/${appId}`);
    } catch (error) {
      logger.warn(`⚠️  No pipeline engine found for ${appId}, skipping`);
      return;
    }
    
    if (!pipelineModule.runPipeline) {
      logger.warn(`⚠️  Pipeline for ${appId} missing runPipeline export`);
      return;
    }
    
    // Execute pipeline
    await pipelineModule.runPipeline();
    
    const duration = Date.now() - startTime;
    logger.info(`✅ Pipeline complete for ${appId} (${duration}ms)`, { 
      app: appId, 
      duration 
    });
    
    // Store metrics in Redis
    await redis.hset(`pipeline:stats:${appId}`, {
      lastRun: new Date().toISOString(),
      lastDuration: duration,
      status: 'success',
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`❌ Pipeline failed for ${appId} (${duration}ms):`, error);
    
    // Store error in Redis
    await redis.hset(`pipeline:stats:${appId}`, {
      lastRun: new Date().toISOString(),
      lastDuration: duration,
      status: 'error',
      error: (error as Error).message,
    });
  }
}

// ============================================================
// SCHEDULER
// ============================================================

/**
 * Schedule all enabled pipelines
 */
function schedulePipelines(): void {
  const apps = getPipelineApps();
  
  logger.info(`📅 Scheduling ${apps.length} pipelines`);
  
  for (const app of apps) {
    const job = new CronJob(
      app.pipeline.schedule,
      () => runAppPipeline(app.id),
      null, // onComplete
      true, // start immediately
      'America/New_York', // timezone
    );
    
    activeJobs.set(app.id, job);
    
    logger.info(`📌 Scheduled ${app.name}: ${app.pipeline.schedule}`, {
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
export async function triggerPipeline(appId: string): Promise<boolean> {
  const apps = getPipelineApps();
  const app = apps.find(a => a.id === appId);
  
  if (!app) {
    logger.error(`Cannot trigger pipeline: ${appId} not found or disabled`);
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
export async function getPipelineStats(): Promise<Record<string, any>> {
  const apps = getPipelineApps();
  const stats: Record<string, any> = {};
  
  for (const app of apps) {
    const appStats = await redis.hgetall(`pipeline:stats:${app.id}`);
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

async function main(): Promise<void> {
  logger.info('⏰ Pipeline Scheduler starting...');
  
  // Schedule all pipelines
  schedulePipelines();
  
  logger.info(`✅ Scheduler ready with ${activeJobs.size} jobs`);
  
  // Log next run times
  for (const [appId, job] of activeJobs) {
    logger.info(`Next run for ${appId}: ${job.nextDate().toISO()}`);
  }
  
  // Keep process alive
  setInterval(() => {
    // Heartbeat
  }, 60000);
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal: string): Promise<void> {
  logger.info(`📴 Received ${signal}, stopping pipelines...`);
  
  for (const [appId, job] of activeJobs) {
    job.stop();
    logger.info(`🛑 Stopped pipeline for ${appId}`);
  }
  
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start scheduler
main().catch((error) => {
  logger.error('Fatal error in scheduler:', error);
  process.exit(1);
});

export default main;
