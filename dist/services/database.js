"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabase = getSupabase;
exports.getTableName = getTableName;
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = require("../utils/logger");
// Shared Supabase client
let supabaseClient = null;
function getSupabase() {
    if (!supabaseClient) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase credentials not configured');
        }
        supabaseClient = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        logger_1.logger.info('Supabase client initialized');
    }
    return supabaseClient;
}
// Get table name with app prefix
function getTableName(appId, table) {
    return `${appId}_${table}`;
}
//# sourceMappingURL=database.js.map