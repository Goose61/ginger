import type { Metadata } from "next";
import { PageFrame } from "@/components/ginger/PageFrame";
import { MarketHome } from "@/components/MarketHome";
import { DEFAULT_DESCRIPTION, HOME_TITLE, pageMetadata } from "@/lib/seo";

/** Fetch live collections at request time — requires MONGODB_URI at runtime. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: HOME_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: "/explore",
});

export default function ExplorePage() {
  return (
    <PageFrame title="Explore" surfaceId="explore-content" surfaceLabel="Explore content">
      <MarketHome />
    </PageFrame>
  );
}
