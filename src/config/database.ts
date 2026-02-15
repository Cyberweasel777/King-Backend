/**
 * Supabase Configuration - King Backend
 * Shared database connection for all apps
 */

import { createClient } from '@supabase/supabase-js';
import logger from './logger';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.error('❌ Missing Supabase configuration');
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

// Service role client (for server-side operations)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});

// Anon client (for user-level operations)
export const supabaseAnon = process.env.SUPABASE_ANON_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY)
  : supabase;

// Test connection
(async () => {
  try {
    await supabase.from('users').select('count', { count: 'exact', head: true });
    logger.info('Supabase connected');
  } catch (err) {
    logger.error('Supabase connection failed:', err);
  }
})();

export default supabase;
