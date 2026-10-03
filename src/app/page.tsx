import type { Metadata } from "next";
import { GingerHero } from "@/components/ginger/GingerHero";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Ginger — See beyond now",
  description: "Everything you need to discover, understand, and explore what is out there.",
  path: "/",
});

export default function HomePage() {
  return <GingerHero />;
}
