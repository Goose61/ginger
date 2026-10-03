import Link from "next/link";
import { SiteFrame } from "@/components/ginger/SiteFrame";

export default function NotFound() {
  return (
    <SiteFrame>
      <main className="container px-4 py-40 text-center">
        <title>Page not found · Ginger NFT Marketplace</title>
        <meta name="robots" content="noindex, follow" />
        <p className="text-sm uppercase tracking-widest text-primary">404</p>
        <h1 className="mt-3 text-4xl font-medium text-white">Page not found</h1>
        <p className="mt-3 text-white/50">That route is not on this marketplace.</p>
        <Link href="/explore" className="mt-8 inline-block rounded-lg bg-primary px-5 py-2.5 text-white">
          Back to market
        </Link>
      </main>
    </SiteFrame>
  );
}
