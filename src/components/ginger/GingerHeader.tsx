"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchTrigger } from "@/components/GlobalSearch";
import { WalletMenu } from "@/components/WalletMenu";

const LINKS = [
  { label: "Explore", href: "/explore" },
  { label: "Launch", href: "/launch" },
  { label: "Gift", href: "/gift" },
  { label: "Learn", href: "/learn" },
] as const;

function isCurrent(path: string, href: string) {
  if (href === "/explore") return path === "/explore" || path.startsWith("/collection");
  if (href === "/launch") return path === "/launch" || path.startsWith("/launch/");
  if (href === "/gift") return path === "/gift" || path.startsWith("/gift/");
  if (href === "/learn") return path === "/learn" || path === "/faq" || path === "/security" || path === "/about";
  return path === href;
}

export function GingerHeader() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      const bar = document.getElementById("ginger-bar");
      if (bar && !bar.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <header className="bar" id="ginger-bar" data-open={open ? "true" : "false"}>
      <Link className="brand" href="/" aria-label="Ginger — home">
        {/* Logo sizing is owned by the Ginger shell CSS. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ginger-logo" src="/images/ginger.png" alt="Ginger" />
      </Link>
      <nav className="links" aria-label="Primary">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isCurrent(path, item.href) ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="actions">
        <div className="ginger-wallet">
          <WalletMenu compact />
        </div>
        <SearchTrigger variant="icon" className="ginger-search" />
        <Link className="btn ghost" href="/explore">
          Explore
        </Link>
        <Link className="btn solid" href="/launch">
          Launch
        </Link>
        <button
          className="menu"
          type="button"
          aria-label={open ? "Close menu" : "Menu"}
          aria-expanded={open}
          aria-controls="menu-sheet"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          <svg viewBox="0 0 20 14" fill="none" aria-hidden="true">
            <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <nav className="sheet" id="menu-sheet" aria-label="Menu">
          {LINKS.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isCurrent(path, item.href) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
          <div className="ginger-sheet-tools">
            <WalletMenu fullWidth />
          </div>
          <Link className="btn solid" href="/launch">
            Launch
          </Link>
        </nav>
      </div>
    </header>
  );
}
