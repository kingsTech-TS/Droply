import Link from "next/link";
import { DownloadIcon, SmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { env } from "@/config/env";
import { cn } from "@/lib/utils/cn";

const { androidApp } = env;

/** "Version 1.0.0 · 189 MB", from whatever is configured. */
export function androidAppFacts(): string {
  return [androidApp.version ? `Version ${androidApp.version}` : null, androidApp.size].filter(Boolean).join(" · ");
}

/** Downloads the APK. Renders nothing when no download is configured. */
export function AndroidDownloadButton({ size = "lg", className }: { size?: "default" | "lg"; className?: string }) {
  if (!androidApp.url) return null;
  return (
    <Button asChild size={size} className={className}>
      <a href={androidApp.url} download="Droply.apk" type="application/vnd.android.package-archive">
        <DownloadIcon aria-hidden />
        Download for Android
      </a>
    </Button>
  );
}

/** Home page section: the Android app, with a link to the install guide. */
export function GetTheApp({ className }: { className?: string }) {
  if (!androidApp.url) return null;
  const facts = androidAppFacts();
  return (
    <section aria-labelledby="get-app-heading" className={cn("border-t", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 md:flex-row md:text-left">
        <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <SmartphoneIcon aria-hidden className="size-8" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 id="get-app-heading" className="text-2xl font-semibold tracking-tight">
            Get the Droply app for Android
          </h2>
          <p className="text-muted-foreground">
            Send and receive from your phone with the app. It joins the same rooms as this website, so phones and computers share
            files either way.
          </p>
          {facts ? <p className="text-sm text-muted-foreground">{facts}</p> : null}
        </div>
        <div className="flex flex-col items-center gap-2 md:items-end">
          <AndroidDownloadButton />
          <Link href="/download" className="text-sm text-primary hover:underline">
            How to install
          </Link>
        </div>
      </div>
    </section>
  );
}
