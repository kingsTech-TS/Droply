"use client";

import { useEffect, useState } from "react";
import { ImagesIcon, ImagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaThumb } from "@/components/transfer/media-thumb";
import { MediaViewer } from "@/components/transfer/media-viewer";
import { sniffMedia } from "@/lib/media/sniff";

export interface AlbumItem {
  localId: string;
  direction: "outgoing" | "incoming";
  name: string;
  file: Blob;
  peerId: string;
}

export interface AlbumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: AlbumItem[];
  deviceName: (id: string) => string;
  onAddPhotos: (files: File[]) => void;
  onSave: (item: AlbumItem) => void;
  onSaveAll: () => void;
}

/**
 * Every photo and video shared in this room, from this device's point of view. "Add photos"
 * sends to everyone in the room (peer to peer), so the album fills up for all.
 */
export function AlbumDialog({ open, onOpenChange, candidates, deviceName, onAddPhotos, onSave, onSaveAll }: AlbumDialogProps) {
  const [media, setMedia] = useState<AlbumItem[]>([]);
  const [viewing, setViewing] = useState<AlbumItem | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all(candidates.map(async (c) => ((await sniffMedia(c.file)) ? c : null))).then((list) => {
      if (!cancelled) setMedia(list.filter((c): c is AlbumItem => c !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [open, candidates]);

  const received = media.filter((m) => m.direction === "incoming").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagesIcon aria-hidden className="size-5 text-primary" />
            Room album
          </DialogTitle>
          <DialogDescription>
            Photos and videos shared in this room. Adding photos sends them to everyone here.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <label className="cursor-pointer">
              <ImagePlusIcon aria-hidden />
              Add photos for everyone
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                className="sr-only"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length) onAddPhotos(files);
                }}
              />
            </label>
          </Button>
          {received >= 2 ? (
            <Button variant="outline" size="sm" onClick={onSaveAll}>
              Save all received
            </Button>
          ) : null}
        </div>
        {media.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No photos or videos yet.</p>
        ) : (
          <ul className="grid max-h-[60dvh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {media.map((item) => (
              <li key={`${item.direction}:${item.localId}`} className="space-y-1">
                <MediaThumb file={item.file} name={item.name} className="aspect-square w-full" onOpen={() => setViewing(item)} />
                <p className="truncate text-xs text-muted-foreground" title={item.name}>
                  {item.direction === "outgoing" ? "You" : deviceName(item.peerId)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <MediaViewer
          file={viewing?.file ?? null}
          name={viewing?.name ?? ""}
          open={viewing !== null}
          onOpenChange={(value) => !value && setViewing(null)}
          onSave={viewing?.direction === "incoming" ? () => viewing && onSave(viewing) : undefined}
        />
      </DialogContent>
    </Dialog>
  );
}
