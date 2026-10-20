"use client";

import { CircleCheckIcon, CircleMinusIcon, CircleXIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";
import type { AdminHealth, CheckStatus, OverallStatus } from "@/types/admin";

const CHECK: Record<CheckStatus, { label: string; icon: typeof CircleCheckIcon; tone: string }> = {
  ok: { label: "OK", icon: CircleCheckIcon, tone: "text-success" },
  warning: { label: "Warning", icon: TriangleAlertIcon, tone: "text-warning" },
  error: { label: "Problem", icon: CircleXIcon, tone: "text-destructive" },
  disabled: { label: "Off", icon: CircleMinusIcon, tone: "text-muted-foreground" },
};

const OVERALL: Record<OverallStatus, { label: string; body: string; variant: "success" | "warning" | "destructive"; icon: typeof CircleCheckIcon }> = {
  healthy: { label: "Healthy", body: "Everything is working.", variant: "success", icon: CircleCheckIcon },
  degraded: { label: "Degraded", body: "Rooms work, but something needs attention.", variant: "warning", icon: TriangleAlertIcon },
  down: { label: "Down", body: "Devices can't use rooms right now.", variant: "destructive", icon: CircleXIcon },
};

export function HealthPanel({
  health,
  running,
  error,
  onRun,
}: {
  health: AdminHealth | null;
  running: boolean;
  error: string | null;
  onRun: () => void;
}) {
  const overall = health ? OVERALL[health.status] : null;
  return (
    <section aria-labelledby="health-title" className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="health-title" className="text-lg font-semibold">
            System health
          </h2>
          <p className="text-sm text-muted-foreground">
            {health ? `Checked at ${new Date(health.checked_at).toLocaleTimeString()}` : "Checks every part of the server right now."}
          </p>
        </div>
        <Button onClick={onRun} disabled={running}>
          <RefreshCwIcon aria-hidden className={cn(running && "animate-spin")} />
          {running ? "Checking…" : "Run health checks"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {health && overall ? (
        <>
          <div
            role="status"
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3",
              health.status === "healthy" && "border-success/40 bg-success/10",
              health.status === "degraded" && "border-warning/40 bg-warning/10",
              health.status === "down" && "border-destructive/40 bg-destructive/10",
            )}
          >
            <overall.icon aria-hidden className={cn("size-6 shrink-0", CHECK[health.status === "healthy" ? "ok" : health.status === "degraded" ? "warning" : "error"].tone)} />
            <div>
              <p className="font-semibold">{overall.label}</p>
              <p className="text-sm text-muted-foreground">{overall.body}</p>
            </div>
          </div>

          <ul className="divide-y rounded-xl border">
            {health.checks.map((check) => {
              const s = CHECK[check.status];
              return (
                <li key={check.name} className="flex items-start gap-3 px-3 py-3 sm:px-4">
                  <s.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", s.tone)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{check.label}</p>
                      <Badge variant={check.status === "ok" ? "success" : check.status === "warning" ? "warning" : check.status === "error" ? "destructive" : "secondary"}>
                        {s.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{check.detail}</p>
                  </div>
                  {check.latency_ms !== null && check.status !== "disabled" ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.round(check.latency_ms)} ms</span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            {[
              ["Version", health.version],
              ["Environment", health.environment],
              ["Up for", formatDuration(health.uptime_seconds)],
              ["Instance", health.instance_id],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-medium" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </section>
  );
}
