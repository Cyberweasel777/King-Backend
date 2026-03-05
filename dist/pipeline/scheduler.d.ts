/**
 * Pipeline Scheduler - King Backend
 * Orchestrates all data ingestion pipelines
 */
/**
 * Manually trigger a pipeline
 */
export declare function triggerPipeline(appId: string): Promise<boolean>;
/**
 * Get pipeline statistics
 */
export declare function getPipelineStats(): Promise<Record<string, any>>;
declare function main(): Promise<void>;
export default main;
//# sourceMappingURL=scheduler.d.ts.map