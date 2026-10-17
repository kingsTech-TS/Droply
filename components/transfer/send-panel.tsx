"use client";

import { SendIcon, TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { formatDuration } from "@/lib/utils/format";
import type { DeviceView } from "@/types/device";
import type { SelectedFileMeta } from "./file-item";
import { FileList } from "./file-list";
import { RecipientSelector } from "./recipient-selector";

export interface SendPanelProps {
  files: SelectedFileMeta[];
  recipients: DeviceView[];
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSend: () => void;
  /** Time to send, from speeds measured earlier this session (null = unknown). */
  estimateSeconds?: number | null;
  sendSmaller?: boolean;
  onSendSmallerChange?: (value: boolean) => void;
  /** "My devices" rooms: send automatically when a paired device comes online. */
  autoSend?: boolean;
  onAutoSendChange?: (value: boolean) => void;
}

export function SendPanel({
  files,
  recipients,
  selected,
  onSelectedChange,
  onRemove,
  onClear,
  onSend,
  estimateSeconds = null,
  sendSmaller = false,
  onSendSmallerChange,
  autoSend = false,
  onAutoSendChange,
}: SendPanelProps) {
  const sendable = files.filter((f) => f.size > 0).length;
  const online = new Set(recipients.map((d) => d.device_id));
  const chosen = [...selected].filter((id) => online.has(id)).length;
  const reason =
    sendable === 0 ? "Add at least one non-empty file" : recipients.length === 0 ? (autoSend ? "Will send when your device connects" : "Waiting for another device") : chosen === 0 ? "Choose a recipient" : null;
  const hasPhotos = files.some((f) => /^image\/(jpeg|png|webp)$/.test(f.type));

  return (
    <Card>
      <CardContent className="space-y-5 pt-5">
        <FileList files={files} onRemove={onRemove} />
        <Separator />
        <RecipientSelector devices={recipients} selected={selected} onChange={onSelectedChange} />
        {hasPhotos && onSendSmallerChange ? (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="send-smaller" className="flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">Send smaller photos</span>
              <span className="text-xs text-muted-foreground">Resizes large photos first. Faster on slow networks.</span>
            </Label>
            <Switch id="send-smaller" checked={sendSmaller} onCheckedChange={onSendSmallerChange} />
          </div>
        ) : null}
        {onAutoSendChange && recipients.length === 0 && sendable > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
            <Label htmlFor="auto-send" className="flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">Send when my device connects</span>
              <span className="text-xs text-muted-foreground">
                Keep this tab open. The files go to your paired devices as soon as one joins.
              </span>
            </Label>
            <Switch id="auto-send" checked={autoSend} onCheckedChange={onAutoSendChange} />
          </div>
        ) : null}
        {estimateSeconds !== null && reason === null ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <TimerIcon aria-hidden className="size-4" />
            About {formatDuration(estimateSeconds)} on this connection
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={onClear}>
            Clear files
          </Button>
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <Button size="lg" onClick={onSend} disabled={reason !== null} aria-describedby={reason ? "send-reason" : undefined}>
              <SendIcon aria-hidden />
              {sendable === 1 ? "Send file" : `Send ${sendable} files`}
            </Button>
            {reason ? (
              <p id="send-reason" className="text-center text-xs text-muted-foreground sm:text-right">
                {reason}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
