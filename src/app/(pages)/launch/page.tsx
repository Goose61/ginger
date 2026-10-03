import type { Metadata } from "next";
import { PageFrame } from "@/components/ginger/PageFrame";
import { LaunchWizard } from "@/components/LaunchWizard";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "Launch", path: "/launch" },
];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}): Promise<Metadata> {
  const { id } = await searchParams;
  return pageMetadata({
    title: "Launch an NFT Collection on Solana or Avalanche",
    description:
      "Upload finished art, pick a home chain, and let collectors mint onto Solana or Avalanche. Storage is permanent, fees are shown up front, and you pay from your own wallet.",
    path: "/launch",
    noIndex: Boolean(id),
  });
}

export default async function LaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <PageFrame title="Launch" surfaceId="launch-content" surfaceLabel="Launch content">
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={CRUMBS} />
      </div>
      <LaunchWizard resumeId={id} />
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
    </PageFrame>
  );
}
