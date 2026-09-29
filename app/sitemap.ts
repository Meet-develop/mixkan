import type { MetadataRoute } from "next";
import { getMetadataBaseUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getMetadataBaseUrl();

  return [
    {
      url: baseUrl.toString(),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: new URL("/login", baseUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: new URL("/signup", baseUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
