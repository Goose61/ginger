import type { Collection } from "./types";
import { buildGiftTransaction } from "./mint-nft";
import { tokenName } from "./collection-ui";
import type { SolanaNetwork } from "./solana-config";

/** Build Metaplex Core pending mint for a marketplace token after payment. */
export async function buildPendingMintForToken(params: {
  collection: Collection;
  tokenId: number;
  payer: string;
  recipient: string;
  network: SolanaNetwork;
  /** Atomic pay-and-mint (SOL): embed the sale-price transfer + USD snapshot in the mint tx. */
  payment?: { recipient: string; lamports: number };
  saleUsd?: number;
}) {
  const { collection, tokenId, payer, recipient, network } = params;
  const token = collection.tokens.find((t) => t.tokenId === tokenId);
  if (!token) throw new Error("Token not found");
  if (!token.metadataUri?.startsWith("http")) {
    throw new Error("Token metadata not published. Run go-live publish first");
  }

  /** Only mint into a Core collection when this drop has its own on-chain collection. */
  const coreCollectionAddress = collection.coreCollectionAddress ?? null;

  const txResult = await buildGiftTransaction({
    name: tokenName(collection, token),
    metadataUri: token.metadataUri,
    recipient,
    payer,
    network,
    coreCollectionAddress,
    immutableMetadata: collection.immutableMetadata !== false,
    payment: params.payment,
    saleUsd: params.saleUsd,
  });

  if (!txResult) {
    throw new Error(
      "On-chain mint unavailable. Set ARWEAVE_SOLANA_KEY (platform wallet) in environment variables",
    );
  }

  return { token, txResult };
}
