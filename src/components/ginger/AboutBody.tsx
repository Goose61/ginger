import Link from "next/link";
import { CONTENT_UPDATED } from "@/lib/seo";

/** Shared About copy used by /about and the Learn tab. */
export function AboutBody() {
  return (
    <>
      <p className="text-sm uppercase tracking-[0.18em] text-primary">The marketplace</p>
      <h1 className="mt-2 text-3xl font-semibold text-foreground md:text-4xl">About Ginger</h1>
      <p className="mt-3 text-muted-foreground">
        Ginger is the NFT marketplace at gingernft.store. Creators launch collections on
        Solana or Avalanche. Collectors mint onto the chain they choose and resell here. The
        NFT stays in your wallet.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Updated <time dateTime={CONTENT_UPDATED}>3 October 2026</time>
      </p>

      <section className="mt-10 space-y-3 text-sm leading-6 text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">What you can do</h2>
        <p>
          Launch a collection from a ZIP of finished art, pick Solana or Avalanche as home,
          and go live from your own wallet. Collectors mint onto Solana, Avalanche C-Chain, or
          a Fuji L1, and pay that destination’s gas. When a drop sells out, it stays on this
          market for secondary listings and, if the creator unlocks it, a holder lounge.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-6 text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">Custody and review</h2>
        <p>
          Ginger never holds private keys. Paid mints are tied to the connected wallet, the
          collection, and the token being purchased. The public security review, including what
          was fixed and what is still monitored, is on the{" "}
          <Link href="/security" className="text-primary underline-offset-2 hover:underline">
            Security page
          </Link>
          .
        </p>
        <p>
          Questions and vulnerability reports go through the feedback button on the site, or by
          email to slicepay@slicechain.io. Please share reproduction steps privately before
          posting an exploitable issue.
        </p>
      </section>
    </>
  );
}
