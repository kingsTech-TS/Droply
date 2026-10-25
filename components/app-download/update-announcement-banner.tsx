"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DownloadIcon, XIcon } from "lucide-react";
import { env } from "@/config/env";

/** Bump on each release. */
const RELEASED = "2026-10-25";

const releasedLabel = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${RELEASED}T00:00:00Z`));

/** Announces a new app version, with a link to download it. Shown on every visit; × hides it until the next one. */
export function UpdateAnnouncementBanner() {
  const reduceMotion = useReducedMotion();
  const [show, setShow] = useState(Boolean(env.androidApp.url));
  const dismiss = () => setShow(false);

  return (
    <AnimatePresence initial>
      {show ? (
        <motion.div
          role="region"
          aria-label="App update"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.2 } }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="relative mb-6 overflow-hidden rounded-xl border border-primary/30 bg-card p-3 pr-2 shadow-sm"
        >
          {/* Slow drifting gradient wash behind the content. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(110deg, color-mix(in oklch, var(--primary) 14%, transparent), color-mix(in oklch, var(--electric) 14%, transparent), color-mix(in oklch, var(--primary) 14%, transparent))",
              backgroundSize: "200% 100%",
            }}
            animate={reduceMotion ? undefined : { backgroundPosition: ["0% 0%", "200% 0%"] }}
            transition={{ duration: 8, ease: "linear", repeat: Infinity }}
          />
          {/* Shine that sweeps across every few seconds. */}
          {reduceMotion ? null : (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              animate={{ x: ["0%", "450%"] }}
              transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 3.5, delay: 0.6 }}
            />
          )}

          <div className="relative flex items-center gap-3">
            <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              {reduceMotion ? null : (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-lg bg-primary/25"
                  animate={{ scale: [1, 1.45], opacity: [0.6, 0] }}
                  transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity }}
                />
              )}
              <motion.span
                className="relative inline-flex"
                animate={reduceMotion ? undefined : { rotate: [0, -12, 12, -6, 0], scale: [1, 1.15, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.4 }}
              >
                <DownloadIcon aria-hidden className="size-5" />
              </motion.span>
            </span>
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium">Droply app has been updated.</span>{" "}
              <span className="text-muted-foreground">
                A new version was released on <time dateTime={RELEASED}>{releasedLabel}</time>. Download it and update to get the
                latest improvements.
              </span>
            </p>
            <Link
              href="/download"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:min-h-9"
            >
              <DownloadIcon aria-hidden className="size-4" />
              <span className="hidden sm:inline">Update now</span>
              <span className="sm:hidden">Update</span>
            </Link>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-accent sm:size-9"
            >
              <XIcon aria-hidden className="size-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
