"use client";

import Link from "next/link";
import { HeaderItem } from "../../../../types/menu";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

const MobileHeaderLink: React.FC<{
  item: HeaderItem;
  activeHash: string;
  setActiveHash: (hash: string) => void;
  onClick?: () => void;
}> = ({ item, activeHash, setActiveHash, onClick }) => {
  const path = usePathname();

  const isActive = (href: string) => {
    if (href.includes("#")) {
      const [hrefPath, hrefHash] = href.split("#");
      return path === hrefPath && activeHash === `#${hrefHash}`;
    }
    return path === href;
  };

  const groupActive =
    isActive(item.href) || Boolean(item.submenu?.some((s) => isActive(s.href)));
  const [submenuOpen, setSubmenuOpen] = useState(groupActive);

  useEffect(() => {
    setActiveHash(window.location.hash);
  }, [path, setActiveHash]);

  const handleLinkClick = (href: string) => {
    setActiveHash(href.includes("#") ? "#" + href.split("#")[1] : "");
    onClick?.();
  };

  const rowCls = (active: boolean) =>
    `flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-base transition ${
      active ? "bg-surface-2 font-semibold text-ink" : "text-ink-body hover:bg-surface-1 hover:text-ink"
    }`;

  if (item.submenu) {
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => setSubmenuOpen((v) => !v)}
          aria-expanded={submenuOpen}
          className={rowCls(groupActive)}
        >
          {item.label}
          <ChevronDown
            className={`h-4 w-4 text-ink-muted transition ${submenuOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {submenuOpen && (
          <div className="mb-1 ml-3 mt-1 space-y-0.5 border-l border-line pl-2">
            {item.submenu.map((subItem) => (
              <Link
                key={subItem.href}
                href={subItem.href}
                onClick={() => handleLinkClick(subItem.href)}
                className={`block rounded-lg px-3 py-2 text-[15px] transition ${
                  isActive(subItem.href)
                    ? "bg-primary/10 text-primary"
                    : "text-ink-body hover:bg-surface-1 hover:text-ink"
                }`}
              >
                {subItem.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link href={item.href} onClick={() => handleLinkClick(item.href)} className={rowCls(isActive(item.href))}>
      {item.label}
    </Link>
  );
};

export default MobileHeaderLink;
