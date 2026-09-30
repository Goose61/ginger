import type { Metadata } from "next";
import { Bricolage_Grotesque, Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Layout/Header";
import Footer from "@/components/Layout/Footer";
import ScrollToTop from "@/components/ScrollToTop";
import { FeedbackPill } from "@/components/FeedbackPill";
import Aoscompo from "@/utils/aos";
import { SolanaAdapterProvider } from "@/components/SolanaAdapterProvider";
import { WalletProvider } from "@/components/WalletProvider";
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

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800"],
});

const body = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
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
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable} font-[family-name:var(--font-body)]`}>
        <JsonLd data={organizationJsonLd()} />
        <Analytics />
        <SolanaAdapterProvider>
          <WalletProvider>
            <GlobalSearchProvider>
              <div className="flour" aria-hidden />
              <Header />
              <div className="relative z-[2] pb-[var(--page-bottom-gutter)]">
                <Aoscompo>
                  {children}
                  <Footer />
                </Aoscompo>
              </div>
              <ScrollToTop />
              <FeedbackPill />
            </GlobalSearchProvider>
          </WalletProvider>
        </SolanaAdapterProvider>
      </body>
    </html>
  );
}
