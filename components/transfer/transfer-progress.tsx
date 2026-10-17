import { Progress } from "@/components/ui/progress";
import { formatBytes, formatDuration, formatPercent, formatSpeed } from "@/lib/utils/format";
import type { AggregateProgress } from "@/lib/webrtc/transfer-view";
import { cn } from "@/lib/utils/cn";

export function TransferProgress({
  progress,
  fileName,
  showRates,
  tone = "default",
}: {
  progress: AggregateProgress;
  fileName: string;
  showRates: boolean;
  tone?: "default" | "paused" | "success" | "error";
}) {
  const percent = Math.floor(progress.fraction * 100);
  return (
    <div className="space-y-1.5">
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
      {showRates ? (
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            <span aria-hidden>⚡ </span>
            {formatSpeed(progress.speed)}
          </span>
          {progress.etaSeconds !== null ? (
            <span className="tabular-nums">~{formatDuration(progress.etaSeconds)} left</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
