import Link from "next/link";
import { getCommunityType } from "@/lib/community-diagnosis/types";

type TypeBadgeProps = {
  code?: string | null;
  size?: "sm" | "md";
  className?: string;
  linkable?: boolean;
};

export function TypeBadge({ code, size = "md", className = "", linkable = false }: TypeBadgeProps) {
  const type = getCommunityType(code);
  if (!type) return null;

  const sizeClass =
    size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs";

  const badge = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white font-semibold shadow-sm ${sizeClass} ${className}`}
      style={{ border: `1px solid ${type.themeColor}55`, color: type.themeColor }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: type.themeColor }}
      />
      {type.name}
    </span>
  );

  if (linkable) {
    return (
      <Link href={`/diagnosis/types/${type.code.toLowerCase()}`} className="inline-flex">
        {badge}
      </Link>
    );
  }

  return badge;
}
