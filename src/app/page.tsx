import type { Metadata } from "next";
import { MarketHome } from "@/components/MarketHome";
import { DEFAULT_DESCRIPTION, HOME_TITLE, pageMetadata } from "@/lib/seo";

/** Fetch live collections at request time — requires MONGODB_URI at runtime. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: HOME_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: "/",
});

export default function HomePage() {
  return <MarketHome />;
}
