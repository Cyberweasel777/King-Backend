"use strict";
/** BotIndex DeepSeek Stats - Types */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALIDATION_RANGES = void 0;
exports.clamp = clamp;
exports.clampCorrelation = clampCorrelation;
exports.clampProbability = clampProbability;
/** Validation utilities */
exports.VALIDATION_RANGES = {
    correlation: { min: -1, max: 1 },
    probability: { min: 0, max: 1 },
    percentage: { min: -1000, max: 1000 },
    variance: { min: 0, max: 1e12 },
};
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function clampCorrelation(r) {
    return clamp(r, exports.VALIDATION_RANGES.correlation.min, exports.VALIDATION_RANGES.correlation.max);
}
function clampProbability(p) {
    return clamp(p, exports.VALIDATION_RANGES.probability.min, exports.VALIDATION_RANGES.probability.max);
}
//# sourceMappingURL=types.js.map