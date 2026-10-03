/**
 * Public site links. Socials render only when a real URL is configured
 * (via NEXT_PUBLIC_* env at build time) so we never ship placeholder links.
 */
export const SITE = {
  name: "Ginger",
  tagline: "NFT marketplace on Solana and Avalanche",
  url: "https://www.gingernft.store",
} as const;

export type SocialLink = { id: "x" | "telegram" | "discord"; label: string; href: string; icon: string };

function social(id: SocialLink["id"], label: string, icon: string, href?: string): SocialLink | null {
  if (!href || !/^https?:\/\/[^/]+\/.+/.test(href)) return null; // require a path, not just a domain
  return { id, label, href, icon };
}

export const SOCIAL_LINKS: SocialLink[] = [
  social("x", "X (Twitter)", "fa6-brands:x-twitter", process.env.NEXT_PUBLIC_SOCIAL_X),
  social("telegram", "Telegram", "fa6-brands:telegram", process.env.NEXT_PUBLIC_SOCIAL_TELEGRAM),
  social("discord", "Discord", "fa6-brands:discord", process.env.NEXT_PUBLIC_SOCIAL_DISCORD),
].filter((s): s is SocialLink => s !== null);
