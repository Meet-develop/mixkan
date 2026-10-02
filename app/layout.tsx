import type { Metadata, Viewport } from "next";
import { Sora, Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { GoogleAnalytics } from "@/components/google-analytics";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { getMetadataBaseUrl } from "@/lib/site-url";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const siteName = "mixkan";
const title = "mixkan（みかん）｜日程調整と店決めを同時に。AIが候補を10秒で作成";
const description =
  "mixkan（みかん）は「みんなで、簡単」「みんなで、幹事」「みんなで、乾杯」をコンセプトにした幹事支援アプリ。友達との飲み会、会社の懇親会、同窓会、コミュニティイベントの日程調整と店決めを投票で同時に行えます。日程やお店の候補はAIが自動で選定するので、発案から募集開始まで10秒です。";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${getMetadataBaseUrl().origin}/#website`,
      url: getMetadataBaseUrl().origin,
      name: siteName,
      alternateName: ["みかん", "mixkan（みかん）"],
      description,
      inLanguage: "ja-JP",
    },
    {
      "@type": "WebApplication",
      name: siteName,
      url: getMetadataBaseUrl().origin,
      description,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      inLanguage: "ja-JP",
      offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: getMetadataBaseUrl(),
  title: { default: title, template: `%s | ${siteName}` },
  description,
  applicationName: siteName,
  keywords: [
    "mixkan",
    "みかん",
    "幹事",
    "日程調整",
    "店決め",
    "飲み会",
    "懇親会",
    "同窓会",
    "イベント",
    "投票",
    "AI",
  ],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteName,
  },
  openGraph: {
    title,
    description,
    siteName,
    url: "/",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#ff6b4a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..700,0..1,0"
        />
      </head>
      <body
        className={`${sora.variable} ${spaceMono.variable} bg-[var(--background)] antialiased pb-24 md:pb-0`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>
          {children}
          <MobileBottomNav />
        </Providers>
        <GoogleAnalytics />
      </body>
    </html>
  );
}
