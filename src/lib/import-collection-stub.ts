import { slugify } from "@/lib/store";
import { defaultPayments, type Collection } from "@/lib/types";

const DEFAULT_ROYALTY_BPS = 500;

export function buildImportingCollectionStub(params: {
  id: string;
  name: string;
  description: string;
  creatorWallet: string;
  pendingZipUrl?: string;
}): Collection {
  const now = new Date().toISOString();
  return {
    id: params.id,
    slug: slugify(params.name),
    name: params.name,
    symbol: params.name.slice(0, 6).toUpperCase().replace(/\s/g, ""),
    description: params.description,
    nameTemplate: "{name} #{id}",
    chain: "solana",
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
    payments: defaultPayments({ giftMintEnabled: true, creatorWallet: params.creatorWallet }),
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
