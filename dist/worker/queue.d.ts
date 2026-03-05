/**
 * Worker Queue - King Backend
 * Background job processing with BullMQ
 */
/**
 * Add job to queue
 */
export declare function addJob(appId: string, queueName: string, data: any, opts?: any): Promise<any>;
/**
 * Get queue stats
 */
export declare function getQueueStats(): Promise<Record<string, any>>;
declare function main(): Promise<void>;
export default main;
//# sourceMappingURL=queue.d.ts.map