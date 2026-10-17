"use client";

import { useState } from "react";
import { GaugeIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { SpeedGauge } from "@/components/transfer/speed-graphics";
import { confetti, playSound } from "@/lib/fun/celebrate";
import { records } from "@/lib/history/history";
import { renderCard, shareCard } from "@/lib/share/result-card";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/utils/format";
import type { LinkInfo } from "@/lib/webrtc/peer-connection";
import type { SpeedTestResult } from "@/lib/webrtc/transfer-manager";

const SIZES = [
  { label: "Quick", bytes: 32 * 1024 * 1024 },
  { label: "Standard", bytes: 128 * 1024 * 1024 },
  { label: "Long", bytes: 256 * 1024 * 1024 },
] as const;

const PATH_LABEL: Record<LinkInfo["path"], string> = {
  lan: "Direct (local network)",
  direct: "Direct (internet)",
  relay: "Relay",
  unknown: "Unknown",
};

export interface SpeedTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerName: string;
  link: LinkInfo | undefined;
  run: (bytes: number, onProgress: (verified: number, speed: number | null) => void) => Promise<SpeedTestResult>;
}

/** Measures how fast two devices can talk, with synthetic data (nothing is saved). */
export function SpeedTestDialog({ open, onOpenChange, peerName, link, run }: SpeedTestDialogProps) {
  const [size, setSize] = useState<number>(SIZES[1].bytes);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<{ verified: number; speed: number | null } | null>(null);
  const [result, setResult] = useState<SpeedTestResult | null>(null);

  const start = async () => {
    setRunning(true);
    setResult(null);
    setLive({ verified: 0, speed: null });
    const best = records.get().bestPeak;
    const outcome = await run(size, (verified, speed) => setLive({ verified, speed }));
    setRunning(false);
    setResult(outcome);
    if (!outcome.ok) {
      toast.error("The speed test didn't finish. Check the connection and try again.");
      return;
    }
    playSound("receive");
    if (outcome.peakSpeed && best !== null && outcome.peakSpeed > best) {
      records.update((r) => ({ ...r, bestPeak: outcome.peakSpeed }));
      confetti("big");
      playSound("record");
      toast.success(`New personal record: ${formatSpeed(outcome.peakSpeed)}!`);
    } else if (outcome.peakSpeed && best === null) {
      records.update((r) => ({ ...r, bestPeak: outcome.peakSpeed }));
    }
  };

  const share = async () => {
    if (!result?.averageSpeed) return;
    const blob = await renderCard({
      headline: `${formatSpeed(result.averageSpeed)} between my devices`,
      detail: `Top ${formatSpeed(result.peakSpeed)} · ${link ? PATH_LABEL[link.path] : "Peer to peer"}`,
    });
    if (blob) await shareCard(blob, `My devices talk at ${formatSpeed(result.averageSpeed)} with Droply ⚡`);
  };

  const speed = running ? live?.speed ?? null : result?.averageSpeed ?? null;

  return (
    <Dialog open={open} onOpenChange={(value) => !running && onOpenChange(value)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GaugeIcon aria-hidden className="size-5 text-primary" />
            Speed test with {peerName}
          </DialogTitle>
          <DialogDescription>Sends test data over your connection and throws it away. No files are touched.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-1 py-2">
          <SpeedGauge speed={speed} size={200} className="text-foreground" />
          <p className="text-3xl font-semibold tabular-nums" aria-live="polite">
            {formatSpeed(speed)}
          </p>
          <p className="text-sm text-muted-foreground">
            {link && link.status === "connected" ? PATH_LABEL[link.path] : "Connecting…"}
            {link?.rttMs != null ? ` · ${link.rttMs} ms latency` : ""}
          </p>
        </div>

        {running && live ? (
          <Progress value={(live.verified / size) * 100} aria-label="Speed test progress" />
        ) : null}

        {result?.ok ? (
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 text-center text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Average</dt>
              <dd className="font-medium tabular-nums">{formatSpeed(result.averageSpeed)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Top</dt>
              <dd className="font-medium tabular-nums">{formatSpeed(result.peakSpeed)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sent</dt>
              <dd className="font-medium tabular-nums">
                {formatBytes(result.bytes)} in {formatDuration(result.seconds)}
              </dd>
            </div>
          </dl>
        ) : null}

        {!running ? (
          <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Test size">
            {SIZES.map((s) => (
              <button
                key={s.label}
                type="button"
                role="radio"
                aria-checked={size === s.bytes}
                onClick={() => setSize(s.bytes)}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm sm:min-h-9",
                  size === s.bytes ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                )}
              >
                {s.label} · {formatBytes(s.bytes)}
              </button>
            ))}
          </div>
        ) : null}

        <DialogFooter>
          {result?.ok ? (
            <Button variant="outline" onClick={() => void share()}>
              <Share2Icon aria-hidden />
              Share result
            </Button>
          ) : null}
          <Button onClick={() => void start()} disabled={running}>
            {running ? "Testing…" : result ? "Test again" : "Start test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
