"use client";

import { SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { DeviceView } from "@/types/device";
import { ConnectionBadge, QualityIndicator } from "./connection-badge";
import { DeviceIcon, DEVICE_LABEL } from "./device-icon";

const PRESENCE: Record<DeviceView["connection_state"], { label: string; dot: string }> = {
  connected: { label: "Online", dot: "bg-success" },
  connecting: { label: "Joining…", dot: "bg-warning" },
  reconnecting: { label: "Reconnecting…", dot: "bg-warning" },
  disconnected: { label: "Offline", dot: "bg-muted-foreground" },
};

export interface DeviceCardProps {
  device: DeviceView;
  isSelf?: boolean;
  link?: LinkInfo;
  onSend?: () => void;
  onRetry?: () => void;
}

export function DeviceCard({ device, isSelf = false, link, onSend, onRetry }: DeviceCardProps) {
  const presence = PRESENCE[device.connection_state];
  const details = [device.operating_system, device.browser].filter(Boolean).join(" • ");
  return (
    <article
      aria-label={`${device.device_name}${isSelf ? " (this device)" : ""}, ${presence.label}`}
      className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4", isSelf && "border-dashed bg-muted/40")}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <DeviceIcon type={device.device_type} />
          <span className="sr-only">{DEVICE_LABEL[device.device_type]}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={device.device_name}>
            {device.device_name}
            {isSelf ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(this device)</span> : null}
            {device.is_host ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">· host</span> : null}
          </p>
          {details ? <p className="truncate text-sm text-muted-foreground">{details}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span aria-hidden className={cn("size-2 rounded-full", presence.dot)} />
          {presence.label}
        </span>
        {!isSelf ? <ConnectionBadge link={link} /> : null}
        {!isSelf ? <QualityIndicator link={link} /> : null}
      </div>
      {!isSelf && link?.status === "failed" && onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry connection
        </Button>
      ) : null}
      {!isSelf && onSend ? (
        <Button variant="secondary" size="sm" onClick={onSend} disabled={device.connection_state !== "connected"}>
          <SendIcon aria-hidden />
          Send files
        </Button>
      ) : null}
    </article>
  );
}
