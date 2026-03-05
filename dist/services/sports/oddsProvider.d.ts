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
export declare function getOddsSnapshot(): Promise<{
    games: GameOdds[];
    updatedAt: string;
}>;
export declare function getLineMovements(): Promise<{
    movements: LineMovement[];
    updatedAt: string;
}>;
export declare function getTopProps(): Promise<{
    props: PropMovement[];
    updatedAt: string;
}>;
//# sourceMappingURL=oddsProvider.d.ts.map