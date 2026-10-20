import Link from "next/link";
import { brand } from "@/config/brand";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {brand.name}. {brand.secondaryTagline}
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/#how-it-works" className="hover:text-foreground">
            How it works
          </Link>
          <Link href="/download" className="hover:text-foreground">
            Android app
          </Link>
          <Link href="/history" className="hover:text-foreground">
            History
          </Link>
          <Link href="/speed-test" className="hover:text-foreground">
            Speed test
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
        </nav>
      </div>
    </footer>
  );
}
