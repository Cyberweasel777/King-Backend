"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackFunnelEvent = trackFunnelEvent;
exports.getFunnelStats = getFunnelStats;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../../config/logger"));
const DATA_DIR = process.env.API_KEY_DATA_DIR || '/data';
const FILE = path_1.default.join(DATA_DIR, 'conversion-funnel.json');
const MAX_EVENTS = 5000;
const store = { events: [] };
let flushScheduled = false;
function load() {
    try {
        if (!fs_1.default.existsSync(FILE))
            return;
        const raw = fs_1.default.readFileSync(FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.events)) {
            // normalize legacy entries that used `timestamp` instead of `ts`
            const normalized = parsed.events.map((e) => ({
                ...e,
                ts: e.ts || e.timestamp || new Date().toISOString(),
            }));
            store.events = normalized.slice(-MAX_EVENTS);
        }
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to load conversion funnel ledger');
    }
}
async function flush() {
    try {
        await fs_1.default.promises.mkdir(DATA_DIR, { recursive: true });
        await fs_1.default.promises.writeFile(FILE, JSON.stringify(store, null, 2), 'utf-8');
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to flush conversion funnel ledger');
    }
}
function scheduleFlush() {
    if (flushScheduled)
        return;
    flushScheduled = true;
    setTimeout(() => {
        flushScheduled = false;
        void flush();
    }, 500);
}
function trackFunnelEvent(type, plan, source, referer) {
    const event = { type, plan, ts: new Date().toISOString() };
    if (source)
        event.source = source;
    if (referer)
        event.referer = referer;
    store.events.push(event);
    if (store.events.length > MAX_EVENTS) {
        store.events = store.events.slice(-MAX_EVENTS);
    }
    scheduleFlush();
}
function getFunnelStats() {
    const events = store.events;
    const count = (type) => events.filter((e) => e.type === type).length;
    const registerHits = count('register_page_hit');
    const checkoutCreated = count('checkout_session_created');
    const checkoutCompleted = count('checkout_completed');
    const apiKeysIssued = count('api_key_issued');
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
    return {
        since: events[0]?.ts || null,
        eventsTracked: events.length,
        registerHits,
        checkoutCreated,
        checkoutCompleted,
        apiKeysIssued,
        conversion: {
            registerToCheckoutPct: pct(checkoutCreated, registerHits),
            checkoutToCompletePct: pct(checkoutCompleted, checkoutCreated),
            completeToKeyPct: pct(apiKeysIssued, checkoutCompleted),
            registerToKeyPct: pct(apiKeysIssued, registerHits),
        },
        lastEventAt: events[events.length - 1]?.ts || null,
    };
}
load();
//# sourceMappingURL=conversion-funnel.js.map