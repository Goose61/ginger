import type { GeneratedToken, TraitPricing, TraitRarity } from "./types";

export type OverallRarity = "legendary" | "epic" | "rare" | "uncommon" | "common";

export const OVERALL_RARITY_ORDER: OverallRarity[] = [
  "legendary",
  "epic",
  "rare",
  "uncommon",
  "common",
];

export const OVERALL_RARITY_LABEL: Record<OverallRarity, string> = {
  legendary: "Legendary",
  epic: "Epic",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
};

export const OVERALL_RARITY_CLASS: Record<OverallRarity, string> = {
  legendary: "bg-amber-400 text-black",
  epic: "bg-fuchsia-500 text-white",
  rare: "bg-sky-500 text-white",
  uncommon: "bg-emerald-500 text-white",
  common: "bg-white/20 text-white",
};

export const OVERALL_RARITY_FRAME: Record<OverallRarity, string> = {
  legendary: "nft-frame-legendary",
  epic: "nft-frame-epic",
  rare: "nft-frame-rare",
  uncommon: "nft-frame-uncommon",
  common: "nft-frame-common",
};

export function tokenRarityRank(token: GeneratedToken): number | null {
  const attr = (token.attributes ?? []).find((a) => a.trait_type === "Rarity Rank");
  if (attr == null) return null;
  const n = Number(attr.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Common = 1, rare = 2, epic = 3. The overall tag is the mean of these. */
const TRAIT_RARITY_POINTS: Record<TraitRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
};

export function overallRarityFromRank(rank: number, supply: number): OverallRarity {
  if (supply <= 1) return "common";
  const pct = rank / supply;
  if (pct <= 0.05) return "legendary";
  if (pct <= 0.15) return "epic";
  if (pct <= 0.35) return "rare";
  if (pct <= 0.65) return "uncommon";
  return "common";
}

function scoringAttributes(token: GeneratedToken) {
  return (token.attributes ?? []).filter((a) => a.trait_type !== "Rarity Rank");
}

const traitFrequencyCache = new WeakMap<GeneratedToken[], Map<string, number>>();

function traitFrequency(tokens: GeneratedToken[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    for (const attr of scoringAttributes(token)) {
      const key = `${attr.trait_type}:${attr.value}`;
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
  }
  traitFrequencyCache.set(tokens, freq);
  return freq;
}

function cachedTraitFrequency(tokens: GeneratedToken[]): Map<string, number> {
  const cached = traitFrequencyCache.get(tokens);
  if (cached) return cached;
  return traitFrequency(tokens);
}

/** How scarce a trait value is when the creator has not set a tier. */
export function traitTierFromRate(rate: number): TraitRarity {
  if (rate <= 0.05) return "epic";
  if (rate <= 0.2) return "rare";
  return "common";
}

function traitPoints(
  token: GeneratedToken,
  freq: Map<string, number>,
  supply: number,
  traitPricing?: TraitPricing,
): number[] {
  return scoringAttributes(token).map((attr) => {
    const priced = traitPricing?.[attr.trait_type]?.[String(attr.value)]?.rarity;
    const tier =
      priced ??
      traitTierFromRate((freq.get(`${attr.trait_type}:${attr.value}`) ?? supply) / supply);
    return TRAIT_RARITY_POINTS[tier];
  });
}

/**
 * Mean trait rating for one NFT.
 * A single rare (2) or epic (3) trait raises the mean above 1, so the piece
 * is no longer Common just because the rest of its traits are Common.
 */
export function averageTraitRating(
  token: GeneratedToken,
  tokens: GeneratedToken[],
  traitPricing?: TraitPricing,
  freq?: Map<string, number>,
): number {
  const supply = Math.max(1, tokens.length);
  const points = traitPoints(token, freq ?? cachedTraitFrequency(tokens), supply, traitPricing);
  if (!points.length) return 1;
  return points.reduce((sum, n) => sum + n, 0) / points.length;
}

export function overallRarityFromAverage(avg: number): OverallRarity {
  // 1 = every trait common. Anything above that includes a rare or epic trait.
  if (!(avg > 1)) return "common";
  if (avg < 1.4) return "uncommon";
  if (avg < 1.7) return "rare";
  if (avg < 2) return "epic";
  return "legendary";
}

export type TokenRarityProfile = { rank: number; overall: OverallRarity };

/** Rank and overall tag for every token, scored in one pass. */
export function rarityProfileByTokenId(
  tokens: GeneratedToken[],
  traitPricing?: TraitPricing,
): Map<number, TokenRarityProfile> {
  const freq = traitFrequency(tokens);
  const supply = Math.max(1, tokens.length);
  const scored = tokens.map((token) => {
    const points = traitPoints(token, freq, supply, traitPricing);
    const avg = points.length ? points.reduce((sum, n) => sum + n, 0) / points.length : 1;
    const stat = scoringAttributes(token).reduce((sum, attr) => {
      const count = freq.get(`${attr.trait_type}:${attr.value}`) ?? supply;
      return sum + supply / count;
    }, 0);
    return { tokenId: token.tokenId, avg, stat, overall: overallRarityFromAverage(avg) };
  });
  scored.sort((a, b) => b.avg - a.avg || b.stat - a.stat || a.tokenId - b.tokenId);
  return new Map(
    scored.map((row, index) => [row.tokenId, { rank: index + 1, overall: row.overall }]),
  );
}

/** Rank map (1 = rarest), ordered by average trait rating. */
export function rarityRankByTokenId(
  tokens: GeneratedToken[],
  traitPricing?: TraitPricing,
): Map<number, number> {
  return new Map(
    Array.from(rarityProfileByTokenId(tokens, traitPricing), ([tokenId, profile]) => [
      tokenId,
      profile.rank,
    ]),
  );
}

export function tokenOverallRarity(
  token: GeneratedToken,
  supply: number,
  ranks?: Map<number, number>,
  options?: { tokens?: GeneratedToken[]; traitPricing?: TraitPricing },
): OverallRarity {
  if (options?.tokens?.length) {
    return overallRarityFromAverage(
      averageTraitRating(token, options.tokens, options.traitPricing),
    );
  }
  const rank = ranks?.get(token.tokenId) ?? tokenRarityRank(token);
  if (rank != null) return overallRarityFromRank(rank, Math.max(1, supply));
  return "common";
}

export function assignRarityRanks(tokens: GeneratedToken[]): GeneratedToken[] {
  const freq = traitFrequency(tokens);
  const supply = Math.max(1, tokens.length);
  const scored = tokens.map((token) => {
    const attrs = scoringAttributes(token);
    const points = traitPoints(token, freq, supply);
    const avg = points.length ? points.reduce((sum, n) => sum + n, 0) / points.length : 1;
    const stat = attrs.reduce((sum, attr) => {
      const count = freq.get(`${attr.trait_type}:${attr.value}`) ?? supply;
      return sum + supply / count;
    }, 0);
    return { token, avg, stat: attrs.length ? stat / attrs.length : 0 };
  });
  scored.sort((a, b) => b.avg - a.avg || b.stat - a.stat || a.token.tokenId - b.token.tokenId);
  const max = tokens.length;
  return scored.map((row, idx) => {
    const rank = idx + 1;
    const attrs = scoringAttributes(row.token);
    attrs.push({ trait_type: "Rarity Rank", value: rank, display_type: "number", max_value: max });
    return { ...row.token, attributes: attrs };
  });
}
