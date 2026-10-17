import { formatBytes, formatDuration, formatSpeed } from "@/lib/utils/format";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { AggregateProgress } from "@/lib/webrtc/transfer-view";

const PATH_LABEL: Record<LinkInfo["path"], string> = {
  lan: "Direct P2P (local network)",
  direct: "Direct P2P (internet)",
  relay: "Relayed (TURN)",
  unknown: "Not established yet",
};

/** Expanded statistics. Every value is measured; missing ones show "—". */
export function TransferDetails({ progress, link }: { progress: AggregateProgress; link: LinkInfo | undefined }) {
  const rows: Array<[string, string]> = [
    ["Connection", link && link.status === "connected" ? PATH_LABEL[link.path] : "Not connected"],
    ["Current speed", formatSpeed(progress.speed)],
    ["Average speed", formatSpeed(progress.averageSpeed)],
    ["Latency", link?.rttMs != null ? `${link.rttMs} ms` : "—"],
    ["Data transferred", formatBytes(progress.verifiedBytes)],
    ["Estimated remaining", progress.etaSeconds !== null ? formatDuration(progress.etaSeconds) : "—"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/60 p-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
