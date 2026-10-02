import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
  description: "mixkan（みかん）にログインして、日程調整と店決めをみんなで投票しましょう。",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
