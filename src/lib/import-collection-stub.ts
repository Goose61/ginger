import { slugify } from "@/lib/store";
import { homeChainToDestination, parseHomeChain } from "@/lib/chain-registry";
import { defaultPayments, type ChainKey, type Collection, type MintDestination } from "@/lib/types";

const DEFAULT_ROYALTY_BPS = 500;

export function buildImportingCollectionStub(params: {
  id: string;
  name: string;
  description: string;
  creatorWallet: string;
  pendingZipUrl?: string;
  homeChain?: ChainKey;
  mintDestinations?: MintDestination[];
}): Collection {
  const homeChain = parseHomeChain(params.homeChain);
  const homeDest = homeChainToDestination(homeChain);
  const mintDestinations = Array.from(
    new Set<MintDestination>([homeDest, ...(params.mintDestinations ?? [])]),
  );
  const now = new Date().toISOString();
  return {
    id: params.id,
    slug: slugify(params.name),
    name: params.name,
    symbol: params.name.slice(0, 6).toUpperCase().replace(/\s/g, ""),
    description: params.description,
    nameTemplate: "{name} #{id}",
    chain: homeChain,
    homeChain,
    mintDestinations,
    payments: defaultPayments({
      giftMintEnabled: true,
      creatorWallet: params.creatorWallet,
      acceptSol: homeChain === "solana",
      acceptAvax: homeChain === "avalanche",
    }),
    status: "importing",
    supply: 0,
    mintedCount: 0,
    artPath: "path-a",
    stackOrder: [],
    layers: [],
    blindMint: false,
    immutableMetadata: true,
    revealTrigger: "manual",
    revealed: true,
    royaltyBps: DEFAULT_ROYALTY_BPS,
    milestones: [],
    fees: {
      ownerPercent: 98,
      holdersPercent: 1,
      buybackPercent: 1,
      locked: false,
    },
    allowlist: [],
    waitlist: [],
    publicMintOpen: true,
    secondaryEnabled: false,
    holderPageUnlocked: false,
    irysPublished: false,
    pendingZipUrl: params.pendingZipUrl,
    importProgress: { done: 0, total: 0 },
    createdAt: now,
    updatedAt: now,
    tokens: [],
  };
}
