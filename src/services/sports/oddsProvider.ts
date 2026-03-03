/**
 * Sports Odds Provider — Structured JSON data for BotIndex API
 * Replaces SpreadHunter's hardcoded Telegram responses
 */

export interface GameOdds {
  sport: string;
  league: string;
  home: string;
  away: string;
  homeSpread: number;
  awaySpread: number;
  homeML: number;
  awayML: number;
  overUnder: number;
  timestamp: string;
  source: string;
}

export interface LineMovement {
  sport: string;
  team: string;
  lineType: 'spread' | 'moneyline' | 'total';
  openValue: number;
  currentValue: number;
  direction: 'up' | 'down' | 'stable';
  sharpAction: boolean;
  movementPct: number;
  timestamp: string;
}

export interface PropMovement {
  sport: string;
  player: string;
  team: string;
  propType: string;
  openLine: number;
  currentLine: number;
  direction: 'up' | 'down';
  confidence: number;
  timestamp: string;
}

// Realistic mock data — will be replaced with live odds API feeds
const GAMES: GameOdds[] = [
  {
    sport: 'NFL', league: 'NFL',
    home: 'Kansas City Chiefs', away: 'Buffalo Bills',
    homeSpread: -3.5, awaySpread: 3.5,
    homeML: -175, awayML: 150,
    overUnder: 47.5,
    timestamp: new Date().toISOString(),
    source: 'consensus',
  },
  {
    sport: 'NBA', league: 'NBA',
    home: 'Boston Celtics', away: 'Milwaukee Bucks',
    homeSpread: -5.0, awaySpread: 5.0,
    homeML: -210, awayML: 175,
    overUnder: 224.5,
    timestamp: new Date().toISOString(),
    source: 'consensus',
  },
  {
    sport: 'NBA', league: 'NBA',
    home: 'Los Angeles Lakers', away: 'Denver Nuggets',
    homeSpread: 2.5, awaySpread: -2.5,
    homeML: 120, awayML: -140,
    overUnder: 231.0,
    timestamp: new Date().toISOString(),
    source: 'consensus',
  },
  {
    sport: 'UFC', league: 'UFC',
    home: 'Fighter A', away: 'Fighter B',
    homeSpread: 0, awaySpread: 0,
    homeML: -155, awayML: 130,
    overUnder: 2.5,
    timestamp: new Date().toISOString(),
    source: 'consensus',
  },
  {
    sport: 'NHL', league: 'NHL',
    home: 'Toronto Maple Leafs', away: 'Tampa Bay Lightning',
    homeSpread: -1.5, awaySpread: 1.5,
    homeML: -130, awayML: 110,
    overUnder: 6.5,
    timestamp: new Date().toISOString(),
    source: 'consensus',
  },
];

function jitter(base: number, range: number): number {
  return +(base + (Math.random() - 0.5) * range).toFixed(1);
}

export async function getOddsSnapshot(): Promise<{ games: GameOdds[]; updatedAt: string }> {
  const games = GAMES.map((g) => ({
    ...g,
    homeSpread: jitter(g.homeSpread, 1),
    awaySpread: jitter(g.awaySpread, 1),
    overUnder: jitter(g.overUnder, 3),
    timestamp: new Date().toISOString(),
  }));
  return { games, updatedAt: new Date().toISOString() };
}

export async function getLineMovements(): Promise<{ movements: LineMovement[]; updatedAt: string }> {
  const movements: LineMovement[] = [
    {
      sport: 'NFL', team: 'Kansas City Chiefs', lineType: 'spread',
      openValue: -2.5, currentValue: -3.5, direction: 'down',
      sharpAction: true, movementPct: 40, timestamp: new Date().toISOString(),
    },
    {
      sport: 'NBA', team: 'Boston Celtics', lineType: 'spread',
      openValue: -4.0, currentValue: -5.0, direction: 'down',
      sharpAction: true, movementPct: 25, timestamp: new Date().toISOString(),
    },
    {
      sport: 'NBA', team: 'Los Angeles Lakers', lineType: 'total',
      openValue: 228.5, currentValue: 231.0, direction: 'up',
      sharpAction: false, movementPct: 1.1, timestamp: new Date().toISOString(),
    },
    {
      sport: 'NHL', team: 'Toronto Maple Leafs', lineType: 'moneyline',
      openValue: -120, currentValue: -130, direction: 'down',
      sharpAction: false, movementPct: 8.3, timestamp: new Date().toISOString(),
    },
  ];
  return { movements, updatedAt: new Date().toISOString() };
}

export async function getTopProps(): Promise<{ props: PropMovement[]; updatedAt: string }> {
  const props: PropMovement[] = [
    {
      sport: 'NBA', player: 'Jayson Tatum', team: 'BOS',
      propType: 'points', openLine: 27.5, currentLine: 28.5,
      direction: 'up', confidence: 0.78, timestamp: new Date().toISOString(),
    },
    {
      sport: 'NFL', player: 'Patrick Mahomes', team: 'KC',
      propType: 'pass_yards', openLine: 284.5, currentLine: 291.5,
      direction: 'up', confidence: 0.82, timestamp: new Date().toISOString(),
    },
    {
      sport: 'NBA', player: 'Luka Doncic', team: 'DAL',
      propType: 'assists', openLine: 8.5, currentLine: 9.5,
      direction: 'up', confidence: 0.71, timestamp: new Date().toISOString(),
    },
    {
      sport: 'NBA', player: 'Giannis Antetokounmpo', team: 'MIL',
      propType: 'rebounds', openLine: 11.5, currentLine: 12.5,
      direction: 'up', confidence: 0.68, timestamp: new Date().toISOString(),
    },
    {
      sport: 'NHL', player: 'Auston Matthews', team: 'TOR',
      propType: 'shots_on_goal', openLine: 3.5, currentLine: 4.5,
      direction: 'up', confidence: 0.65, timestamp: new Date().toISOString(),
    },
  ];
  return { props, updatedAt: new Date().toISOString() };
}
