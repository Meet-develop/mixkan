import type { MetadataRoute } from "next";
import { getMetadataBaseUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getMetadataBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/friends",
        "/invitations",
        "/notifications",
        "/onboarding",
        "/setup",
      ],
    },
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
  };
}
