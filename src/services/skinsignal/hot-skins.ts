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
export const HOT_SKINS: HotSkin[] = [
  { marketHashName: 'AK-47 | Redline (Field-Tested)', category: 'rifle', popularityRank: 1 },
  { marketHashName: 'AK-47 | Asiimov (Field-Tested)', category: 'rifle', popularityRank: 2 },
  { marketHashName: 'M4A1-S | Hyper Beast (Field-Tested)', category: 'rifle', popularityRank: 3 },
  { marketHashName: 'AWP | Asiimov (Field-Tested)', category: 'sniper', popularityRank: 4 },
  { marketHashName: 'AK-47 | Vulcan (Field-Tested)', category: 'rifle', popularityRank: 5 },
  { marketHashName: 'M4A4 | Howl (Field-Tested)', category: 'rifle', popularityRank: 6 },
  { marketHashName: 'AWP | Dragon Lore (Field-Tested)', category: 'sniper', popularityRank: 7 },
  { marketHashName: 'Glock-18 | Fade (Factory New)', category: 'pistol', popularityRank: 8 },
  { marketHashName: 'Desert Eagle | Blaze (Factory New)', category: 'pistol', popularityRank: 9 },
  { marketHashName: 'AK-47 | Fire Serpent (Field-Tested)', category: 'rifle', popularityRank: 10 },
  { marketHashName: 'AWP | Medusa (Field-Tested)', category: 'sniper', popularityRank: 11 },
  { marketHashName: 'M4A1-S | Knight (Factory New)', category: 'rifle', popularityRank: 12 },
  { marketHashName: 'Karambit | Doppler (Factory New)', category: 'knife', popularityRank: 13 },
  { marketHashName: 'Butterfly Knife | Fade (Factory New)', category: 'knife', popularityRank: 14 },
  { marketHashName: 'Sport Gloves | Pandora\'s Box (Field-Tested)', category: 'gloves', popularityRank: 15 },
  { marketHashName: 'AK-47 | Case Hardened (Field-Tested)', category: 'rifle', popularityRank: 16 },
  { marketHashName: 'USP-S | Kill Confirmed (Field-Tested)', category: 'pistol', popularityRank: 17 },
  { marketHashName: 'M4A1-S | Printstream (Factory New)', category: 'rifle', popularityRank: 18 },
  { marketHashName: 'AWP | Fade (Factory New)', category: 'sniper', popularityRank: 19 },
  { marketHashName: 'AK-47 | Bloodsport (Factory New)', category: 'rifle', popularityRank: 20 },
];

export function getHotSkinNames(): string[] {
  return HOT_SKINS.sort((a, b) => a.popularityRank - b.popularityRank).map(s => s.marketHashName);
}
