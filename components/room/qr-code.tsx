"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import QRCode from "qrcode";
import { cn } from "@/lib/utils/cn";

/**
 * Renders `value` (the backend's join_url) as a QR code, generated in the browser.
 * The SVG is shown through an <img>, so nothing is injected into the page's HTML.
 */
export function QrCode({ value, size = 200, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#ffffff" } })
      .then((svg) => {
        if (!cancelled) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: src ? 1 : 0.4, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn("rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5", className)}
      style={{ width: size + 16, height: size + 16 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={size} height={size} alt="QR code to join this room" className="block" />
      ) : (
        <div className="size-full animate-pulse rounded-lg bg-gray-100" aria-hidden />
      )}
    </motion.div>
  );
}
