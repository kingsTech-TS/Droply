"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, DownloadIcon, FolderIcon, ImageOffIcon, LoaderIcon, RotateCwIcon, SaveIcon, TrashIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { FileIcon } from "@/components/transfer/file-icon";
import { DropZone } from "@/components/transfer/drop-zone";
import { Button } from "@/components/ui/button";
import { userMessage } from "@/lib/api/errors";
import type { EventRequest } from "@/lib/session/event-share";
import { thumbnailUrl } from "@/lib/media/thumbnail";
import { cn } from "@/lib/utils/cn";
import { fileKind } from "@/lib/utils/file-kind";
import { formatBytes } from "@/lib/utils/format";
import type { TransferSnapshot } from "@/lib/webrtc/transfer-manager";
import { aggregateProgress, primaryStatus } from "@/lib/webrtc/transfer-view";
import type { CatalogItem } from "@/types/room";

/** What a guest sees for one shared file. */
type GuestState =
  | { kind: "available" }
  | { kind: "waiting" }
  | { kind: "unavailable" }
  | { kind: "downloading"; fraction: number }
  | { kind: "ready"; localId: string }
  | { kind: "saved"; localId: string }
  | { kind: "failed" };

function guestState(request: EventRequest | undefined, transfer: TransferSnapshot | undefined): GuestState {
  if (!request) return { kind: "available" };
  if (request.unavailable) return { kind: "unavailable" };
  if (!transfer) return { kind: "waiting" };
  const status = primaryStatus(transfer);
  if (status === "completed") {
    if (transfer.save === "saved") return { kind: "saved", localId: transfer.localId };
    return { kind: "ready", localId: transfer.localId };
  }
  if (status === "failed" || status === "cancelled" || status === "expired" || status === "rejected") return { kind: "failed" };
  if (status === "transferring" || status === "paused") return { kind: "downloading", fraction: aggregateProgress(transfer).fraction };
  return { kind: "waiting" };
}

const isVisual = (item: CatalogItem) => {
  const kind = fileKind(item.name, item.mime_type);
  return kind === "image" || kind === "video";
};

export interface EventGalleryProps {
  mode: "host" | "guest";
  items: CatalogItem[];
  hostName: string;
  /** Guests: previews from the host. */
  thumbs: Readonly<Record<string, string>>;
  /** Guests: files asked for. */
  requests: Readonly<Record<string, EventRequest>>;
  /** Host: shared files still on this device. */
  local: ReadonlySet<string>;
  transfers: TransferSnapshot[];
  hostId: string | null;
  /** Host: request id → item id (for download counts). */
  requestItems: ReadonlyMap<string, string>;
  fileFor: (itemId: string) => File | null;
  onShare: (files: File[]) => Promise<number>;
  onUnshare: (itemId: string) => Promise<void>;
  onDownload: (itemIds: string[]) => Promise<number>;
  onRequestThumbs: (itemIds: string[]) => void;
  onSave: (localId: string) => void;
  /** Guests: devices in the room (host included). */
  people: number;
  disabled?: boolean;
}

