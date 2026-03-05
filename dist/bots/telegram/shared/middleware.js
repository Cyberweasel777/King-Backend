"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowCommand = allowCommand;
exports.escapeMd = escapeMd;
exports.extractArg = extractArg;
exports.shortAddress = shortAddress;
const defaultConfig = { windowMs: 60_000, maxRequests: 12 };
const commandUsage = new Map();
function allowCommand(userId, config = defaultConfig) {
    if (!userId)
        return true;
    const now = Date.now();
    const row = commandUsage.get(userId);
    if (!row || now > row.resetAt) {
        commandUsage.set(userId, { count: 1, resetAt: now + config.windowMs });
        return true;
    }
    if (row.count >= config.maxRequests)
        return false;
    row.count += 1;
    return true;
}
// Markdown escape
function escapeMd(input) {
    return input.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1');
}
// Safe argument extraction from command text
function extractArg(text, maxLength = 120) {
    if (!text)
        return '';
    const [, ...rest] = text.trim().split(/\s+/);
    return rest.join(' ').trim().slice(0, maxLength);
}
// Short address display
function shortAddress(address) {
    return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}
//# sourceMappingURL=middleware.js.map