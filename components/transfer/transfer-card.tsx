"use client";

import { useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileSearchIcon,
  FolderIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatSpeed } from "@/lib/utils/format";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import { REACTIONS, type Reaction } from "@/lib/webrtc/protocol";
import type { TransferSnapshot } from "@/lib/webrtc/transfer-manager";
import { isTerminal, statusLabel } from "@/lib/webrtc/transfer-state";
import { aggregateProgress, failureMessage, primaryStatus } from "@/lib/webrtc/transfer-view";
import { CancelDialog } from "./cancel-dialog";
import { FileIcon } from "./file-icon";
import { MediaThumb } from "./media-thumb";
import { MediaViewer } from "./media-viewer";
import { TransferDetails } from "./transfer-details";
import { TransferProgress, TransferSummary } from "./transfer-progress";

export interface TransferCardActions {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  retry: () => void;
  save: () => void;
  dismiss: () => void;
  reselect: (file: File) => void;
  react?: (emoji: Reaction) => void;
  sendAgain?: () => void;
}

export interface TransferCardProps {
  item: TransferSnapshot;
  deviceName: (id: string) => string;
  link: LinkInfo | undefined;
  actions: TransferCardActions;
  /** The file itself, when available on this device (for a safe image/video preview). */
  media?: Blob | null;
}

const CONFIRM_CANCEL_BYTES = 100_000_000;
const LARGE_FILE_BYTES = 100_000_000;
const ROSTER_THRESHOLD = 6;

