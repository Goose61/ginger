import type { MetadataRoute } from "next";
import { listSitemapCollections } from "@/lib/store";
import { CONTENT_UPDATED, PUBLIC_PAGES, absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const updated = new Date(CONTENT_UPDATED);
  const staticRoutes: MetadataRoute.Sitemap = PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: updated,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  let collections: Awaited<ReturnType<typeof listSitemapCollections>> = [];
  try {
    collections = await listSitemapCollections();
  } catch (err) {
    console.error("[sitemap] collections unavailable", err);
  }

  const collectionRoutes: MetadataRoute.Sitemap = collections.flatMap((c) => {
    const lastModified = c.updatedAt ? new Date(c.updatedAt) : updated;
    const path = `/collection/${c.slug}`;
    const routes: MetadataRoute.Sitemap = [
      {
        url: absoluteUrl(path),
        lastModified,
        changeFrequency: "daily",
        priority: 0.8,
      },
    ];
    if (c.holderPageUnlocked) {
      routes.push({
        url: absoluteUrl(`${path}/holders`),
        lastModified,
        changeFrequency: "weekly",
        priority: 0.4,
      });
    }
    return routes;
  });

  return [...staticRoutes, ...collectionRoutes];
}
