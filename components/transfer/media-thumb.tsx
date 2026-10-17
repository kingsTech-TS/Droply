"use client";

import { useEffect, useState } from "react";
import { ImageIcon, PlayIcon } from "lucide-react";
import { memoryBudget } from "@/lib/device/memory";
import { asMedia, sniffMedia, type MediaKind } from "@/lib/media/sniff";
import { scaledImage, thumbnailUrl } from "@/lib/media/thumbnail";
import { cn } from "@/lib/utils/cn";

export type PreviewState =
  | { kind: "ready"; url: string; media: MediaKind }
  /** A real image, but too large to decode safely on this device. */
  | { kind: "too-large"; media: MediaKind };

/**
 * A full-screen preview, only for real images/videos (detected from the bytes; SVG, HTML
 * and other formats never render). On phones, photos are shown scaled to the screen
 * instead of decoding the original. The URL is revoked when the component unmounts.
 */
export function useMediaPreview(file: Blob | null | undefined): PreviewState | null {
  const [state, setState] = useState<PreviewState | null>(null);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let url: string | null = null;
    void (async () => {
      const media = await sniffMedia(file);
      if (cancelled || !media) return;
      const maxDimension = memoryBudget().viewerMaxDimension;
      if (media.kind === "image" && maxDimension > 0) {
        const scaled = await scaledImage(file, maxDimension, 0.9);
        if (cancelled) return;
        if (!scaled) {
          setState({ kind: "too-large", media });
          return;
        }
        url = URL.createObjectURL(scaled);
      } else {
        url = URL.createObjectURL(asMedia(file, media));
      }
      setState({ kind: "ready", url, media });
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setState(null);
    };
  }, [file]);
  return state;
}

type ThumbState = { kind: "image"; url: string } | { kind: "video"; url: string | null } | { kind: "icon"; media: MediaKind };

/**
 * A small thumbnail. Photos are decoded once at thumbnail size (one at a time); videos
 * only get a <video> element where memory allows (each one holds a decoder on phones).
 */
function useThumbnail(file: Blob): ThumbState | null {
  const [state, setState] = useState<ThumbState | null>(null);
  useEffect(() => {
    let cancelled = false;
    let videoUrl: string | null = null;
    void (async () => {
      const media = await sniffMedia(file);
      if (cancelled || !media) return;
      if (media.kind === "video") {
        if (memoryBudget().videoThumbnails) {
          videoUrl = URL.createObjectURL(asMedia(file, media));
          setState({ kind: "video", url: videoUrl });
        } else {
          setState({ kind: "video", url: null });
        }
        return;
      }
      const url = await thumbnailUrl(file);
      if (!cancelled) setState(url ? { kind: "image", url } : { kind: "icon", media });
    })();
    return () => {
      cancelled = true;
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setState(null);
    };
  }, [file]);
  return state;
}

export function MediaThumb({ file, name, className, onOpen }: { file: Blob; name: string; className?: string; onOpen?: () => void }) {
  const thumb = useThumbnail(file);
  if (!thumb) return null;
  const content =
    thumb.kind === "image" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumb.url} alt="" className="size-full object-cover" decoding="async" />
    ) : thumb.kind === "video" && thumb.url ? (
      <>
        <video src={thumb.url} muted playsInline preload="metadata" className="size-full object-cover" />
        <PlayIcon aria-hidden className="absolute inset-0 m-auto size-6 text-white drop-shadow" />
      </>
    ) : (
      <span className="flex size-full items-center justify-center text-muted-foreground">
        {thumb.kind === "video" ? <PlayIcon aria-hidden className="size-5" /> : <ImageIcon aria-hidden className="size-5" />}
      </span>
    );
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Preview ${name}`}
      className={cn("relative block cursor-pointer overflow-hidden rounded-lg bg-muted", className)}
    >
      {content}
    </button>
  ) : (
    <span className={cn("relative block overflow-hidden rounded-lg bg-muted", className)}>{content}</span>
  );
}
