// Display helpers for transfer snapshots (pure, so they're easy to test).
import type { LegSnapshot, TransferSnapshot } from "./transfer-manager";
import type { LegStatus } from "./transfer-state";

const PRIORITY: LegStatus[] = [
  "transferring",
  "connecting",
  "retrying",
  "requesting",
  "paused",
  "failed",
  "accepted",
  "pending",
  "queued",
  "completed",
  "cancelled",
  "rejected",
  "expired",
];

/** One status to show for a (possibly multi-recipient) transfer. */
export function primaryStatus(item: TransferSnapshot): LegStatus {
  const statuses = new Set(item.legs.map((l) => l.status));
  for (const status of PRIORITY) if (statuses.has(status)) return status;
  return item.legs[0]?.status ?? "queued";
}

export interface AggregateProgress {
  verifiedBytes: number;
  totalBytes: number;
  fraction: number;
  speed: number | null;
  averageSpeed: number | null;
  etaSeconds: number | null;
}

/** Sums the legs that are still meant to receive the file (declined/cancelled legs are excluded). */
export function aggregateProgress(item: TransferSnapshot): AggregateProgress {
  const legs = item.legs.filter((l) => l.status !== "rejected" && l.status !== "cancelled" && l.status !== "expired");
  const counted = legs.length > 0 ? legs : item.legs;
  const totalBytes = item.fileSize * Math.max(1, counted.length);
  const verifiedBytes = counted.reduce((sum, l) => sum + Math.min(l.verifiedBytes, item.fileSize), 0);
  const speeds = counted.map((l) => l.speed).filter((s): s is number => s !== null);
  const averages = counted.map((l) => l.averageSpeed).filter((s): s is number => s !== null);
  const etas = counted.map((l) => l.etaSeconds).filter((s): s is number => s !== null);
  return {
    verifiedBytes,
    totalBytes,
    fraction: totalBytes > 0 ? verifiedBytes / totalBytes : 0,
    speed: speeds.length ? speeds.reduce((a, b) => a + b, 0) : null,
    averageSpeed: averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : null,
    etaSeconds: etas.length ? Math.max(...etas) : null,
  };
}

export function failureMessage(leg: LegSnapshot): string {
  switch (leg.failureReason) {
    case "no_route":
      return "We couldn't establish a direct connection.";
    case "integrity":
      return "File verification failed.";
    case "storage":
      return "The receiving device ran out of storage.";
    case "read_error":
      return "The file couldn't be read.";
    default:
      return "Transfer interrupted.";
  }
}

export function isActive(item: TransferSnapshot): boolean {
  return item.legs.some((l) => l.status === "transferring" || l.status === "connecting" || l.status === "retrying");
}