export function EventGallery(props: EventGalleryProps) {
  const { mode, items, transfers, requests, hostId } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Guests: the transfer behind each requested item (tagged with the request id as batch).
  const byBatch = useMemo(() => new Map(transfers.filter((t) => t.direction === "incoming").map((t) => [t.batchId, t])), [transfers]);
  const states = useMemo(() => {
    const out = new Map<string, GuestState>();
    for (const item of items) {
      const request = requests[item.item_id];
      out.set(item.item_id, guestState(request, request ? byBatch.get(`rq_${hostId}_${request.requestId}`) : undefined));
    }
    return out;
  }, [items, requests, byBatch, hostId]);

  // Host: finished downloads per item.
  const downloads = useMemo(() => {
    const counts = new Map<string, number>();
    if (mode !== "host") return counts;
    for (const t of transfers) {
      if (t.direction !== "outgoing") continue;
      const itemId = props.requestItems.get(t.batchId);
      if (!itemId) continue;
      const done = t.legs.filter((l) => l.status === "completed").length;
      if (done) counts.set(itemId, (counts.get(itemId) ?? 0) + done);
    }
    return counts;
  }, [mode, transfers, props.requestItems]);
  const sending = useMemo(() => {
    if (mode !== "host") return { active: 0, waiting: 0 };
    let active = 0;
    let waiting = 0;
    for (const t of transfers) {
      if (t.direction !== "outgoing" || !props.requestItems.has(t.batchId)) continue;
      for (const leg of t.legs) {
        if (leg.status === "transferring" || leg.status === "connecting") active += 1;
        else if (leg.status === "queued" || leg.status === "requesting" || leg.status === "pending" || leg.status === "accepted") waiting += 1;
      }
    }
    return { active, waiting };
  }, [mode, transfers, props.requestItems]);

  const downloadable = items.filter((i) => {
    const s = states.get(i.item_id)?.kind;
    return s === "available" || s === "failed" || s === "unavailable";
  });
  const chosen = [...selected].filter((id) => downloadable.some((i) => i.item_id === id));
  const totalSize = items.reduce((sum, i) => sum + i.size, 0);

  const download = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const sent = await props.onDownload(ids);
      if (sent > 0) toast.success(sent === 1 ? "Asked the host for 1 file." : `Asked the host for ${sent} files.`);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="event-gallery-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="event-gallery-title" className="text-lg font-semibold">
            {mode === "host" ? "Shared with everyone" : `Shared by ${props.hostName}`}
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>
              {items.length} {items.length === 1 ? "file" : "files"}
              {items.length ? ` · ${formatBytes(totalSize)}` : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <UsersIcon aria-hidden className="size-3.5" />
              {props.people} {props.people === 1 ? "person" : "people"} here
            </span>
            {mode === "host" && (sending.active || sending.waiting) ? (
              <span>
                · sending {sending.active}
                {sending.waiting ? `, ${sending.waiting} waiting` : ""}
              </span>
            ) : null}
          </p>
        </div>
        {mode === "guest" && downloadable.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {chosen.length > 0 ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button size="sm" onClick={() => void download(chosen)} disabled={busy || props.disabled}>
                  <DownloadIcon aria-hidden />
                  Download {chosen.length}
                </Button>
              </>
            ) : null}
            <Button
              variant={chosen.length ? "outline" : "default"}
              size="sm"
              onClick={() => void download(downloadable.map((i) => i.item_id))}
              disabled={busy || props.disabled}
            >
              <DownloadIcon aria-hidden />
              Download all{downloadable.length < items.length ? ` (${downloadable.length})` : ""}
            </Button>
          </div>
        ) : null}
      </div>

      {mode === "host" ? (
        <DropZone
          compact={items.length > 0}
          disabled={props.disabled}
          title={items.length ? "Add more to share" : "Share files with everyone"}
          onFiles={(files) => void props.onShare(files).then((n) => n > 0 && toast.success(n === 1 ? "Shared 1 file." : `Shared ${n} files.`))}
        />
      ) : null}

      {items.length === 0 ? (
        mode === "guest" ? (
          <p className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            Nothing shared yet. Files the host shares appear here: pick the ones you want.
          </p>
        ) : null
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <GalleryCard
              key={item.item_id}
              item={item}
              mode={mode}
              thumb={mode === "guest" ? (props.thumbs[item.item_id] ?? null) : null}
              localFile={mode === "host" ? props.fileFor(item.item_id) : null}
              onHost={mode === "host" && props.local.has(item.item_id)}
              state={states.get(item.item_id) ?? { kind: "available" }}
              selected={selected.has(item.item_id)}
              downloads={downloads.get(item.item_id) ?? 0}
              disabled={props.disabled}
              onToggle={() => toggle(item.item_id)}
              onDownload={() => void download([item.item_id])}
              onSave={props.onSave}
              onVisible={() => isVisual(item) && props.onRequestThumbs([item.item_id])}
              onUnshare={() => void props.onUnshare(item.item_id).catch((e: unknown) => toast.error(userMessage(e)))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GalleryCard({
  item,
  mode,
  thumb,
  localFile,
  onHost,
  state,
  selected,
  downloads,
  disabled,
  onToggle,
  onDownload,
  onSave,
  onVisible,
  onUnshare,
}: {
  item: CatalogItem;
  mode: "host" | "guest";
  thumb: string | null;
  localFile: File | null;
  onHost: boolean;
  state: GuestState;
  selected: boolean;
  downloads: number;
  disabled?: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onSave: (localId: string) => void;
  onVisible: () => void;
  onUnshare: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [localThumb, setLocalThumb] = useState<string | null>(null);
  const visual = isVisual(item);
  const preview = mode === "host" ? localThumb : thumb;

  // Guests ask for a preview once the card scrolls into view.
  useEffect(() => {
    if (mode !== "guest" || !visual || thumb) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      onVisible();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        onVisible();
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode, visual, thumb, onVisible]);

  // The host previews its own files locally (images only; videos show their icon).
  useEffect(() => {
    if (mode !== "host" || !localFile || fileKind(item.name, item.mime_type) !== "image") return;
    let alive = true;
    void thumbnailUrl(localFile, 160).then((url) => alive && setLocalThumb(url));
    return () => {
      alive = false;
    };
  }, [mode, localFile, item.name, item.mime_type]);

  const selectable = mode === "guest" && (state.kind === "available" || state.kind === "failed" || state.kind === "unavailable");

  return (
    <li
      ref={ref}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card transition-shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      <button
        type="button"
        onClick={selectable ? onToggle : undefined}
        disabled={!selectable}
        aria-pressed={selectable ? selected : undefined}
        aria-label={selectable ? `${selected ? "Unselect" : "Select"} ${item.name}` : item.name}
        className={cn("relative flex aspect-square w-full items-center justify-center bg-muted/60", selectable && "cursor-pointer")}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- data/object URL preview
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <FileIcon name={item.name} mimeType={item.mime_type} className="size-12" />
        )}
        {mode === "guest" && visual && !preview ? (
          <span className="absolute bottom-2 right-2 rounded-full bg-background/80 p-1 text-muted-foreground" title="Preview loading">
            <ImageOffIcon aria-hidden className="size-3.5" />
          </span>
        ) : null}
        {selectable ? (
          // A visual checkbox: the whole card is the toggle button (aria-pressed).
          <span
            aria-hidden
            className={cn(
              "absolute left-2 top-2 inline-flex size-5 items-center justify-center rounded-[4px] border shadow-xs",
              selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background/90",
            )}
          >
            {selected ? <CheckIcon className="size-3.5" /> : null}
          </span>
        ) : null}
        {state.kind === "downloading" ? (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-background/70" aria-hidden>
            <span className="block h-full bg-primary transition-[width]" style={{ width: `${Math.round(state.fraction * 100)}%` }} />
          </span>
        ) : null}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {item.folder ? (
              <>
                <FolderIcon aria-hidden className="size-3 shrink-0" />
                <span className="truncate" title={item.folder}>
                  {item.folder}
                </span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className="shrink-0">{formatBytes(item.size)}</span>
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          {mode === "host" ? (
            <>
              <span className={cn("text-xs", onHost ? "text-muted-foreground" : "text-warning")}>
                {onHost ? `${downloads} ${downloads === 1 ? "download" : "downloads"}` : "Not on this device. Add it again."}
              </span>
              <Button variant="ghost" size="icon" className="size-9" onClick={onUnshare} aria-label={`Stop sharing ${item.name}`} disabled={disabled}>
                <TrashIcon aria-hidden />
              </Button>
            </>
          ) : (
            <GuestAction state={state} disabled={disabled} onDownload={onDownload} onSave={onSave} name={item.name} />
          )}
        </div>
      </div>
    </li>
  );
}

function GuestAction({
  state,
  disabled,
  onDownload,
  onSave,
  name,
}: {
  state: GuestState;
  disabled?: boolean;
  onDownload: () => void;
  onSave: (localId: string) => void;
  name: string;
}) {
  switch (state.kind) {
    case "available":
      return (
        <Button size="sm" variant="secondary" className="w-full" onClick={onDownload} disabled={disabled} aria-label={`Download ${name}`}>
          <DownloadIcon aria-hidden />
          Download
        </Button>
      );
    case "waiting":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderIcon aria-hidden className="size-3.5 motion-safe:animate-spin" />
          Waiting for the host…
        </span>
      );
    case "downloading":
      return <span className="text-xs tabular-nums text-muted-foreground">Downloading {Math.round(state.fraction * 100)}%</span>;
    case "ready":
      return (
        <Button size="sm" className="w-full" onClick={() => onSave(state.localId)} aria-label={`Save ${name}`}>
          <SaveIcon aria-hidden />
          Save
        </Button>
      );
    case "saved":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-success">
          <CheckIcon aria-hidden className="size-3.5" />
          Saved
        </span>
      );
    case "failed":
    case "unavailable":
      return (
        <Button size="sm" variant="outline" className="w-full" onClick={onDownload} disabled={disabled} aria-label={`Try ${name} again`}>
          <RotateCwIcon aria-hidden />
          {state.kind === "unavailable" ? "Unavailable · retry" : "Try again"}
        </Button>
      );
  }
}
