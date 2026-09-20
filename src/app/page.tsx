import { MarketHome } from "@/components/MarketHome";

/** Fetch live collections at request time — requires MONGODB_URI at runtime. */
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <MarketHome />;
}
