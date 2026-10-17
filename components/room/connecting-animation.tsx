"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LaptopIcon, SmartphoneIcon } from "lucide-react";

/** Subtle "waiting for a device" visual: two devices and a pulse travelling between them. */
export function ConnectingAnimation({ label = "Waiting for another device…" }: { label?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-3 py-4" role="status">
      <div className="flex items-center gap-3 text-muted-foreground" aria-hidden>
        <LaptopIcon className="size-7" />
        <div className="relative h-0.5 w-24 overflow-hidden rounded-full bg-border">
          {!reduceMotion ? (
            <motion.span
              className="absolute inset-y-0 w-8 rounded-full bg-primary"
              initial={{ x: -32 }}
              animate={{ x: 96 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
        </div>
        <SmartphoneIcon className="size-7" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
