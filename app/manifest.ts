import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "mixkan（みかん）",
    short_name: "mixkan",
    description: "日程調整と店決めを投票で同時に。候補はAIが自動選定、発案から募集まで10秒の幹事支援アプリ。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fff8f3",
    theme_color: "#ff6b4a",
    lang: "ja",
    icons: [
      { src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
