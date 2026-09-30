import type { Metadata } from "next";
import { SecurityAuditReport } from "@/components/SecurityAuditReport";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { SITE_URL, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

const TITLE = "Ginger Security — How the NFT Marketplace Is Protected";
const DESCRIPTION =
  "How Ginger protects collectors and creators: wallet custody, verified payments, marketplace controls, and the public security report.";

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "Security", path: "/security" },
];

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/security",
});

export default function SecurityPage() {
  return (
    <main>
      <div className="container px-4 pt-10">
        <Breadcrumbs items={CRUMBS} />
      </div>
      <SecurityAuditReport />
      <div className="container px-4 pb-16">
        <div className="mx-auto max-w-4xl">
          <RelatedLinks current="/security" />
        </div>
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          url: `${SITE_URL}/security`,
          name: TITLE,
          description: DESCRIPTION,
          dateModified: "2026-09-29",
          datePublished: "2026-09-29",
          isPartOf: { "@id": `${SITE_URL}/#website` },
          about: { "@id": `${SITE_URL}/#organization` },
        }}
      />
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
    </main>
  );
}
