"use strict";
/**
 * Bot Launcher
 * Orchestrates all Telegram bots
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchAllBots = void 0;
exports.launchBots = launchBots;
exports.shutdownAllBots = shutdownAllBots;
exports.getBotStatus = getBotStatus;
const botindex_1 = require("./telegram/handlers/botindex");
const memeradar_1 = require("./telegram/handlers/memeradar");
const arbwatch_1 = require("./telegram/handlers/arbwatch");
const spreadhunter_1 = require("./telegram/handlers/spreadhunter");
const rosterradar_1 = require("./telegram/handlers/rosterradar");
const logger_1 = require("../utils/logger");
const bots = [
    {
        name: 'BotIndex',
        tokenEnv: 'BOTINDEX_BOT_TOKEN',
        createBot: botindex_1.createBotIndexBot
    },
    {
        name: 'MemeRadar',
        tokenEnv: 'MEMERADAR_BOT_TOKEN',
        createBot: memeradar_1.createMemeRadarBot
    },
    {
        name: 'ArbWatch',
        tokenEnv: 'ARBWATCH_BOT_TOKEN',
        createBot: arbwatch_1.createArbWatchBot
    },
    {
        name: 'SpreadHunter',
        tokenEnv: 'SPREADHUNTER_BOT_TOKEN',
        createBot: spreadhunter_1.createSpreadHunterBot
    },
    {
        name: 'RosterRadar',
        tokenEnv: 'ROSTERRADAR_BOT_TOKEN',
        createBot: rosterradar_1.createRosterRadarBot
    }
];
const runningBots = new Map();
async function launchBots() {
    logger_1.logger.info('Launching Telegram bots...');
    for (const config of bots) {
        const token = process.env[config.tokenEnv];
        if (!token) {
            logger_1.logger.warn({ bot: config.name, tokenEnv: config.tokenEnv }, 'No token found');
            continue;
        }
        try {
            const bot = config.createBot(token);
            // Start each bot independently so one failure/slow-start doesn't block others
            runningBots.set(config.name, bot);
            logger_1.logger.info({ bot: config.name }, 'Bot launch initiated');
            void bot.launch({ dropPendingUpdates: true })
                .then(() => {
                logger_1.logger.info({ bot: config.name }, 'Bot launched');
            })
                .catch((err) => {
                runningBots.delete(config.name);
                logger_1.logger.error({ bot: config.name, err }, 'Failed to launch bot');
            });
            // Enable graceful stop
            process.once('SIGINT', () => bot.stop('SIGINT'));
            process.once('SIGTERM', () => bot.stop('SIGTERM'));
        }
        catch (err) {
            logger_1.logger.error({ bot: config.name, err }, 'Failed to initialize bot');
        }
    }
}
// Aliases expected by bots/index.ts
exports.launchAllBots = launchBots;
async function shutdownAllBots() {
    for (const [name, bot] of runningBots) {
        try {
            bot.stop('shutdown');
            logger_1.logger.info({ bot: name }, 'Stopped bot');
        }
        catch (err) {
            logger_1.logger.error({ bot: name, err }, 'Error stopping bot');
        }
    }
    runningBots.clear();
}
function getBotStatus() {
    const status = {};
    for (const config of bots) {
        status[config.name] = runningBots.has(config.name);
    }
    return status;
}
// Auto-launch if run directly
if (require.main === module) {
    launchBots().catch((err) => logger_1.logger.error({ err }, 'Failed to launch bots'));
}
//# sourceMappingURL=launcher.js.map