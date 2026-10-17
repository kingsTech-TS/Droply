"use client";

import { useEffect, useState } from "react";
import { PlayIcon } from "lucide-react";
import { asMedia, sniffMedia, type MediaKind } from "@/lib/media/sniff";
import { cn } from "@/lib/utils/cn";

export interface PreviewState {
  url: string;
  media: MediaKind;
}

/**
 * Creates an object URL only for real images/videos (detected from the bytes). SVG, HTML
 * and other formats never get a preview. The URL is revoked when the component unmounts.
 */
export function useMediaPreview(file: Blob | null | undefined): PreviewState | null {
  const [state, setState] = useState<PreviewState | null>(null);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let url: string | null = null;
    void sniffMedia(file).then((media) => {
      if (cancelled || !media) return;
      url = URL.createObjectURL(asMedia(file, media));
      setState({ url, media });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setState(null);
    };
  }, [file]);
  return state;
}

export function MediaThumb({ file, name, className, onOpen }: { file: Blob; name: string; className?: string; onOpen?: () => void }) {
  const preview = useMediaPreview(file);
  if (!preview) return null;
  const content =
    preview.media.kind === "image" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview.url} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
    ) : (
      <>
        <video src={preview.url} muted playsInline preload="metadata" className="size-full object-cover" />
        <PlayIcon aria-hidden className="absolute inset-0 m-auto size-6 text-white drop-shadow" />
      </>
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
