import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "blob.vercel-storage.com" },
      { protocol: "https", hostname: "gateway.irys.xyz" },
      { protocol: "https", hostname: "arweave.net" },
    ],
    // unoptimized: false — let Next.js optimize images (better for Vercel)
  },
  eslint: {
    // Re-enable ESLint during builds so CI catches real issues
    ignoreDuringBuilds: false,
  },
  // Do not externalize sharp or @irys/bundles — Turbopack/Vercel must bundle them.
  serverExternalPackages: ["yauzl"],
  transpilePackages: [
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-phantom",
    "@solana/wallet-adapter-solflare",
    "@metamask/connect-solana",
  ],
};

export default nextConfig;
