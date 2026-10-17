"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useMediaPreview } from "./media-thumb";

/** A full-size, sandboxed preview: images via <img>, videos via <video controls>. */
export function MediaViewer({
  file,
  name,
  open,
  onOpenChange,
  onSave,
}: {
  file: Blob | null;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}) {
  const preview = useMediaPreview(open ? file : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="truncate pr-8">{name}</DialogTitle>
        <DialogDescription className="sr-only">Preview of {name}</DialogDescription>
        <div className="flex max-h-[70dvh] items-center justify-center overflow-hidden rounded-lg bg-black/90">
          {preview?.kind === "ready" && preview.media.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={name} className="max-h-[70dvh] max-w-full object-contain" />
          ) : preview?.kind === "ready" && preview.media.kind === "video" ? (
            <video src={preview.url} controls playsInline className="max-h-[70dvh] max-w-full" />
          ) : preview?.kind === "too-large" ? (
            <p className="p-10 text-center text-sm text-white/70">This photo is too large to preview on this device. Save it to view it.</p>
          ) : (
            <p className="p-10 text-sm text-white/70">No preview available.</p>
          )}
        </div>
        {onSave ? (
          <Button onClick={onSave} className="justify-self-end">
            <DownloadIcon aria-hidden />
            Save
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
