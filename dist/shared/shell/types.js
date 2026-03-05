"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummaryQuerySchema = exports.TimelineQuerySchema = exports.EntitlementQuerySchema = exports.AppIdSchema = exports.RolloutPhaseSchema = void 0;
const zod_1 = require("zod");
exports.RolloutPhaseSchema = zod_1.z.enum(['P1', 'P2', 'P3', 'P4', 'P5']);
exports.AppIdSchema = zod_1.z.enum([
    'spreadhunter', 'deckvault', 'packpal', 'dropfarm', 'dropscout',
    'launchradar', 'memeradar', 'memestock', 'nftpulse', 'pointtrack',
    'rosterradar', 'skinsignal', 'socialindex', 'botindex', 'arbwatch',
]);
exports.EntitlementQuerySchema = zod_1.z.object({
    userId: zod_1.z.string().min(1, 'userId is required'),
});
exports.TimelineQuerySchema = zod_1.z.object({
    days: zod_1.z.coerce.number().int().min(1).max(90).default(14),
    limit: zod_1.z.coerce.number().int().min(1).max(200).default(30),
});
exports.SummaryQuerySchema = zod_1.z.object({
    windowHours: zod_1.z.coerce.number().int().min(1).max(168).default(24),
});
//# sourceMappingURL=types.js.map