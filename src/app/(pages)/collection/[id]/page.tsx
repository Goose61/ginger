import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getCollection, updateCollection } from "@/lib/store";
import {
  isListedPublicly,
  isTokenReservationActive,
  reconcileCollectionMintState,
  toPublicCollection,
} from "@/lib/public-collection";
import { CollectionMint } from "@/components/CollectionMint";
import { getSolanaNetwork } from "@/lib/solana-config";
import type { Collection } from "@/lib/types";
import {
  resetStaleMintState,
  txSignatureFromMintUrl,
  verifyMintTransaction,
} from "@/lib/verify-mint";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  SITE_URL,
  breadcrumbJsonLd,
  clampMeta,
  collectionPageTitle,
  pageMetadata,
} from "@/lib/seo";
import { collectionContractLinks } from "@/lib/chain-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

function collectionPath(collection: Collection) {
  return `/collection/${collection.slug || collection.id}`;
}

function httpsImage(url?: string | null) {
  return url && /^https:\/\//.test(url) ? url : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let collection: Collection | null = null;
  try {
    collection = await getCollection(id);
  } catch {
    return { robots: { index: false, follow: true } };
  }
  if (!collection || !isListedPublicly(collection)) {
    return { title: { absolute: "Collection not found · Ginger" }, robots: { index: false, follow: false } };
  }
  const path = collectionPath(collection);
  const description =
    collection.description?.trim() ||
    `Mint ${collection.name} on Ginger. Pay with SOL or card, mint onto Solana or Avalanche, and keep the NFT in your wallet.`;
  return pageMetadata({
    title: collectionPageTitle(collection.name),
    description,
    path,
    image: httpsImage(collection.logoUrl),
    imageAlt: `${collection.name} on Ginger`,
  });
}

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
  if (collection.slug && id !== collection.slug) {
    permanentRedirect(collectionPath(collection));
  }

  // Only heal in-flight reserved mints. Verifying every sold token on each page
  // load hammers RPC and blocks navigation back to Market.
  const pending = collection.tokens.find(
    (t) => t.reservedBy && !t.owner && isTokenReservationActive(t, collection),
  );
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

  const reconciled = reconcileCollectionMintState(collection);
  if (reconciled.changed) {
    const saved = await updateCollection(collection.id, () => reconciled.collection);
    if (saved) collection = saved;
    else collection = reconciled.collection;
  }

  const publicCollection = toPublicCollection({
    ...collection,
    layers: [],
  });
  const path = collectionPath(collection);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: collection.name, path },
  ];
  const contractLinks = collectionContractLinks(collection);
  const description = clampMeta(
    collection.description?.trim() ||
      `Mint ${collection.name} on Ginger. Choose Solana or Avalanche at mint.`,
  );

  return (
    <>
      <link rel="preconnect" href="https://gateway.irys.xyz" />
      <div className="container mx-auto max-w-6xl px-4 pt-6">
        <Breadcrumbs items={crumbs} />
      </div>
      <Suspense fallback={<div className="container mx-auto px-4 py-20 text-white/50">Loading…</div>}>
        <CollectionMint initial={publicCollection} />
      </Suspense>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: collection.name,
          description,
          url: `${SITE_URL}${path}`,
          datePublished: collection.createdAt,
          dateModified: collection.updatedAt,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          ...(httpsImage(collection.logoUrl) ? { image: collection.logoUrl } : {}),
          ...(contractLinks.length
            ? { sameAs: contractLinks.map((link) => link.href) }
            : {}),
        }}
      />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
    </>
  );
}
