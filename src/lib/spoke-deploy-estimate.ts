import type { Address } from "viem";
import type { Collection } from "./types";
import { defaultPayments } from "./types";
import {
  createCollectionTxRequest,
  estimateEvmGas,
  factoryAddressOrThrow,
} from "./evm-collection";
import { nativeUsdForDestination } from "./evm-native-usd";
import {
  type EvmSpokeChainId,
  evmSpokeChainMeta,
  isEvmNftChainId,
  parseEvmSpokeChain,
} from "./evm-spoke-chains";

export type SpokeDeployEstimateRow = {
  spokeChain: EvmSpokeChainId;
  label: string;
  chainId: number;
  nativeSymbol: string;
  deployReady: boolean;
  note?: string;
  gasNative?: number;
  gasUsd?: number;
};

const ZERO_OWNER = "0x0000000000000000000000000000000000000001" as Address;

export function collectionStubForSpokeEstimate(params: {
  name?: string;
  symbol?: string;
  supply?: number;
  creatorWallet?: string;
}): Collection {
  const wallet = params.creatorWallet?.trim() || ZERO_OWNER;
  return {
    id: "spoke-estimate-stub",
    slug: "stub",
    name: params.name?.trim() || "Collection",
    symbol: params.symbol?.trim() || "GNG",
    description: "",
    nameTemplate: "#{{id}}",
    chain: "solana",
    homeChain: "solana",
    status: "draft",
    supply: params.supply ?? 1000,
    mintedCount: 0,
    artPath: "path-b",
    stackOrder: [],
    layers: [],
    blindMint: false,
    revealTrigger: "disabled",
    revealed: false,
    milestones: [],
    payments: defaultPayments({ creatorWallet: wallet }),
    fees: { ownerPercent: 100, holdersPercent: 0, buybackPercent: 0, locked: false },
    allowlist: [],
    waitlist: [],
    publicMintOpen: true,
    secondaryEnabled: false,
    holderPageUnlocked: false,
    irysPublished: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tokens: [],
  };
}

export async function estimateSpokeDeployRows(params: {
  spokeChainIds: string[];
  collection?: Collection;
  stub?: { name?: string; symbol?: string; supply?: number; creatorWallet?: string };
  owner?: Address;
}): Promise<SpokeDeployEstimateRow[]> {
  const col = params.collection ?? collectionStubForSpokeEstimate(params.stub ?? {});
  const owner = (params.owner ??
    (col.payments.creatorWallet.startsWith("0x")
      ? col.payments.creatorWallet
      : ZERO_OWNER)) as Address;

  const rows: SpokeDeployEstimateRow[] = [];
  for (const raw of params.spokeChainIds) {
    const spokeChain = parseEvmSpokeChain(raw);
    if (!isEvmNftChainId(spokeChain)) continue;
    const meta = evmSpokeChainMeta(spokeChain);
    if (!meta.deployReady) {
      rows.push({
        spokeChain,
        label: meta.label,
        chainId: meta.chainId,
        nativeSymbol: meta.nativeSymbol,
        deployReady: false,
        note: meta.note,
      });
      continue;
    }
    try {
      factoryAddressOrThrow(spokeChain);
      const tx = createCollectionTxRequest(col, owner, spokeChain);
      const est = await estimateEvmGas({
        to: tx.to,
        data: tx.data,
        account: owner,
        spokeChain,
      });
      const gasNative = Number(est.feeWei) / 1e18;
      const { usd } = await nativeUsdForDestination(spokeChain as import("./types").MintDestination);
      rows.push({
        spokeChain,
        label: meta.label,
        chainId: meta.chainId,
        nativeSymbol: meta.nativeSymbol,
        deployReady: true,
        gasNative,
        gasUsd: gasNative * usd,
      });
    } catch (e) {
      rows.push({
        spokeChain,
        label: meta.label,
        chainId: meta.chainId,
        nativeSymbol: meta.nativeSymbol,
        deployReady: false,
        note: e instanceof Error ? e.message : "Estimate failed",
      });
    }
  }
  return rows;
}
