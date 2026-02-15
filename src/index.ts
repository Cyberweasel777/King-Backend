/**
 * Process Group Router - King Backend
 * Entry point that routes to the correct process group based on environment
 */

import logger from './config/logger';

const processGroup = process.env.FLY_PROCESS_GROUP || 'api';

logger.info(`🚀 King Backend starting - Process Group: ${processGroup}`);

switch (processGroup) {
  case 'api':
    import('./api/server');
    break;
    
  case 'bots':
    import('./bots/launcher');
    break;
    
  case 'pipeline':
    import('./pipeline/scheduler');
    break;
    
  case 'worker':
    import('./worker/queue');
    break;
    
  default:
    logger.error(`Unknown process group: ${processGroup}`);
    process.exit(1);
}
