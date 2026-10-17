import { GlobeIcon, RefreshCwIcon, ZapIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDuration, formatPercent, formatSpeed } from "@/lib/utils/format";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { AggregateProgress } from "@/lib/webrtc/transfer-view";
import { Sparkline, SpeedGauge } from "./speed-graphics";

const PATH: Record<LinkInfo["path"], { label: string; icon: typeof ZapIcon } | null> = {
  lan: { label: "Direct", icon: ZapIcon },
  direct: { label: "Internet", icon: GlobeIcon },
  relay: { label: "Relay", icon: RefreshCwIcon },
  unknown: null,
};

export function TransferProgress({
  progress,
  fileName,
  showRates,
  tone = "default",
  link,
  large = false,
}: {
  progress: AggregateProgress;
  fileName: string;
  showRates: boolean;
  tone?: "default" | "paused" | "success" | "error";
  /** Connection used, shown next to the speed so people see why it's fast or slow. */
  link?: LinkInfo;
  /** Big files get the speedometer. */
  large?: boolean;
}) {
  const percent = Math.floor(progress.fraction * 100);
  const path = link && link.status === "connected" ? PATH[link.path] : null;
  const PathIcon = path?.icon;
  return (
    <div className="space-y-2">
      {showRates ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-baseline gap-1.5 text-2xl font-semibold tabular-nums tracking-tight" aria-live="off">
              <ZapIcon aria-hidden className="size-5 self-center text-electric" />
              {formatSpeed(progress.speed)}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {path && PathIcon ? (
                <span className="inline-flex items-center gap-1">
                  <PathIcon aria-hidden className="size-3.5" />
                  {path.label}
                </span>
              ) : null}
              {progress.etaSeconds !== null ? <span className="tabular-nums">~{formatDuration(progress.etaSeconds)} left</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {large ? <SpeedGauge speed={progress.speed} size={84} className="hidden text-foreground sm:block" /> : null}
            <Sparkline values={progress.speedHistory} />
          </div>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium tabular-nums">{formatPercent(progress.fraction)}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatBytes(progress.verifiedBytes)} / {formatBytes(progress.totalBytes)}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={`${fileName} progress`}
        aria-valuetext={`${percent}%, ${formatBytes(progress.verifiedBytes)} of ${formatBytes(progress.totalBytes)}`}
        indicatorClassName={cn(
          tone === "paused" && "bg-warning",
          tone === "success" && "bg-success",
          tone === "error" && "bg-destructive",
        )}
      />
    </div>
  );
}

/** "2.8 GB in 35 s · average 79 MB/s · top 112 MB/s" */
export function TransferSummary({ bytes, progress }: { bytes: number; progress: AggregateProgress }) {
  const parts = [`${formatBytes(bytes)}${progress.activeSeconds >= 1 ? ` in ${formatDuration(progress.activeSeconds)}` : ""}`];
  if (progress.averageSpeed) parts.push(`average ${formatSpeed(progress.averageSpeed)}`);
  if (progress.peakSpeed) parts.push(`top ${formatSpeed(progress.peakSpeed)}`);
  return <p className="text-xs tabular-nums text-muted-foreground">{parts.join(" · ")}</p>;
}
