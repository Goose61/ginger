import React, { FC } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { ArrowRight } from "lucide-react";
import Logo from "../Header/Logo";
import { createLinks, exploreLinks, trustLinks } from "../Header/Navigation/menuData";
import { CreatorDashboardLink } from "@/components/CreatorDashboardLink";
import { SITE, SOCIAL_LINKS } from "@/lib/site-config";

const Footer: FC = () => {
  return (
    <footer className="border-t border-line bg-surface-0 pt-12 sm:pt-16">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-2 gap-8 pb-12 md:grid-cols-12 md:gap-6">
          {/* Brand */}
          <div className="col-span-2 flex flex-col gap-5 md:col-span-5">
            <Logo />
            <p className="max-w-sm text-sm leading-6 text-ink-muted">
              Launch collections, mint on Solana, and keep resale in one place. Your wallet, your
              keys.
            </p>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
              Built on Solana · Metaplex Core
            </span>
            {SOCIAL_LINKS.length > 0 && (
              <ul className="flex items-center gap-4">
                {SOCIAL_LINKS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={s.label}
                      className="text-ink-muted transition hover:text-ink"
                    >
                      <Icon icon={s.icon} width="22" height="22" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Column title="Explore" links={exploreLinks} />
          <Column title="Create" links={createLinks}>
            <li>
              <CreatorDashboardLink className="text-sm text-ink-muted hover:text-ink" label="Creator dashboard" />
            </li>
          </Column>
          <Column title="Trust" links={trustLinks} />
        </div>

        <div className="flex flex-col gap-4 border-t border-line py-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.name}. {SITE.tagline}.
          </p>
          <Link href="/launch" className="inline-flex items-center gap-1.5 text-ink-body hover:text-ink">
            Ready to launch a collection?
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </footer>
  );
};

function Column({
  title,
  links,
  children,
}: {
  title: string;
  links: { label: string; href: string }[];
  children?: React.ReactNode;
}) {
  return (
    <div className="md:col-span-2 md:last:col-span-3">
      <h4 className="eyebrow mb-4">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-sm text-ink-muted transition hover:text-ink">
              {item.label}
            </Link>
          </li>
        ))}
        {children}
      </ul>
    </div>
  );
}

export default Footer;
