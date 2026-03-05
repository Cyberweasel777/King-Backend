"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBotStatus = exports.shutdownAllBots = exports.launchAllBots = exports.createVaultGuardBot = exports.createLaunchSniperBot = exports.createDAOGrinderBot = exports.createAlphaCallerBot = exports.createRosterRadarBot = exports.createValidatorXBot = exports.createYieldHunterBot = exports.createChainPulseBot = exports.createNicheHunterBot = exports.createWhaleWatcherBot = exports.createSignalOracleBot = exports.createAirdropHunterBot = exports.createBotIndexBot = exports.createMemeRadarBot = exports.createDeckVaultBot = exports.createSpreadHunterBot = void 0;
// Telegram Bot Exports
var spreadhunter_1 = require("./telegram/handlers/spreadhunter");
Object.defineProperty(exports, "createSpreadHunterBot", { enumerable: true, get: function () { return spreadhunter_1.createSpreadHunterBot; } });
var deckvault_1 = require("./telegram/handlers/deckvault");
Object.defineProperty(exports, "createDeckVaultBot", { enumerable: true, get: function () { return deckvault_1.createDeckVaultBot; } });
var memeradar_1 = require("./telegram/handlers/memeradar");
Object.defineProperty(exports, "createMemeRadarBot", { enumerable: true, get: function () { return memeradar_1.createMemeRadarBot; } });
var botindex_1 = require("./telegram/handlers/botindex");
Object.defineProperty(exports, "createBotIndexBot", { enumerable: true, get: function () { return botindex_1.createBotIndexBot; } });
var airdrophunter_1 = require("./telegram/handlers/airdrophunter");
Object.defineProperty(exports, "createAirdropHunterBot", { enumerable: true, get: function () { return airdrophunter_1.createAirdropHunterBot; } });
var signloracle_1 = require("./telegram/handlers/signloracle");
Object.defineProperty(exports, "createSignalOracleBot", { enumerable: true, get: function () { return signloracle_1.createSignalOracleBot; } });
var whalewatcher_1 = require("./telegram/handlers/whalewatcher");
Object.defineProperty(exports, "createWhaleWatcherBot", { enumerable: true, get: function () { return whalewatcher_1.createWhaleWatcherBot; } });
var nichehunter_1 = require("./telegram/handlers/nichehunter");
Object.defineProperty(exports, "createNicheHunterBot", { enumerable: true, get: function () { return nichehunter_1.createNicheHunterBot; } });
var chainpulse_1 = require("./telegram/handlers/chainpulse");
Object.defineProperty(exports, "createChainPulseBot", { enumerable: true, get: function () { return chainpulse_1.createChainPulseBot; } });
var yieldhunter_1 = require("./telegram/handlers/yieldhunter");
Object.defineProperty(exports, "createYieldHunterBot", { enumerable: true, get: function () { return yieldhunter_1.createYieldHunterBot; } });
var validatorx_1 = require("./telegram/handlers/validatorx");
Object.defineProperty(exports, "createValidatorXBot", { enumerable: true, get: function () { return validatorx_1.createValidatorXBot; } });
var rosterradar_1 = require("./telegram/handlers/rosterradar");
Object.defineProperty(exports, "createRosterRadarBot", { enumerable: true, get: function () { return rosterradar_1.createRosterRadarBot; } });
// Discord Bot Exports
var alphacaller_1 = require("./discord/handlers/alphacaller");
Object.defineProperty(exports, "createAlphaCallerBot", { enumerable: true, get: function () { return alphacaller_1.createAlphaCallerBot; } });
var daogrinder_1 = require("./discord/handlers/daogrinder");
Object.defineProperty(exports, "createDAOGrinderBot", { enumerable: true, get: function () { return daogrinder_1.createDAOGrinderBot; } });
var launchsniper_1 = require("./discord/handlers/launchsniper");
Object.defineProperty(exports, "createLaunchSniperBot", { enumerable: true, get: function () { return launchsniper_1.createLaunchSniperBot; } });
var vaultguard_1 = require("./discord/handlers/vaultguard");
Object.defineProperty(exports, "createVaultGuardBot", { enumerable: true, get: function () { return vaultguard_1.createVaultGuardBot; } });
// Launcher
var launcher_1 = require("./launcher");
Object.defineProperty(exports, "launchAllBots", { enumerable: true, get: function () { return launcher_1.launchAllBots; } });
Object.defineProperty(exports, "shutdownAllBots", { enumerable: true, get: function () { return launcher_1.shutdownAllBots; } });
Object.defineProperty(exports, "getBotStatus", { enumerable: true, get: function () { return launcher_1.getBotStatus; } });
//# sourceMappingURL=index.js.map