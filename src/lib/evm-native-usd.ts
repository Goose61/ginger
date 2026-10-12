import type { MintDestination } from "./types";
import { fetchAvaxUsd } from "./avax-price";
import { getEvmNftChainDefinition } from "./evm-nft-chain-catalog";
import { mintDestinationToSpokeChain } from "./evm-spoke-chains";

/** Conservative USD per native unit when no live feed exists (ETH-equivalent chains). */
const ETH_LIKE_USD = 2500;
const BNB_USD = 600;
const AVAX_USD_FALLBACK = 25;
const POL_USD = 0.35;
const SEI_USD = 0.35;
const FLOW_USD = 0.5;
const RON_USD = 1.5;
const BERA_USD = 2;
const APE_USD = 0.8;
const MNT_USD = 0.7;
const HYPE_USD = 20;
const SOMI_USD = 0.5;
const MON_USD = 0.1;
const GUN_USD = 0.05;

export async function nativeUsdForDestination(destination: MintDestination): Promise<{
  symbol: string;
  usd: number;
}> {
  if (destination === "solana") return { symbol: "SOL", usd: 0 };
  if (destination === "avalanche" || destination === "avalanche_l1") {
    const usd = await fetchAvaxUsd().catch(() => AVAX_USD_FALLBACK);
    return { symbol: "AVAX", usd: usd || AVAX_USD_FALLBACK };
  }
  const spoke = mintDestinationToSpokeChain(destination);
  const def = spoke ? getEvmNftChainDefinition(spoke) : undefined;
  const sym = def?.nativeSymbol ?? "ETH";
  const fallback = nativeUsdFallback(sym);
  return { symbol: sym, usd: fallback };
}

function nativeUsdFallback(nativeSymbol: string): number {
  switch (nativeSymbol.toUpperCase()) {
    case "AVAX":
      return AVAX_USD_FALLBACK;
    case "POL":
      return POL_USD;
    case "BNB":
      return BNB_USD;
    case "SEI":
      return SEI_USD;
    case "FLOW":
      return FLOW_USD;
    case "RON":
      return RON_USD;
    case "BERA":
      return BERA_USD;
    case "APE":
      return APE_USD;
    case "MNT":
      return MNT_USD;
    case "HYPE":
      return HYPE_USD;
    case "SOMI":
      return SOMI_USD;
    case "MON":
      return MON_USD;
    case "GUN":
      return GUN_USD;
    case "ETH":
    default:
      return ETH_LIKE_USD;
  }
}
