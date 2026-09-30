import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import {
  CONTENT_UPDATED,
  SITE_URL,
  breadcrumbJsonLd,
  pageMetadata,
} from "@/lib/seo";

const TITLE = "About Ginger — Solana NFT Marketplace for Creators";
const DESCRIPTION =
  "Ginger is a Solana NFT marketplace for launching collections, minting with SOL or card, and reselling in one place. You keep custody in your wallet.";

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "About", path: "/about" },
];

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/about",
});

export default function AboutPage() {
  return (
    <main className="py-10 text-foreground">
      <div className="container px-4">
        <div className="mx-auto max-w-3xl">
          <Breadcrumbs items={CRUMBS} />
          <p className="mt-8 text-sm uppercase tracking-[0.18em] text-primary">The marketplace</p>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">About Ginger</h1>
          <p className="mt-3 text-muted-foreground">
            Ginger is the Solana NFT marketplace at gingernft.store. Creators launch collections
            here. Collectors mint and resell here. The NFT stays in your wallet.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Updated{" "}
            <time dateTime={CONTENT_UPDATED}>30 September 2026</time>
          </p>

          <section className="mt-10 space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">What you can do</h2>
            <p>
              Launch a collection from a ZIP of finished art, set a USD mint price, and go live
              from your own wallet. Collectors pay with SOL or with card and USDC through SlicePay.
              When a drop sells out, it stays on this market for secondary listings and, if the
              creator unlocks it, a holder lounge.
            </p>
          </section>

          <section className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">Custody and review</h2>
            <p>
              Ginger never holds private keys. Paid mints are tied to the connected wallet, the
              collection, and the token being purchased. The public security review, including what
              was fixed and what is still monitored, is on the{" "}
              <Link href="/security" className="text-primary underline-offset-2 hover:underline">
                Security page
              </Link>
              .
            </p>
            <p>
              Questions and vulnerability reports go through the feedback button on the site, or by
              email to slicepay@slicechain.io. Please share reproduction steps privately before
              posting an exploitable issue.
            </p>
          </section>

          <RelatedLinks current="/about" />
        </div>
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "@id": `${SITE_URL}/about#webpage`,
          url: `${SITE_URL}/about`,
          name: TITLE,
          description: DESCRIPTION,
          dateModified: CONTENT_UPDATED,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          about: { "@id": `${SITE_URL}/#organization` },
          publisher: { "@id": `${SITE_URL}/#organization` },
        }}
      />
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
    </main>
  );
}
