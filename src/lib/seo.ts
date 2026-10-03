import type { Metadata } from "next";
import { SITE, SOCIAL_LINKS } from "@/lib/site-config";

/** Canonical origin. Apex gingernft.store redirects here. */
export const SITE_URL = SITE.url.replace(/\/$/, "");

export const OG_IMAGE = "/images/ginger.png";

export const HOME_TITLE = "Ginger NFT Marketplace — Launch on Solana or Avalanche";

export const DEFAULT_DESCRIPTION =
  "Launch NFT collections on Solana or Avalanche. Collectors mint onto the chain they choose, pay that chain’s gas, and resell on Ginger. Art is stored permanently, and you keep the keys in your wallet.";

/** Visible and schema freshness for editorial pages. */
export const CONTENT_UPDATED = "2026-10-03";

export type PublicPage = {
  path: string;
  label: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
};

/** Indexable routes. Alias URLs (/market, /marketplace, /discover) 308 to /explore. */
export const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", label: "Home", changeFrequency: "weekly", priority: 1 },
  { path: "/explore", label: "Explore", changeFrequency: "daily", priority: 0.95 },
  { path: "/launch", label: "Launch", changeFrequency: "weekly", priority: 0.9 },
  { path: "/gift", label: "Gift", changeFrequency: "weekly", priority: 0.8 },
  { path: "/faq", label: "FAQ", changeFrequency: "monthly", priority: 0.7 },
  { path: "/security", label: "Security", changeFrequency: "monthly", priority: 0.6 },
  { path: "/about", label: "About", changeFrequency: "monthly", priority: 0.5 },
];

export function absoluteUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function clampMeta(text: string, max = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return `${base}…`;
}

/** Keep collection titles near the 50–60 character SERP window without cutting the brand. */
export function collectionPageTitle(name: string) {
  const suffix = " — Mint on Ginger";
  const full = `${name}${suffix}`;
  if (full.length <= 60) return full;
  const room = 60 - suffix.length - 1;
  return `${name.slice(0, Math.max(room, 8)).trimEnd()}…${suffix}`;
}

type PageSeo = {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
  image?: string;
  imageAlt?: string;
};

export function pageMetadata({
  title,
  description,
  path,
  noIndex,
  image,
  imageAlt,
}: PageSeo): Metadata {
  const canonical = absoluteUrl(path);
  const desc = clampMeta(description);
  const img = image || OG_IMAGE;
  return {
    title: { absolute: title },
    description: desc,
    alternates: { canonical },
    robots: noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: canonical,
      siteName: SITE.name,
      title,
      description: desc,
      images: [{ url: img, alt: imageAlt || "Ginger NFT marketplace" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [img],
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE.name,
        url: SITE_URL,
        logo: absoluteUrl(OG_IMAGE),
        description: DEFAULT_DESCRIPTION,
        sameAs: SOCIAL_LINKS.map((s) => s.href),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: `${SITE.name} NFT marketplace`,
        description: DEFAULT_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function jsonLdString(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
