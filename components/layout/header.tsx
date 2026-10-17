import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";
import { PreferencesButton } from "./preferences-dialog";
import { ThemeToggle } from "./theme-toggle";

export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex min-w-0 items-center gap-1">
          {children ?? (
            <>
              <Link
                href="/#how-it-works"
                className="hidden min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                How it works
              </Link>
              <Link
                href="/history"
                className="hidden min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                History
              </Link>
              <Link
                href="/about"
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                About
              </Link>
            </>
          )}
          <PreferencesButton />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
