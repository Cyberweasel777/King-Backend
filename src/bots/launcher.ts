/**
 * Bot Launcher
 * Orchestrates all Telegram bots
 */

import { Telegraf } from 'telegraf';
import { createBotIndexBot } from './telegram/handlers/botindex';
import { createMemeRadarBot } from './telegram/handlers/memeradar';
import { createArbWatchBot } from './telegram/handlers/arbwatch';

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
  }
];

const runningBots: Map<string, Telegraf> = new Map();

export async function launchBots() {
  console.log('Launching Telegram bots...');

  for (const config of bots) {
    const token = process.env[config.tokenEnv];

    if (!token) {
      console.warn(`${config.name}: No token found (set ${config.tokenEnv})`);
      continue;
    }

    try {
      const bot = config.createBot(token);

      // Launch with long polling (webhook mode for production)
      await bot.launch();
      runningBots.set(config.name, bot);

      console.log(`${config.name} bot launched`);

      // Enable graceful stop
      process.once('SIGINT', () => bot.stop('SIGINT'));
      process.once('SIGTERM', () => bot.stop('SIGTERM'));

    } catch (err) {
      console.error(`${config.name} failed to launch:`, err);
    }
  }
}

// Aliases expected by bots/index.ts
export const launchAllBots = launchBots;

export async function shutdownAllBots(): Promise<void> {
  for (const [name, bot] of runningBots) {
    try {
      bot.stop('shutdown');
      console.log(`Stopped ${name}`);
    } catch (err) {
      console.error(`Error stopping ${name}:`, err);
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
  launchBots().catch(console.error);
}
