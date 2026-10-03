import type { Metadata } from "next";
import Faq from "@/components/Home/Faq";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { FAQ_ITEMS, FAQ_UPDATED } from "@/lib/faq-content";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "FAQ", path: "/faq" },
];

export const metadata: Metadata = pageMetadata({
  title: "Ginger NFT Marketplace FAQ: Fees, Destination Mints, and Storage",
  description:
    "Answers on launching on Solana or Avalanche, minting onto the chain you choose, wallets, permanent storage, secondary sales, and how Ginger handles custody.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <main>
      <div className="container px-4 pt-10">
        <Breadcrumbs items={CRUMBS} />
      </div>
      <Faq />
      <div className="container px-4 pb-16">
        <div className="mx-auto max-w-3xl">
          <RelatedLinks current="/faq" />
        </div>
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          dateModified: FAQ_UPDATED,
          mainEntity: FAQ_ITEMS.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }}
      />
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
    </main>
  );
}
