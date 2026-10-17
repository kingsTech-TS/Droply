"use client";

import { useEffect } from "react";

interface WakeLockSentinelLike {
  release(): Promise<void>;
  released: boolean;
}

/**
 * Keeps the screen awake while `active` (phones suspend background tabs, which stops
 * WebRTC). Re-acquired when the tab becomes visible again. No-op where unsupported.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
    }).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await wakeLock.request("screen");
        if (cancelled) await next.release();
        else sentinel = next;
      } catch {
        // Denied (battery saver, permissions): transfers still work.
      }
    };
    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
