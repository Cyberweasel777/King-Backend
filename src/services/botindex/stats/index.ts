/** BotIndex DeepSeek Stats - Index */

export {
  analyzer,
  localCorrelation,
  localPCA,
  localRegime,
  localGranger,
  localVolatility,
  localCorrelationMatrix,
} from './analyzer';

export { callDeepSeek, checkApiHealth, stripMarkdownFences, parseJsonResponse } from './deepseek-client';

export { statsCache, StatsCache } from './cache';

export { getPrompt, SYSTEM_PROMPTS } from './prompts';

export type { PromptType } from './prompts';

export {
  CorrelationInput,
  CorrelationResult,
  PCAInput,
  PCAResult,
  RegimeInput,
  RegimeResult,
  GrangerInput,
  GrangerResult,
  VolatilityInput,
  VolatilityResult,
  CorrelationMatrixInput,
  CorrelationMatrixResult,
  AnalysisType,
  StatsRequest,
  StatsResponse,
  clamp,
  clampCorrelation,
  clampProbability,
  VALIDATION_RANGES,
} from './types';
