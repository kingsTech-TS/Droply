"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileArchiveIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSpeed } from "@/lib/utils/format";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { TransferSnapshot } from "@/lib/webrtc/transfer-manager";
import { totalSpeed } from "@/lib/webrtc/transfer-view";
import { TransferCard, type TransferCardActions } from "./transfer-card";

export interface TransferListProps {
  items: TransferSnapshot[];
  deviceName: (id: string) => string;
  links: Readonly<Record<string, LinkInfo>>;
  actionsFor: (item: TransferSnapshot) => TransferCardActions;
  mediaFor?: (localId: string) => Blob | null;
  /** Shown when two or more received files are ready. */
  onSaveAllZip?: () => void;
  zipProgress?: number | null;
}

export function TransferList({ items, deviceName, links, actionsFor, mediaFor, onSaveAllZip, zipProgress }: TransferListProps) {
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;
  const speed = totalSpeed(items);
  const ready = items.filter((i) => i.direction === "incoming" && (i.save === "ready" || i.save === "saved")).length;
  const sending = items.filter((i) => i.legs.some((l) => l.status === "transferring")).length;
  return (
    <section aria-labelledby="transfers-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="transfers-heading" className="font-semibold">
          Transfers
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {speed !== null && sending > 1 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-electric/12 px-2.5 py-1 text-xs font-medium tabular-nums text-electric">
              <ZapIcon aria-hidden className="size-3.5" />
              {formatSpeed(speed)} total
            </span>
          ) : null}
          {onSaveAllZip && ready >= 2 ? (
            <Button variant="outline" size="sm" onClick={onSaveAllZip} disabled={zipProgress !== null && zipProgress !== undefined}>
              <FileArchiveIcon aria-hidden />
              {zipProgress !== null && zipProgress !== undefined ? `Preparing zip ${Math.floor(zipProgress * 100)}%` : "Save all as .zip"}
            </Button>
          ) : null}
        </div>
      </div>
      <ul className="grid gap-3">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.localId}
              layout={reduceMotion ? false : "position"}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <TransferCard
                item={item}
                deviceName={deviceName}
                link={links[item.peerIds[0] ?? ""]}
                actions={actionsFor(item)}
                media={mediaFor?.(item.localId) ?? null}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
