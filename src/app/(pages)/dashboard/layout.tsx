import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Creator dashboard · Ginger" },
  description: "Private creator tools for Ginger collections. This page is not indexed.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: `${SITE_URL}/dashboard` },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
