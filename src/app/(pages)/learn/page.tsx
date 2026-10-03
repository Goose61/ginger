import type { Metadata } from "next";
import { AboutBody } from "@/components/ginger/AboutBody";
import { LearnTabs } from "@/components/ginger/LearnTabs";
import { PageFrame } from "@/components/ginger/PageFrame";
import Faq from "@/components/Home/Faq";
import { SecurityAuditReport } from "@/components/SecurityAuditReport";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Learn — Ginger",
  description:
    "Answers on launching on Solana or Avalanche, minting onto the chain you choose, wallets, permanent storage, secondary sales, and how Ginger handles custody.",
  path: "/learn",
  noIndex: true,
});

export default function LearnPage() {
  return (
    <PageFrame title="Learn" bare>
      <LearnTabs
        faq={
          <>
            <Faq />
            <RelatedLinks current="/faq" />
          </>
        }
        security={
          <>
            <SecurityAuditReport />
            <RelatedLinks current="/security" />
          </>
        }
        about={
          <>
            <AboutBody />
            <RelatedLinks current="/about" />
          </>
        }
      />
    </PageFrame>
  );
}
