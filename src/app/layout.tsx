import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import "@/components/ginger/ginger.css";
import ScrollToTop from "@/components/ScrollToTop";
import { FeedbackPill } from "@/components/FeedbackPill";
import { SolanaAdapterProvider } from "@/components/SolanaAdapterProvider";
import { WalletProvider } from "@/components/WalletProvider";
import { EvmWalletRoot } from "@/components/EvmWalletRoot";
import { EvmWalletProvider } from "@/components/EvmWalletProvider";
import { GlobalSearchProvider } from "@/components/GlobalSearch";
import { Analytics } from "@/components/seo/Analytics";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  DEFAULT_DESCRIPTION,
  HOME_TITLE,
  OG_IMAGE,
  SITE_URL,
  organizationJsonLd,
} from "@/lib/seo";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;
const bingVerification = process.env.BING_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: "%s",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: "Ginger",
  authors: [{ name: "Ginger", url: SITE_URL }],
  creator: "Ginger",
  publisher: "Ginger",
  category: "NFT marketplace",
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.ico",
    apple: "/images/ginger.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Ginger",
    title: HOME_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: OG_IMAGE, alt: "Ginger NFT marketplace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE],
  },
  ...(googleVerification || bingVerification
    ? {
        verification: {
          ...(googleVerification ? { google: googleVerification } : {}),
          ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}),
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-[family-name:var(--font-body)]">
        <JsonLd data={organizationJsonLd()} />
        <Analytics />
        <SolanaAdapterProvider>
          <EvmWalletRoot>
            <EvmWalletProvider>
              <WalletProvider>
                <GlobalSearchProvider>
                  <div className="relative z-[2] pb-[var(--page-bottom-gutter)]">
                    {children}
                  </div>
                  <ScrollToTop />
                  <FeedbackPill />
                </GlobalSearchProvider>
              </WalletProvider>
            </EvmWalletProvider>
          </EvmWalletRoot>
        </SolanaAdapterProvider>
      </body>
    </html>
  );
}
