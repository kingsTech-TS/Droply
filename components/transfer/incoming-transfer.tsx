"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { DownloadIcon, FolderDownIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useIsClient } from "@/hooks/use-is-client";
import { canSaveDirectlyToDisk, pickDirectory } from "@/lib/storage/sinks/fs-access-sink";
import { formatBytes } from "@/lib/utils/format";
import type { IncomingRequest, TransferSnapshot } from "@/lib/webrtc/transfer-manager";
import { FileIcon } from "./file-icon";

export interface IncomingTransferProps {
  request: IncomingRequest;
  senderName: string;
  files: TransferSnapshot[];
  checkStorage: () => Promise<boolean | null>;
  onAccept: (options: { directory?: Awaited<ReturnType<typeof pickDirectory>>; trust: boolean }) => void;
  onDecline: () => void;
}

const VISIBLE = 6;

export function IncomingTransfer({ request, senderName, files, checkStorage, onAccept, onDecline }: IncomingTransferProps) {
  const [trust, setTrust] = useState(false);
  const [fits, setFits] = useState<boolean | null>(null);
  const directPossible = useIsClient() && canSaveDirectlyToDisk();
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    void checkStorage().then((result) => {
      if (!cancelled) setFits(result);
    });
    return () => {
      cancelled = true;
    };
  }, [checkStorage, request.totalBytes]);

  const tooBig = fits === false;

  const acceptToFolder = async () => {
    // The folder picker must open directly from this click.
    const directory = await pickDirectory();
    if (!directory) return;
    setBusy(true);
    onAccept({ directory, trust });
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card role="alertdialog" aria-labelledby={titleId} className="border-primary/40 shadow-md ring-1 ring-primary/20">
        <CardHeader className="pb-3">
          <CardTitle id={titleId} className="flex items-center gap-2 text-base">
            <DownloadIcon aria-hidden className="size-5 text-primary" />
            Incoming files
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{senderName}</span> wants to send you{" "}
            {files.length === 1 ? "a file" : `${files.length} files`}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y">
            {files.slice(0, VISIBLE).map((file) => (
              <li key={file.localId} className="flex min-w-0 items-center gap-3 py-2">
                <FileIcon name={file.fileName} mimeType={file.mimeType} className="size-9" />
                <span className="min-w-0 flex-1 truncate text-sm" title={file.fileName}>
                  {file.fileName}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.fileSize)}</span>
              </li>
            ))}
          </ul>
          {files.length > VISIBLE ? (
            <p className="text-sm text-muted-foreground">and {files.length - VISIBLE} more</p>
          ) : null}
          <p className="text-sm font-medium">Total: {formatBytes(request.totalBytes)}</p>

          {tooBig ? (
            <p className="flex gap-2 rounded-lg bg-warning/12 p-3 text-sm" role="status">
              <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              {directPossible
                ? "There isn't enough browser storage for this. Choose a folder to save the files directly."
                : "There may not be enough storage on this device for these files."}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${titleId}-trust`} className="font-normal text-muted-foreground">
              Auto-accept from {senderName} in this room
            </Label>
            <Switch id={`${titleId}-trust`} checked={trust} onCheckedChange={setTrust} />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onDecline} disabled={busy}>
              Decline
            </Button>
            {directPossible ? (
              <Button variant={tooBig ? "default" : "secondary"} onClick={() => void acceptToFolder()} disabled={busy}>
                <FolderDownIcon aria-hidden />
                Save to folder…
              </Button>
            ) : null}
            {!tooBig || !directPossible ? (
              <Button
                onClick={() => {
                  setBusy(true);
                  onAccept({ trust });
                }}
                disabled={busy}
              >
                Accept
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
