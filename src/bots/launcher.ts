/**
 * Bot Launcher
 * Orchestrates all Telegram bots
 */

import { Telegraf } from 'telegraf';
import { createBotIndexBot } from './telegram/handlers/botindex';
import { createMemeRadarBot } from './telegram/handlers/memeradar';
import { createArbWatchBot } from './telegram/handlers/arbwatch';
import { createSpreadHunterBot } from './telegram/handlers/spreadhunter';
import { createRosterRadarBot } from './telegram/handlers/rosterradar';
import { logger } from '../utils/logger';

interface BotConfig {
  name: string;
  tokenEnv: string;
  createBot: (token: string) => Telegraf;
}

const bots: BotConfig[] = [
  {
    name: 'BotIndex',
    tokenEnv: 'BOTINDEX_BOT_TOKEN',
    createBot: createBotIndexBot
  },
  {
    name: 'MemeRadar',
    tokenEnv: 'MEMERADAR_BOT_TOKEN',
    createBot: createMemeRadarBot
  },
  {
    name: 'ArbWatch',
    tokenEnv: 'ARBWATCH_BOT_TOKEN',
    createBot: createArbWatchBot
  },
  {
    name: 'SpreadHunter',
    tokenEnv: 'SPREADHUNTER_BOT_TOKEN',
    createBot: createSpreadHunterBot
  },
  {
    name: 'RosterRadar',
    tokenEnv: 'ROSTERRADAR_BOT_TOKEN',
    createBot: createRosterRadarBot
  }
];

const runningBots: Map<string, Telegraf> = new Map();

export async function launchBots() {
  logger.info('Launching Telegram bots...');

  for (const config of bots) {
    const token = process.env[config.tokenEnv];

    if (!token) {
      logger.warn({ bot: config.name, tokenEnv: config.tokenEnv }, 'No token found');
      continue;
    }

    try {
      const bot = config.createBot(token);

      // Start each bot independently so one failure/slow-start doesn't block others
      runningBots.set(config.name, bot);
      logger.info({ bot: config.name }, 'Bot launch initiated');

      void bot.launch({ dropPendingUpdates: true })
        .then(() => {
          logger.info({ bot: config.name }, 'Bot launched');
        })
        .catch((err) => {
          runningBots.delete(config.name);
          logger.error({ bot: config.name, err }, 'Failed to launch bot');
        });

      // Enable graceful stop
      process.once('SIGINT', () => bot.stop('SIGINT'));
      process.once('SIGTERM', () => bot.stop('SIGTERM'));

    } catch (err) {
      logger.error({ bot: config.name, err }, 'Failed to initialize bot');
    }
  }
}

// Aliases expected by bots/index.ts
export const launchAllBots = launchBots;

export async function shutdownAllBots(): Promise<void> {
  for (const [name, bot] of runningBots) {
    try {
      bot.stop('shutdown');
      logger.info({ bot: name }, 'Stopped bot');
    } catch (err) {
      logger.error({ bot: name, err }, 'Error stopping bot');
    }
  }
  runningBots.clear();
}

export function getBotStatus(): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const config of bots) {
    status[config.name] = runningBots.has(config.name);
  }
  return status;
}

// Auto-launch if run directly
if (require.main === module) {
  launchBots().catch((err) => logger.error({ err }, 'Failed to launch bots'));
}
