import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCollection } from "@/lib/store";
import { isListedPublicly, toPublicCollection } from "@/lib/public-collection";
import { CollectionMint } from "@/components/CollectionMint";
import { getSolanaNetwork } from "@/lib/solana-config";
import type { Collection } from "@/lib/types";
import {
  resetStaleMintState,
  txSignatureFromMintUrl,
  verifyMintTransaction,
} from "@/lib/verify-mint";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let collection: Collection | null = null;
  try {
    collection = await getCollection(id);
  } catch (err) {
    console.error("[collection page] database unavailable", err);
    return (
      <main className="container mx-auto max-w-xl px-4 py-20 pt-16 text-center">
        <h1 className="text-2xl text-white">Collection is temporarily unavailable</h1>
        <p className="mt-3 text-sm text-white/50">
          The marketplace could not reach the database. Refresh in a moment.
        </p>
      </main>
    );
  }
  if (!collection) notFound();
  if (!isListedPublicly(collection)) {
    notFound();
  }

  // Only heal in-flight reserved mints. Verifying every sold token on each page
  // load hammers RPC and blocks navigation back to Market.
  const pending = collection.tokens.find((t) => t.reservedBy && !t.owner);
  if (pending) {
    const sig = txSignatureFromMintUrl(pending.mintTxUrl);
    if (sig) {
      const verified = await verifyMintTransaction(sig, getSolanaNetwork());
      if (!verified.ok && /not found/i.test(verified.reason)) {
        await resetStaleMintState(collection.id, pending.tokenId);
        collection = (await getCollection(id)) ?? collection;
      }
    }
  }

  const publicCollection = toPublicCollection({
    ...collection,
    layers: [],
  });

  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-20 text-white/50">Loading…</div>}>
      <CollectionMint initial={publicCollection} />
    </Suspense>
  );
}
