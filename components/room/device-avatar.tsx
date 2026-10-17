import { splitAvatar } from "@/lib/fun/names";
import { cn } from "@/lib/utils/cn";
import type { DeviceType } from "@/types/device";
import { DeviceIcon, DEVICE_LABEL } from "./device-icon";

/** The device's emoji avatar (from a fun name like "🦦 Sneaky Otter"), or its type icon. */
export function DeviceAvatar({ name, type, className }: { name: string; type: DeviceType; className?: string }) {
  const { avatar } = splitAvatar(name);
  return (
    <span
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground",
        className,
      )}
    >
      {avatar ? (
        <span aria-hidden className="text-xl leading-none">
          {avatar}
        </span>
      ) : (
        <DeviceIcon type={type} />
      )}
      {avatar ? (
        <span className="absolute -bottom-1 -right-1 inline-flex size-5 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
          <DeviceIcon type={type} className="size-3" />
        </span>
      ) : null}
      <span className="sr-only">{DEVICE_LABEL[type]}</span>
    </span>
  );
}
