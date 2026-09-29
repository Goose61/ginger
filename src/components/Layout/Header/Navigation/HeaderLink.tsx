"use client";
import Link from "next/link";
import { HeaderItem } from "../../../../types/menu";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const HeaderLink: React.FC<{
  item: HeaderItem;
  activeHash: string;
  setActiveHash: (hash: string) => void;
}> = ({ item, activeHash, setActiveHash }) => {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const path = usePathname();

  const openMenu = () => {
    if (!item.submenu) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setSubmenuOpen(true);
  };
  const closeMenu = () => {
    // small grace period so the pointer can cross the gap into the dropdown
    closeTimer.current = window.setTimeout(() => setSubmenuOpen(false), 120);
  };

  useEffect(() => {
    setActiveHash(window.location.hash);
  }, [path, setActiveHash]);

  const handleLinkClick = (href: string) => {
    if (href.includes("#")) {
      setActiveHash("#" + href.split("#")[1]);
    } else {
      setActiveHash("");
    }
    setSubmenuOpen(false);
  };

  const isActive = (href: string) => {
    if (href.includes("#")) {
      const [hrefPath, hrefHash] = href.split("#");
      return path === hrefPath && activeHash === `#${hrefHash}`;
    }
    return path === href;
  };

  const groupActive =
    isActive(item.href) || Boolean(item.submenu?.some((s) => isActive(s.href)));

  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={closeMenu}>
      <Link
        href={item.href}
        onClick={() => handleLinkClick(item.href)}
        aria-haspopup={item.submenu ? "menu" : undefined}
        aria-expanded={item.submenu ? submenuOpen : undefined}
        onFocus={openMenu}
        className={`relative inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-[family-name:var(--font-body)] text-[0.92rem] font-medium transition-colors duration-150 hover:text-ink ${
          groupActive ? "bg-surface-2 text-ink" : "text-ink-body"
        }`}
      >
        {item.label}
        {item.submenu && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-ink-muted transition ${submenuOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        )}
      </Link>
      {item.submenu && submenuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+0.4rem)] z-50 w-52 rounded-2xl border border-line-strong bg-surface-3 p-1 shadow-[0_24px_48px_-8px_rgba(0,0,0,0.7)]"
        >
          {item.submenu.map((subItem) => (
            <Link
              key={subItem.href}
              role="menuitem"
              href={subItem.href}
              onClick={() => handleLinkClick(subItem.href)}
              className={`block rounded-xl px-3 py-2 text-sm transition ${
                isActive(subItem.href)
                  ? "bg-primary/10 text-primary"
                  : "text-ink-body hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {subItem.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default HeaderLink;
