import { LaptopIcon, MonitorIcon, SmartphoneIcon, TabletIcon, type LucideIcon } from "lucide-react";
import type { DeviceType } from "@/types/device";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<DeviceType, LucideIcon> = {
  phone: SmartphoneIcon,
  tablet: TabletIcon,
  laptop: LaptopIcon,
  desktop: MonitorIcon,
  unknown: MonitorIcon,
};

export const DEVICE_LABEL: Record<DeviceType, string> = {
  phone: "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
  desktop: "Desktop",
  unknown: "Device",
};

export function DeviceIcon({ type, className }: { type: DeviceType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon aria-hidden className={cn("size-5", className)} />;
}
