import { SECURITY_FAQ_ITEMS } from "@/lib/security-audit-content";
import { CONTENT_UPDATED } from "@/lib/seo";

export type FaqItem = { question: string; answer: string };

/** Search-intent answers. Kept in a server-safe module so FAQ schema matches the page. */
export const MARKETPLACE_FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is this marketplace?",
    answer:
      "Ginger is a Solana NFT marketplace for launching collections, running primary mints, and listing secondary sales in the same product. Collections do not graduate to another site.",
  },
  {
    question: "What can I launch here?",
    answer:
      "Any collection you own. The main path is a ZIP of finished images. Optional generative trait-layer ZIPs are still available in the launch wizard. Set metadata, fees, and a USD mint price, then go live.",
  },
  {
    question: "Do I need to write metadata myself?",
    answer:
      "No. You can include metadata files in your ZIP, or set name, description, symbol, and royalties in the wizard. We fill in the rest and compute overall rarity ranks from traits.",
  },
  {
    question: "How do collectors pay?",
    answer:
      "Creators can accept SlicePay (card / USDC) and SOL. Every method is quoted from a live SOL/USD rate against the same USD mint price. There is no meme-token discount.",
  },
  {
    question: "Where is the art stored?",
    answer:
      "Images and metadata are published permanently when you click Go live. You pay storage from your connected wallet. Until then, files stay in your browser so you can preview the launch.",
  },
  {
    question: "What happens after a collection sells out?",
    answer:
      "It stays listed here. Sold out is a milestone. Creators can unlock a holder lounge, snapshots, and native secondary listings on this market.",
  },
  {
    question: "What fees does Ginger charge?",
    answer:
      "No launch fee unless you add Featured Market (+$50 for 14 days at the top of Market). Primary mints: 0.7% platform + 0.3% trade tax (1% total, deducted before your creator split). Secondary sales: 0.5%. You configure how your share splits across creator, holders, and buyback treasury. Payment processing is covered by Ginger, so buyers and creators never see a checkout surcharge.",
  },
  {
    question: "How much does it cost to launch an NFT collection?",
    answer:
      "Launching is free. You pay permanent storage from your wallet when you go live, plus an optional $50 if you want the collection featured on Market for 14 days. Ginger does not charge a separate launch fee.",
  },
  {
    question: "Which wallets work with Ginger?",
    answer:
      "Phantom, Solflare, Backpack, and MetaMask can connect. Card and USDC checkout uses SlicePay, which works with Solflare, Backpack, and MetaMask. Phantom is not supported for SlicePay.",
  },
  {
    question: "Can I resell an NFT I minted on Ginger?",
    answer:
      "Yes, when that collection has secondary listings turned on. The NFT stays in your wallet until it sells. Secondary sales on Ginger carry a 0.5% marketplace fee.",
  },
  {
    question: "Is there a gift mint or allowlist?",
    answer:
      "Yes. After launch, the creator dashboard can gift unminted pieces to any wallet for free (you only pay on-chain rent). Allowlist and waitlist are in the launch checklist, and buyers can gift a mint when you enable that option.",
  },
];

export const FAQ_ITEMS: FaqItem[] = [...MARKETPLACE_FAQ_ITEMS, ...SECURITY_FAQ_ITEMS];

export const FAQ_UPDATED = CONTENT_UPDATED;
