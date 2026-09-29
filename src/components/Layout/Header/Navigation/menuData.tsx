import { HeaderItem } from "@/types/menu";

/**
 * Primary nav. Collectors: Explore. Creators: Launch / Gift.
 * Reference material lives under "Learn" so the bar stays to three verbs + one dropdown.
 */
export const headerData: HeaderItem[] = [
  { label: "Explore", href: "/" },
  { label: "Launch", href: "/launch" },
  { label: "Gift", href: "/gift" },
  {
    label: "Learn",
    href: "/faq",
    submenu: [
      { label: "FAQ", href: "/faq" },
      { label: "Security", href: "/security" },
    ],
  },
];

/** Flat list for footer columns. */
export const exploreLinks = [
  { label: "Market", href: "/" },
  { label: "Gift an NFT", href: "/gift" },
  { label: "FAQ", href: "/faq" },
];

export const createLinks = [
  { label: "Launch a collection", href: "/launch" },
  { label: "Fees & payouts", href: "/faq" },
];

export const trustLinks = [
  { label: "Security", href: "/security" },
  { label: "Security report (.md)", href: "/api/security/report" },
];
