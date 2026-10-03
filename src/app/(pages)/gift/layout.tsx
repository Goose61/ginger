import type { Metadata } from "next";
import { PageFrame } from "@/components/ginger/PageFrame";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "Gift", path: "/gift" },
];

export const metadata: Metadata = pageMetadata({
  title: "Gift a $PIZZA NFT on Solana from the Ginger Market",
  description:
    "Send a 1/1 $PIZZA gift NFT on Solana. Upload art, choose a recipient, and pay fees from your wallet. The recipient gets the NFT for free.",
  path: "/gift",
});

export default function GiftLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFrame title="Gift" surfaceId="gift-content" surfaceLabel="Gift content">
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={CRUMBS} />
      </div>
      {children}
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
    </PageFrame>
  );
}
