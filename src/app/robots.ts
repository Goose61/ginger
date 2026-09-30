import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Public crawl rules. /dashboard and /api stay out of the index.
 * Draft resume links (/launch?id=) are noindex from page metadata.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
