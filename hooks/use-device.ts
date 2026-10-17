"use client";

import { useEffect, useMemo, useState } from "react";
import { detectDevice, refineDesktopOrLaptop, type DetectedDevice } from "@/lib/device/detection";
import { cleanDeviceName, defaultDeviceName, loadDeviceName, saveDeviceName } from "@/lib/device/device-name";
import { funDeviceName } from "@/lib/fun/names";
import { useIsClient } from "./use-is-client";

const FUN_NAME_KEY = "droply:fun-name";

/** A playful default name, generated once per device so it stays the same across visits. */
function stableFunName(): string {
  try {
    const saved = localStorage.getItem(FUN_NAME_KEY);
    if (saved) return saved;
    const name = funDeviceName();
    localStorage.setItem(FUN_NAME_KEY, name);
    return name;
  } catch {
    return funDeviceName();
  }
}

export interface DeviceIdentity {
  device: DetectedDevice | null;
  name: string;
  setName: (name: string) => void;
  /** Picks a new random fun name. */
  shuffleName: () => void;
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
  const fun = useMemo(() => (isClient ? stableFunName() : null), [isClient]);
  const name = edited ?? remembered ?? fun ?? (device ? defaultDeviceName(device) : "");

  const commitName = () => {
    const cleaned = cleanDeviceName(name) || (device ? defaultDeviceName(device) : "My device");
    saveDeviceName(cleaned);
    setEdited(cleaned);
    return cleaned;
  };

  return { device, name, setName: setEdited, shuffleName: () => setEdited(funDeviceName()), commitName };
}
