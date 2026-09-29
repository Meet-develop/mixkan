import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新規登録",
  description:
    "mixkan（みかん）に無料で登録。AIが日程とお店の候補を自動で選定し、10秒で幹事を始められます。",
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
