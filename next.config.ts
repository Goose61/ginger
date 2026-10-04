import path from "path";
import type { NextConfig } from "next";

const emptyPolyfill = path.join(process.cwd(), "src/lib/empty-polyfill.js");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Fold route CSS into the HTML so the homepage is not waiting on four stylesheets.
  experimental: {
    inlineCss: true,
  },
  turbopack: {
    resolveAlias: {
      "next/dist/build/polyfills/polyfill-module": "./src/lib/empty-polyfill.js",
    },
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.alias["next/dist/build/polyfills/polyfill-module"] = emptyPolyfill;
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]next[\\/]dist[\\/]build[\\/]polyfills[\\/]polyfill-module(\.js)?$/,
          emptyPolyfill,
        ),
      );
    }
    return config;
  },
  async redirects() {
    return [
      { source: "/market", destination: "/explore", permanent: true },
      { source: "/marketplace", destination: "/explore", permanent: true },
      { source: "/discover", destination: "/explore", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
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
