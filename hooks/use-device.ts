"use client";

import { useEffect, useMemo, useState } from "react";
import { detectDevice, refineDesktopOrLaptop, type DetectedDevice } from "@/lib/device/detection";
import { cleanDeviceName, defaultDeviceName, loadDeviceName, saveDeviceName } from "@/lib/device/device-name";
import { useIsClient } from "./use-is-client";

export interface DeviceIdentity {
  device: DetectedDevice | null;
  name: string;
  setName: (name: string) => void;
  /** Saves the (cleaned) name for next time and returns it. */
  commitName: () => string;
}

/** Detects the device on the client (never during server rendering) and manages its name. */
export function useDevice(): DeviceIdentity {
  const isClient = useIsClient();
  const detected = useMemo(() => (isClient ? detectDevice() : null), [isClient]);
  const [refined, setRefined] = useState<DetectedDevice | null>(null);
  // null until the user edits the name; until then the remembered or default name is shown.
  const [edited, setEdited] = useState<string | null>(null);

  useEffect(() => {
    if (!detected) return;
    let cancelled = false;
    void refineDesktopOrLaptop(detected).then((result) => {
      if (!cancelled && result.type !== detected.type) setRefined(result);
    });
    return () => {
      cancelled = true;
    };
  }, [detected]);

  const device = refined ?? detected;
  const remembered = useMemo(() => (isClient ? loadDeviceName() : null), [isClient]);
  const name = edited ?? remembered ?? (device ? defaultDeviceName(device) : "");

  const commitName = () => {
    const cleaned = cleanDeviceName(name) || (device ? defaultDeviceName(device) : "My device");
    saveDeviceName(cleaned);
    setEdited(cleaned);
    return cleaned;
  };

  return { device, name, setName: setEdited, commitName };
}
