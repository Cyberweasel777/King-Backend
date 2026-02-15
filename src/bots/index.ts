// Telegram Bot Exports
export { createSpreadHunterBot } from './telegram/handlers/spreadhunter';
export { createDeckVaultBot } from './telegram/handlers/deckvault';
export { createMemeRadarBot } from './telegram/handlers/memeradar';
export { createBotIndexBot } from './telegram/handlers/botindex';
export { createAirdropHunterBot } from './telegram/handlers/airdrophunter';
export { createSignalOracleBot } from './telegram/handlers/signloracle';
export { createWhaleWatcherBot } from './telegram/handlers/whalewatcher';
export { createNicheHunterBot } from './telegram/handlers/nichehunter';
export { createChainPulseBot } from './telegram/handlers/chainpulse';
export { createYieldHunterBot } from './telegram/handlers/yieldhunter';
export { createValidatorXBot } from './telegram/handlers/validatorx';

// Discord Bot Exports
export { createAlphaCallerBot } from './discord/handlers/alphacaller';
export { createDAOGrinderBot } from './discord/handlers/daogrinder';
export { createLaunchSniperBot } from './discord/handlers/launchsniper';
export { createVaultGuardBot } from './discord/handlers/vaultguard';

// Launcher
export {
  launchAllBots,
  shutdownAllBots,
  getBotStatus,
} from './launcher';