export function TransferCard({ item, deviceName, link, actions, media }: TransferCardProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const reselectInput = useRef<HTMLInputElement>(null);
  const status = primaryStatus(item);
  const progress = aggregateProgress(item);
  const outgoing = item.direction === "outgoing";
  const firstLeg = item.legs[0];
  const autoResume = item.legs.some((l) => l.autoResume && l.status === "paused");
  const done = item.legs.every((l) => isTerminal(l.status));
  const completed = item.legs.some((l) => l.status === "completed");
  const failed = status === "failed";
  const verifyFailed = item.verification === "failed";
  const delivered = item.legs.filter((l) => l.status === "completed").length;

  const peerText = outgoing
    ? item.peerIds.length > 3
      ? `To ${item.peerIds.length} devices`
      : `To ${item.peerIds.map(deviceName).join(", ")}`
    : `From ${item.peerIds.map(deviceName).join(", ")}`;

  const requestCancel = () => {
    const large = item.fileSize > CONFIRM_CANCEL_BYTES;
    if (large && (status === "transferring" || status === "paused")) setConfirmCancel(true);
    else actions.cancel();
  };

  let statusText: string = statusLabel(status);
  if (status === "paused" && autoResume) statusText = "Connection interrupted. Waiting to reconnect…";
  if (status === "failed" && firstLeg) statusText = failureMessage(firstLeg);
  if (!outgoing && item.save === "preparing") statusText = "Verifying…";
  if (status === "transferring") statusText = outgoing ? "Sending" : "Receiving";
  if (item.needsReselect) statusText = "Select the file again to resume";

  const tone = completed ? "success" : failed || verifyFailed ? "error" : status === "paused" ? "paused" : "default";
  const showPreview = media && (outgoing || item.save === "ready" || item.save === "saved");

  return (
    <article
      aria-label={`${item.fileName}, ${statusText}`}
      className={cn("rounded-xl border bg-card p-4", completed && "border-success/40")}
    >
      <div className="flex min-w-0 items-start gap-3">
        {showPreview ? (
          <MediaThumb file={media} name={item.fileName} className="size-10 shrink-0" onOpen={() => setViewerOpen(true)} />
        ) : null}
        {!showPreview ? <FileIcon name={item.fileName} mimeType={item.mimeType} /> : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate font-medium" title={item.fileName}>
            {item.fileName}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {outgoing ? <ArrowUpIcon aria-hidden className="size-3.5" /> : <ArrowDownIcon aria-hidden className="size-3.5" />}
            <span className="truncate">{peerText}</span>
            <span aria-hidden>·</span>
            <span>{formatBytes(item.fileSize)}</span>
            {item.relativePath ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <FolderIcon aria-hidden className="size-3.5" />
                <span className="truncate">{item.relativePath}</span>
              </span>
            ) : null}
          </p>
        </div>
        {done || failed ? (
          <Button variant="ghost" size="icon" onClick={actions.dismiss} aria-label={`Dismiss ${item.fileName}`}>
            <XIcon aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm",
            completed ? "text-success" : failed || verifyFailed ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {completed ? <CheckCircle2Icon aria-hidden className="size-4" /> : null}
          {completed
            ? outgoing && item.legs.length > 1
              ? `Delivered to ${delivered} of ${item.legs.length}`
              : "Transfer complete"
            : statusText}
        </p>
        {!outgoing && item.verification === "verified" ? (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <ShieldCheckIcon aria-hidden className="size-4" />
            File verified
          </p>
        ) : null}
        {verifyFailed ? (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <ShieldAlertIcon aria-hidden className="size-4" />
            File verification failed
          </p>
        ) : null}

        {!(completed && done) ? (
          <TransferProgress
            progress={progress}
            fileName={item.fileName}
            showRates={status === "transferring"}
            tone={tone}
            link={link}
            large={item.fileSize >= LARGE_FILE_BYTES}
          />
        ) : (
          <TransferSummary bytes={item.fileSize} progress={progress} />
        )}

        {outgoing && item.legs.length > 1 ? (
          item.legs.length >= ROSTER_THRESHOLD ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Delivery status per device">
              {item.legs.map((leg) => (
                <li
                  key={leg.deviceId}
                  title={`${deviceName(leg.deviceId)}: ${statusLabel(leg.status)}`}
                  className={cn(
                    "max-w-32 truncate rounded-full px-2 py-0.5 text-xs",
                    leg.status === "completed" && "bg-success/15 text-success",
                    leg.status === "transferring" && "bg-electric/15 text-electric",
                    (leg.status === "rejected" || leg.status === "failed" || leg.status === "cancelled") && "bg-destructive/12 text-destructive",
                    !["completed", "transferring", "rejected", "failed", "cancelled"].includes(leg.status) && "bg-muted text-muted-foreground",
                  )}
                >
                  {deviceName(leg.deviceId)}
                  <span className="sr-only">: {statusLabel(leg.status)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {item.legs.map((leg) => (
                <li key={leg.deviceId} className="flex justify-between gap-2">
                  <span className="truncate">{deviceName(leg.deviceId)}</span>
                  <span className="shrink-0 tabular-nums">
                    {leg.status === "transferring"
                      ? `${Math.floor((leg.verifiedBytes / Math.max(1, item.fileSize)) * 100)}% · ${formatSpeed(leg.speed)}`
                      : statusLabel(leg.status)}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {outgoing && item.reactions.length > 0 ? (
          <p className="text-sm" aria-label={`Reactions: ${item.reactions.join(" ")}`}>
            {item.reactions.join(" ")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {item.needsReselect ? (
            <>
              <Button size="sm" onClick={() => reselectInput.current?.click()}>
                <FileSearchIcon aria-hidden />
                Select file
              </Button>
              <input
                ref={reselectInput}
                type="file"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) actions.reselect(file);
                  event.target.value = "";
                }}
              />
            </>
          ) : null}
          {status === "transferring" ? (
            <Button variant="secondary" size="sm" onClick={actions.pause}>
              <PauseIcon aria-hidden />
              Pause
            </Button>
          ) : null}
          {status === "paused" && !autoResume && !item.needsReselect ? (
            <Button size="sm" onClick={actions.resume}>
              <PlayIcon aria-hidden />
              Resume
            </Button>
          ) : null}
          {failed && !item.needsReselect ? (
            <Button size="sm" onClick={actions.retry}>
              <RotateCcwIcon aria-hidden />
              {firstLeg?.failureReason === "no_route" ? "Try again" : "Resume"}
            </Button>
          ) : null}
          {!outgoing && (item.save === "ready" || item.save === "saving") ? (
            <Button size="sm" onClick={actions.save} disabled={item.save === "saving"}>
              {item.save === "saving" ? "Saving…" : "Open / Save"}
            </Button>
          ) : null}
          {!outgoing && item.save === "saved" ? <span className="self-center text-sm text-muted-foreground">Saved</span> : null}
          {outgoing && done && item.canResend && actions.sendAgain ? (
            <Button variant="outline" size="sm" onClick={actions.sendAgain}>
              <RepeatIcon aria-hidden />
              Send again
            </Button>
          ) : null}
          {!done ? (
            <Button variant="ghost" size="sm" onClick={requestCancel}>
              Cancel
            </Button>
          ) : null}
        </div>

        {!outgoing && completed && actions.react ? (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="React to this file">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => actions.react?.(emoji)}
                aria-pressed={item.reactions.includes(emoji)}
                aria-label={`React ${emoji}`}
                className={cn(
                  "inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-lg transition-transform hover:scale-110",
                  item.reactions.includes(emoji) ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-accent",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}

        {status === "transferring" || status === "paused" ? (
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Transfer details
              <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform", detailsOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <TransferDetails progress={progress} link={link} />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>

      <CancelDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        fileName={item.fileName}
        onConfirm={() => {
          setConfirmCancel(false);
          actions.cancel();
        }}
      />
      {showPreview ? (
        <MediaViewer
          file={media}
          name={item.fileName}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          onSave={!outgoing && item.save !== "saving" ? actions.save : undefined}
        />
      ) : null}
    </article>
  );
}
