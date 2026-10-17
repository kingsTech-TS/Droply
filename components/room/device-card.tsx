"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  GaugeIcon,
  LinkIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import { collectDroppedFiles } from "@/lib/utils/dropped-files";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { DeviceView } from "@/types/device";
import { ConnectionBadge, QualityIndicator } from "./connection-badge";
import { DeviceAvatar } from "./device-avatar";

const PRESENCE: Record<DeviceView["connection_state"], { label: string; dot: string }> = {
  connected: { label: "Online", dot: "bg-success" },
  connecting: { label: "Joining…", dot: "bg-warning" },
  reconnecting: { label: "Reconnecting…", dot: "bg-warning" },
  disconnected: { label: "Offline", dot: "bg-muted-foreground" },
};

export interface DeviceCardActions {
  onSend?: () => void;
  onDropFiles?: (files: File[]) => void;
  onSendText?: () => void;
  onSpeedTest?: () => void;
  onPair?: () => void;
  onRetry?: (relayOnly: boolean) => void;
}

export interface DeviceCardProps extends DeviceCardActions {
  device: DeviceView;
  isSelf?: boolean;
  link?: LinkInfo;
  paired?: boolean;
}

export function DeviceCard({ device, isSelf = false, link, paired = false, onSend, onDropFiles, onSendText, onSpeedTest, onPair, onRetry }: DeviceCardProps) {
  const presence = PRESENCE[device.connection_state];
  const details = [device.operating_system, device.browser].filter(Boolean).join(" • ");
  const online = device.connection_state === "connected";
  const [dragOver, setDragOver] = useState(false);
  const depth = useRef(0);

  const dropProps =
    !isSelf && onDropFiles && online
      ? {
          onDragEnter: (event: DragEvent) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            depth.current += 1;
            setDragOver(true);
          },
          onDragOver: (event: DragEvent) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          },
          onDragLeave: () => {
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setDragOver(false);
          },
          onDrop: async (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            depth.current = 0;
            setDragOver(false);
            const files = await collectDroppedFiles(event.dataTransfer);
            if (files.length > 0) onDropFiles(files);
          },
        }
      : {};

  return (
    <article
      data-device-id={device.device_id}
      aria-label={`${device.device_name}${isSelf ? " (this device)" : ""}, ${presence.label}`}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 transition-colors",
        isSelf && "border-dashed bg-muted/40",
        dragOver && "border-primary bg-primary/8 ring-2 ring-primary/30",
      )}
      {...dropProps}
    >
      <div className="flex min-w-0 items-start gap-3">
        <DeviceAvatar name={device.device_name} type={device.device_type} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={device.device_name}>
            {device.device_name}
            {isSelf ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(this device)</span> : null}
            {device.is_host ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">· host</span> : null}
            {paired ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">· paired</span> : null}
          </p>
          {details ? <p className="truncate text-sm text-muted-foreground">{details}</p> : null}
        </div>
        {!isSelf && (onSendText || onSpeedTest || onPair || onRetry) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`More options for ${device.device_name}`}>
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onSendText ? (
                <DropdownMenuItem disabled={!online} onSelect={onSendText}>
                  <MessageSquareTextIcon aria-hidden />
                  Send text or link
                </DropdownMenuItem>
              ) : null}
              {onSpeedTest ? (
                <DropdownMenuItem disabled={!online} onSelect={onSpeedTest}>
                  <GaugeIcon aria-hidden />
                  Test speed
                </DropdownMenuItem>
              ) : null}
              {onPair && !paired ? (
                <DropdownMenuItem disabled={!online} onSelect={onPair}>
                  <LinkIcon aria-hidden />
                  Add to My devices
                </DropdownMenuItem>
              ) : null}
              {onRetry ? (
                <DropdownMenuItem disabled={!online} onSelect={() => onRetry(true)}>
                  <RefreshCwIcon aria-hidden />
                  Reconnect through relay
                </DropdownMenuItem>
              ) : null}
              {link?.securityCode ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>
                    <span className="flex items-center gap-1.5">
                      <ShieldCheckIcon aria-hidden className="size-3.5" />
                      Security code
                    </span>
                    <span className="mt-1 block text-lg tracking-widest text-foreground" aria-label={`Security code ${link.securityCode}`}>
                      {link.securityCode}
                    </span>
                    <span className="block max-w-56">Same emoji on both screens means nobody is in the middle.</span>
                  </DropdownMenuLabel>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onRetry(false)}>
            Retry connection
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onRetry(true)}>
            Try relay
          </Button>
        </div>
      ) : null}
      {!isSelf && onSend ? (
        <Button variant="secondary" size="sm" onClick={onSend} disabled={!online}>
          <SendIcon aria-hidden />
          {dragOver ? "Drop to send" : "Send files"}
        </Button>
      ) : null}
    </article>
  );
}
