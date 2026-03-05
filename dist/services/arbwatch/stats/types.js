"use strict";
/** ArbWatch DeepSeek Stats - Types */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALIDATION_RANGES = void 0;
exports.clamp = clamp;
exports.clampProbability = clampProbability;
exports.clampOdds = clampOdds;
/** Validation utilities */
exports.VALIDATION_RANGES = {
    probability: { min: 0, max: 1 },
    odds: { min: 1.001, max: 1000 },
    percentage: { min: -1000, max: 1000 },
    stake: { min: 0, max: 1e9 },
};
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function clampProbability(p) {
    return clamp(p, exports.VALIDATION_RANGES.probability.min, exports.VALIDATION_RANGES.probability.max);
}
function clampOdds(o) {
    return clamp(o, exports.VALIDATION_RANGES.odds.min, exports.VALIDATION_RANGES.odds.max);
}
//# sourceMappingURL=types.js.map