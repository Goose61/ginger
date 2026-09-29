"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { headerData } from "../Header/Navigation/menuData";
import Logo from "./Logo";
import HeaderLink from "../Header/Navigation/HeaderLink";
import MobileHeaderLink from "../Header/Navigation/MobileHeaderLink";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SearchTrigger, useGlobalSearch } from "@/components/GlobalSearch";
import { WalletMenu } from "@/components/WalletMenu";
import { Search } from "lucide-react";

const Header: React.FC = () => {
  const [navbarOpen, setNavbarOpen] = useState(false);
  const [activeHash, setActiveHash] = useState("");
  const path = usePathname();
  const { open: openSearch } = useGlobalSearch();
  const onLaunch = path === "/launch";

  useEffect(() => {
    const handleHashChange = () => setActiveHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <header
      className="sticky top-0 isolate z-50 min-h-[64px] w-full pt-[env(safe-area-inset-top)] backdrop-blur-[14px] sm:min-h-[72px]"
      style={{
        borderBottom: "1px solid var(--header-border)",
        background: "var(--header-bg)",
      }}
    >
      <div className="mx-auto flex min-h-[64px] w-full max-w-[1280px] items-center gap-3 px-3 sm:min-h-[72px] sm:gap-4 sm:px-5">
        {/* Left: brand */}
        <div onClick={() => setActiveHash("")} className="min-w-0 shrink-0 cursor-pointer">
          <Logo />
        </div>

        {/* Center: global search (desktop) */}
        <div className="hidden flex-1 justify-center px-2 lg:flex">
          <SearchTrigger className="w-full" placeholder="Search collections…" />
        </div>

        {/* Right: nav + actions (desktop) */}
        <nav aria-label="Primary" className="ml-auto hidden items-center gap-0.5 lg:flex">
          {headerData.map((item) => (
            <HeaderLink
              key={item.href}
              item={item}
              activeHash={activeHash}
              setActiveHash={setActiveHash}
            />
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {!onLaunch && (
            <Button
              size="lg"
              render={<Link href="/launch" />}
              className="h-10 rounded-full border-primary bg-primary px-4 font-semibold text-white hover:bg-[#b42318]"
            >
              Launch
            </Button>
          )}
          <WalletMenu />
        </div>

        {/* Mobile: search icon + hamburger */}
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search collections"
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-line text-ink-body hover:border-line-strong hover:text-ink lg:hidden"
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>
        <Sheet open={navbarOpen} onOpenChange={setNavbarOpen}>
          <SheetTrigger
            render={
              <button
                className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-line p-2 lg:hidden"
                aria-label="Toggle mobile menu"
              />
            }
          >
            <span className="block h-[1.5px] w-4 bg-ink" />
            <span className="block h-[1.5px] w-4 bg-ink" />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-full max-w-[min(20rem,100vw)] border-l border-line-strong bg-surface-0 p-0"
          >
            <div className="flex items-center justify-between border-b border-line p-4">
              <Logo />
            </div>
            <div className="p-4">
              <button
                type="button"
                onClick={() => {
                  setNavbarOpen(false);
                  // let the sheet close before the dialog takes focus
                  window.setTimeout(openSearch, 150);
                }}
                className="flex h-11 w-full items-center gap-2.5 rounded-full border border-line bg-surface-1 px-4 text-left text-sm text-ink-muted"
              >
                <Search className="h-4 w-4 text-ink-subtle" aria-hidden />
                Search collections
              </button>
            </div>
            <nav aria-label="Mobile" className="flex flex-col items-start px-4">
              {headerData.map((item) => (
                <MobileHeaderLink
                  key={item.href}
                  item={item}
                  activeHash={activeHash}
                  setActiveHash={setActiveHash}
                  onClick={() => setNavbarOpen(false)}
                />
              ))}
            </nav>
            <div className="mt-4 flex w-full flex-col gap-3 border-t border-line p-4">
              {!onLaunch && (
                <Button
                  size="lg"
                  render={<Link href="/launch" />}
                  onClick={() => setNavbarOpen(false)}
                  className="h-11 w-full rounded-full bg-primary font-semibold text-white hover:bg-[#b42318]"
                >
                  Launch a collection
                </Button>
              )}
              <WalletMenu fullWidth onNavigate={() => setNavbarOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default Header;
