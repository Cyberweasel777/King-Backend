"use strict";
/**
 * Environment Configuration - King Backend
 * Validates required environment variables
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const zod_validation_error_1 = require("zod-validation-error");
const logger_1 = __importDefault(require("./logger"));
const envSchema = zod_1.z.object({
    // Required
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    CONVEX_URL: zod_1.z.string().url(),
    CONVEX_ADMIN_KEY: zod_1.z.string().min(1),
    // Optional with defaults
    SUPABASE_URL: zod_1.z.string().url().optional(),
    SUPABASE_SERVICE_KEY: zod_1.z.string().min(1).optional(),
    SUPABASE_ANON_KEY: zod_1.z.string().optional(),
    REDIS_URL: zod_1.z.string().url().optional(),
    LOG_LEVEL: zod_1.z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    API_PORT: zod_1.z.string().default('8080'),
    API_HOST: zod_1.z.string().default('0.0.0.0'),
    WEBHOOK_PORT: zod_1.z.string().default('3000'),
    // Bot tokens (at least one required for bots process)
    SPREADHUNTER_BOT_TOKEN: zod_1.z.string().optional(),
    DECKVAULT_BOT_TOKEN: zod_1.z.string().optional(),
    PACKPAL_BOT_TOKEN: zod_1.z.string().optional(),
    DROPSCOUT_BOT_TOKEN: zod_1.z.string().optional(),
    SKINSIGNAL_BOT_TOKEN: zod_1.z.string().optional(),
    MEMERADAR_BOT_TOKEN: zod_1.z.string().optional(),
    ROSTERRADAR_BOT_TOKEN: zod_1.z.string().optional(),
    ARBWATCH_BOT_TOKEN: zod_1.z.string().optional(),
    NFTPULSE_BOT_TOKEN: zod_1.z.string().optional(),
    DROPFARM_BOT_TOKEN: zod_1.z.string().optional(),
    LAUNCHRADAR_BOT_TOKEN: zod_1.z.string().optional(),
    SOCIALINDEX_BOT_TOKEN: zod_1.z.string().optional(),
    MEMESTOCK_BOT_TOKEN: zod_1.z.string().optional(),
    POINTTRACK_BOT_TOKEN: zod_1.z.string().optional(),
    BOTINDEX_BOT_TOKEN: zod_1.z.string().optional(),
    // Discord tokens
    MEMERADAR_DISCORD_TOKEN: zod_1.z.string().optional(),
});
function validateEnv() {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        const error = (0, zod_validation_error_1.fromZodError)(result.error);
        logger_1.default.error('❌ Environment validation failed:', error.message);
        throw new Error(`Invalid environment: ${error.message}`);
    }
    return result.data;
}
exports.env = validateEnv();
exports.default = exports.env;
//# sourceMappingURL=env.js.map