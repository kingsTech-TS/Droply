"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { DeviceView } from "@/types/device";
import { DeviceCard, type DeviceCardActions } from "./device-card";

export interface DeviceListProps {
  devices: DeviceView[];
  selfId: string;
  links: Readonly<Record<string, LinkInfo>>;
  actionsFor?: (deviceId: string) => DeviceCardActions;
  pairedNames?: ReadonlySet<string>;
}

export function DeviceList({ devices, selfId, links, actionsFor, pairedNames }: DeviceListProps) {
  const reduceMotion = useReducedMotion();
  const others = devices.filter((d) => d.device_id !== selfId).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const self = devices.find((d) => d.device_id === selfId);
  const online = others.filter((d) => d.connection_state === "connected").length;

  return (
    <section aria-labelledby="devices-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="devices-heading" className="font-semibold">
          Connected devices
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {online === 1 ? "1 other device online" : `${online} other devices online`}
        </p>
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <AnimatePresence initial={false}>
          {others.map((device) => (
            <motion.li
              key={device.device_id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <DeviceCard
                device={device}
                link={links[device.device_id]}
                paired={pairedNames?.has(device.device_name) ?? false}
                {...(actionsFor ? actionsFor(device.device_id) : {})}
              />
            </motion.li>
          ))}
        </AnimatePresence>
        {self ? (
          <li>
            <DeviceCard device={self} isSelf />
          </li>
        ) : null}
      </ul>
    </section>
  );
}
