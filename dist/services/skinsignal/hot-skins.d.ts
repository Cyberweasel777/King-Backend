/**
 * SkinSignal Hot Skins — King Backend
 * Curated list of popular CS2 skins to scan for the opportunities feed.
 * Market hash names are the canonical identifiers used across all marketplaces.
 */
export interface HotSkin {
    marketHashName: string;
    category: 'rifle' | 'pistol' | 'knife' | 'gloves' | 'smg' | 'shotgun' | 'sniper';
    popularityRank: number;
}
/** Top 20 most-traded CS2 skins by volume */
export declare const HOT_SKINS: HotSkin[];
export declare function getHotSkinNames(): string[];
//# sourceMappingURL=hot-skins.d.ts.map