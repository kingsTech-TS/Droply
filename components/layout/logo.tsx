import Link from "next/link";
import { ZapIcon } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className,
      )}
    >
      <ZapIcon className="size-4.5" fill="currentColor" strokeWidth={1.5} />
    </span>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold tracking-tight">
      <LogoMark />
      <span className="text-lg">{brand.name}</span>
    </Link>
  );
}
