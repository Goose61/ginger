import Link from "next/link";
import { PUBLIC_PAGES } from "@/lib/seo";

/** Internal links to the indexable product pages, minus the page you are on. */
export function RelatedLinks({ current }: { current: string }) {
  const links = PUBLIC_PAGES.filter((p) => p.path !== "/" && p.path !== current);
  return (
    <nav aria-label="Related pages" className="mt-12 border-t border-white/10 pt-8">
      <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-white/45">On Ginger</h2>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <li>
          <Link href="/explore" className="text-sm text-primary underline-offset-2 hover:underline">
            Market
          </Link>
        </li>
        {links.map((p) => (
          <li key={p.path}>
            <Link href={p.path} className="text-sm text-primary underline-offset-2 hover:underline">
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
