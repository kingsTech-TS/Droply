"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { TransferSnapshot } from "@/lib/webrtc/transfer-manager";
import { TransferCard, type TransferCardActions } from "./transfer-card";

export interface TransferListProps {
  items: TransferSnapshot[];
  deviceName: (id: string) => string;
  links: Readonly<Record<string, LinkInfo>>;
  actionsFor: (item: TransferSnapshot) => TransferCardActions;
}

export function TransferList({ items, deviceName, links, actionsFor }: TransferListProps) {
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="transfers-heading" className="space-y-3">
      <h2 id="transfers-heading" className="font-semibold">
        Transfers
      </h2>
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
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
