"use strict";
/**
 * Supabase Configuration - King Backend
 * Shared database connection for all apps
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAnon = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = __importDefault(require("./logger"));
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
    logger_1.default.error('❌ Missing Supabase configuration');
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}
// Service role client (for server-side operations)
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
    },
});
// Anon client (for user-level operations)
exports.supabaseAnon = process.env.SUPABASE_ANON_KEY
    ? (0, supabase_js_1.createClient)(supabaseUrl, process.env.SUPABASE_ANON_KEY)
    : exports.supabase;
// Test connection
(async () => {
    try {
        await exports.supabase.from('users').select('count', { count: 'exact', head: true });
        logger_1.default.info('Supabase connected');
    }
    catch (err) {
        logger_1.default.error('Supabase connection failed:', err);
    }
})();
exports.default = exports.supabase;
//# sourceMappingURL=database.js.map