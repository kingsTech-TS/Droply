"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SmartphoneIcon, XIcon } from "lucide-react";
import { env } from "@/config/env";
import { clientKind } from "@/lib/device/client";

const DISMISSED_KEY = "droply:app-banner-dismissed";

/** For Android visitors in a browser tab: the app exists. Dismissed for good with ×. */
export function AndroidAppBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!env.androidApp.url || !/android/i.test(navigator.userAgent) || clientKind() !== "browser") return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Storage blocked: show it.
    }
    // Depends on the browser (user agent, storage), so it is decided after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dismissed) setShow(true);
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div role="region" aria-label="Droply app for Android" className="mb-6 flex items-center gap-3 rounded-xl border bg-card p-3 pr-2 shadow-xs">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
        <SmartphoneIcon aria-hidden className="size-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Droply for Android.</span> <span className="text-muted-foreground">Faster sharing from your phone.</span>
      </p>
      <Link
        href="/download"
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:min-h-9"
      >
        Get the app
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent sm:size-9">
        <XIcon aria-hidden className="size-4" />
      </button>
    </div>
  );
}
