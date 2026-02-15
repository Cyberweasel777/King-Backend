/**
 * Environment Configuration - King Backend
 * Validates required environment variables
 */

import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import logger from './logger';

const envSchema = z.object({
  // Required
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  
  // Optional with defaults
  SUPABASE_ANON_KEY: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_PORT: z.string().default('8080'),
  API_HOST: z.string().default('0.0.0.0'),
  WEBHOOK_PORT: z.string().default('3000'),
  
  // Bot tokens (at least one required for bots process)
  SPREADHUNTER_BOT_TOKEN: z.string().optional(),
  DECKVAULT_BOT_TOKEN: z.string().optional(),
  PACKPAL_BOT_TOKEN: z.string().optional(),
  DROPSCOUT_BOT_TOKEN: z.string().optional(),
  SKINSIGNAL_BOT_TOKEN: z.string().optional(),
  MEMERADAR_BOT_TOKEN: z.string().optional(),
  ROSTERRADAR_BOT_TOKEN: z.string().optional(),
  ARBWATCH_BOT_TOKEN: z.string().optional(),
  NFTPULSE_BOT_TOKEN: z.string().optional(),
  DROPFARM_BOT_TOKEN: z.string().optional(),
  LAUNCHRADAR_BOT_TOKEN: z.string().optional(),
  SOCIALINDEX_BOT_TOKEN: z.string().optional(),
  MEMESTOCK_BOT_TOKEN: z.string().optional(),
  POINTTRACK_BOT_TOKEN: z.string().optional(),
  BOTINDEX_BOT_TOKEN: z.string().optional(),
  
  // Discord tokens
  MEMERADAR_DISCORD_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const error = fromZodError(result.error);
    logger.error('❌ Environment validation failed:', error.message);
    throw new Error(`Invalid environment: ${error.message}`);
  }
  
  return result.data;
}

export const env = validateEnv();
export default env;
