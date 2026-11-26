import type { MetadataRoute } from "next";
import { LEGAL_SITE_URL } from "@/lib/legal";

// Only the public front door and the legal pages are worth crawling. Every
// other route redirects to the login form, so listing them as disallowed keeps
// crawlers from indexing a pile of identical login screens.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/privacy", "/terms"],
      disallow: "/",
    },
    sitemap: `${LEGAL_SITE_URL}/sitemap.xml`,
  };
}
