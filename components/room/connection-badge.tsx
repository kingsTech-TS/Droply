import { GlobeIcon, LoaderCircleIcon, RefreshCwIcon, TriangleAlertIcon, ZapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";

/**
 * Shows how this device is connected to a peer. A path is only claimed once getStats()
 * reports the selected candidate pair; until then it says "Connecting".
 */
export function ConnectionBadge({ link }: { link: LinkInfo | undefined }) {
  if (!link || link.status === "idle" || link.status === "closed") return null;
  if (link.status === "failed") {
    return (
      <Badge variant="destructive">
        <TriangleAlertIcon aria-hidden />
        No connection
      </Badge>
    );
  }
  if (link.status === "recovering") {
    return (
      <Badge variant="warning">
        <RefreshCwIcon aria-hidden className="animate-spin motion-reduce:animate-none" />
        Trying another route…
      </Badge>
    );
  }
  if (link.status === "connecting" || link.path === "unknown") {
    return (
      <Badge variant="secondary">
        <LoaderCircleIcon aria-hidden className="animate-spin motion-reduce:animate-none" />
        Connecting…
      </Badge>
    );
  }
  if (link.path === "relay") {
    return (
      <Badge variant="warning" title="Data goes through a relay server (still encrypted)">
        <RefreshCwIcon aria-hidden />
        Relay connection
      </Badge>
    );
  }
  if (link.path === "lan") {
    return (
      <Badge variant="success" title="Directly over your local network">
        <ZapIcon aria-hidden />
        Direct connection
      </Badge>
    );
  }
  return (
    <Badge variant="electric" title="Directly between devices over the internet">
      <GlobeIcon aria-hidden />
      Internet connection
    </Badge>
  );
}

const QUALITY: Record<NonNullable<LinkInfo["quality"]>, { label: string; symbol: string; className: string }> = {
  excellent: { label: "Excellent", symbol: "⚡", className: "text-success" },
  good: { label: "Good", symbol: "●", className: "text-electric" },
  weak: { label: "Weak", symbol: "△", className: "text-warning" },
};

/** Connection quality from measured RTT. Shows nothing without a measurement. */
export function QualityIndicator({ link }: { link: LinkInfo | undefined }) {
  if (!link?.quality || link.status !== "connected") return null;
  const q = QUALITY[link.quality];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span aria-hidden className={q.className}>
        {q.symbol}
      </span>
      <span>
        {q.label}
        {link.rttMs !== null ? <span className="sr-only">, {link.rttMs} milliseconds latency</span> : null}
      </span>
    </span>
  );
}
