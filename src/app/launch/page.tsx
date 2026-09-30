import type { Metadata } from "next";
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
    title: "Launch a Solana NFT Collection on Ginger Marketplace",
    description:
      "Upload finished art, set a mint price, and go live on Ginger. Storage is permanent, fees are shown up front, and you pay from your own wallet.",
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
    <>
      <div className="container mx-auto max-w-4xl px-4 pt-8">
        <Breadcrumbs items={CRUMBS} />
      </div>
      <LaunchWizard resumeId={id} />
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
    </>
  );
}
