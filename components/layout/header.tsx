import Link from "next/link";
import type { ReactNode } from "react";
import { SmartphoneIcon } from "lucide-react";
import { env } from "@/config/env";
import { Logo } from "./logo";
import { PreferencesButton } from "./preferences-dialog";
import { ThemeToggle } from "./theme-toggle";

export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex min-w-0 items-center sm:gap-1">
          {children ?? (
            <>
              <Link
                href="/#how-it-works"
                className="hidden min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                How it works
              </Link>
              {env.androidApp.url ? (
                <Link
                  href="/download"
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/10 sm:px-3"
                >
                  <SmartphoneIcon aria-hidden className="size-4 shrink-0" />
                  <span className="sm:hidden">Get app</span>
                  <span className="hidden sm:inline">Get the app</span>
                </Link>
              ) : null}
              <Link
                href="/history"
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground sm:px-3"
              >
                History
              </Link>
              {/* On phones About is in the footer, to leave room for the app link. */}
              <Link
                href="/about"
                className="hidden min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
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
