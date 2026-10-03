import type { Metadata } from "next";
import { AboutBody } from "@/components/ginger/AboutBody";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import {
  CONTENT_UPDATED,
  SITE_URL,
  breadcrumbJsonLd,
  pageMetadata,
} from "@/lib/seo";

const TITLE = "About Ginger — NFT Marketplace on Solana and Avalanche";
const DESCRIPTION =
  "Ginger is an NFT marketplace for launching collections on Solana or Avalanche, minting onto the chain you choose, and reselling in one place. You keep custody in your wallet.";

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
          <div className="mt-8">
            <AboutBody />
          </div>
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
