import type { MetadataRoute } from "next";
import { LEGAL_SITE_URL } from "@/lib/legal";

// The public pages, and only those. Nothing behind the login is listed.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: LEGAL_SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${LEGAL_SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${LEGAL_SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
