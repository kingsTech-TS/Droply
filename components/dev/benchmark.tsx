"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { ChunkSink } from "@/lib/storage/sinks/sink";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/utils/format";
import { parseStats, type LinkStats } from "@/lib/webrtc/connection-monitor";
import { SyntheticSource, totalChunks } from "@/lib/webrtc/chunk-manager";
import { DataChannelTransport, type DataChannelLike } from "@/lib/webrtc/data-channel";
import { FileReceiver } from "@/lib/webrtc/file-receiver";
import { FileSender } from "@/lib/webrtc/file-sender";

/** Accepts chunks and drops them: measures the network pipeline, not the disk. */
class DiscardSink implements ChunkSink {
  readonly kind = "memory" as const;
  async write(): Promise<void> {}
  async finalize(): Promise<File> {
    return new File([], "discard");
  }
  async close(): Promise<void> {}
  async discard(): Promise<void> {}
}

interface Settings {
  sizeMb: number;
  chunkKb: number;
  frameKb: number;
  highWaterKb: number;
  window: number;
  files: number;
}

interface Live {
  verified: number;
  total: number;
  elapsedMs: number;
  bufferedAmount: number;
  stats: LinkStats | null;
  done: boolean;
  error: string | null;
}

const MiB = 1024 * 1024;

async function connectLoopback(): Promise<{ a: RTCPeerConnection; b: RTCPeerConnection; ca: RTCDataChannel; cb: RTCDataChannel }> {
  const a = new RTCPeerConnection();
  const b = new RTCPeerConnection();
  a.onicecandidate = (e) => e.candidate && void b.addIceCandidate(e.candidate);
  b.onicecandidate = (e) => e.candidate && void a.addIceCandidate(e.candidate);
  const ca = a.createDataChannel("bench", { negotiated: true, id: 0, ordered: true });
  const cb = b.createDataChannel("bench", { negotiated: true, id: 0, ordered: true });
  await a.setLocalDescription();
  await b.setRemoteDescription(a.localDescription!);
  await b.setLocalDescription();
  await a.setRemoteDescription(b.localDescription!);
  await Promise.all(
    [ca, cb].map(
      (c) => new Promise<void>((resolve, reject) => {
        if (c.readyState === "open") resolve();
        c.onopen = () => resolve();
        setTimeout(() => reject(new Error("DataChannel did not open")), 10_000);
      }),
    ),
  );
  return { a, b, ca, cb };
}

export function Benchmark() {
  const [settings, setSettings] = useState<Settings>({ sizeMb: 512, chunkKb: 4096, frameKb: 64, highWaterKb: 1024, window: 6, files: 1 });
  const [live, setLive] = useState<Live | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const field = (key: keyof Settings, label: string, min: number, max: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`bench-${key}`}>{label}</Label>
      <Input
        id={`bench-${key}`}
        type="number"
        min={min}
        max={max}
        value={settings[key]}
        disabled={running}
        onChange={(event) => setSettings((s) => ({ ...s, [key]: Math.min(max, Math.max(min, Number(event.target.value) || min)) }))}
      />
    </div>
  );

  const run = async () => {
    setRunning(true);
    const size = settings.sizeMb * MiB;
    const chunkSize = settings.chunkKb * 1024;
    const total = size * settings.files;
    const verifiedBySlot = new Map<number, number>();
    const started = performance.now();
    let stopped = false;
    let link: Awaited<ReturnType<typeof connectLoopback>> | null = null;
    let statsTimer: ReturnType<typeof setInterval> | null = null;
    let latestStats: LinkStats | null = null;
    stopRef.current = () => {
      stopped = true;
    };
    setLive({ verified: 0, total, elapsedMs: 0, bufferedAmount: 0, stats: null, done: false, error: null });
    try {
      link = await connectLoopback();
      const tx = new DataChannelTransport(link.ca as unknown as DataChannelLike, settings.highWaterKb * 1024);
      const rx = new DataChannelTransport(link.cb as unknown as DataChannelLike);
      const receivers = new Map<number, FileReceiver>();
      const senders = new Map<number, FileSender>();
      tx.events.on("ctl", (ctl) => "slot" in ctl && senders.get(ctl.slot)?.handleCtl(ctl));
      rx.events.on("frame", (frame) => receivers.get(frame.slot)?.handleFrame(frame));
      rx.events.on("ctl", (ctl) => {
        if (ctl.t === "file_open") {
          const receiver = new FileReceiver({
            transport: rx,
            slot: ctl.slot,
            transferId: ctl.transferId,
            size: ctl.size,
            chunkSize: ctl.chunkSize,
            totalChunks: ctl.totalChunks,
            window: settings.window,
            sink: new DiscardSink(),
            digests: new Map(),
            persistDigest: async () => {},
          });
          receivers.set(ctl.slot, receiver);
          void receiver.start();
        } else if ("slot" in ctl) {
          receivers.get(ctl.slot)?.handleCtl(ctl);
        }
      });

      const pc = link.a;
      statsTimer = setInterval(async () => {
        latestStats = parseStats(await pc.getStats());
        const verified = [...verifiedBySlot.values()].reduce((a, b) => a + b, 0);
        setLive({ verified, total, elapsedMs: performance.now() - started, bufferedAmount: tx.bufferedAmount, stats: latestStats, done: false, error: null });
        if (stopped) for (const s of senders.values()) s.stop("cancelled");
      }, 500);

      const runs = Array.from({ length: settings.files }, (_, i) => {
        const slot = i + 1;
        const sender = new FileSender({
          transport: tx,
          slot,
          transferId: `tr_benchmark_${slot}`,
          source: new SyntheticSource(size, slot),
          chunkSize,
          totalChunks: totalChunks(size, chunkSize),
          frameSize: settings.frameKb * 1024,
          window: settings.window,
          onProgress: (bytes) => verifiedBySlot.set(slot, bytes),
        });
        senders.set(slot, sender);
        return sender.run();
      });
      const results = await Promise.all(runs);
      const failed = results.find((r) => r.kind !== "done");
      const verified = [...verifiedBySlot.values()].reduce((a, b) => a + b, 0);
      setLive({
        verified,
        total,
        elapsedMs: performance.now() - started,
        bufferedAmount: 0,
        stats: latestStats,
        done: true,
        error: failed ? `Stopped: ${failed.kind}` : null,
      });
    } catch (error) {
      setLive((current) => ({ ...(current ?? { verified: 0, total, elapsedMs: 0, bufferedAmount: 0, stats: null }), done: true, error: String(error) }));
    } finally {
      if (statsTimer) clearInterval(statsTimer);
      link?.a.close();
      link?.b.close();
      stopRef.current = null;
      setRunning(false);
    }
  };

  const throughput = live && live.elapsedMs > 0 ? (live.verified * 1000) / live.elapsedMs : null;
  const remaining = live && throughput ? (live.total - live.verified) / throughput : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Synthetic transfer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {field("sizeMb", "File size (MiB)", 1, 20480)}
          {field("files", "Concurrent files", 1, 8)}
          {field("chunkKb", "Chunk size (KiB)", 16, 65536)}
          {field("frameKb", "Frame size (KiB)", 1, 256)}
          {field("highWaterKb", "Buffer threshold (KiB)", 256, 8192)}
          {field("window", "Credit window (chunks)", 1, 32)}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => void run()} disabled={running}>
              {running ? "Running…" : "Start"}
            </Button>
            <Button variant="outline" onClick={() => stopRef.current?.()} disabled={!running}>
              Stop
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Runs two RTCPeerConnections inside this page (loopback). Bytes are generated, hashed, sent, verified and
            discarded, so the disk is not part of the measurement.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {live ? (
            <>
              <Progress value={(live.verified / Math.max(1, live.total)) * 100} aria-label="Benchmark progress" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                {(
                  [
                    ["Type", live.stats ? `${live.stats.path} (${live.stats.localCandidateType ?? "?"} → ${live.stats.remoteCandidateType ?? "?"})` : "—"],
                    ["RTT", live.stats?.rttMs != null ? `${live.stats.rttMs} ms` : "—"],
                    ["Throughput", formatSpeed(throughput)],
                    ["Buffered amount", formatBytes(live.bufferedAmount)],
                    ["Packet loss", "n/a (not exposed for data channels)"],
                    ["Verified", `${formatBytes(live.verified)} / ${formatBytes(live.total)}`],
                    ["Elapsed", formatDuration(live.elapsedMs / 1000)],
                    ["Remaining", live.done ? "—" : formatDuration(remaining)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="break-words font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {live.done ? (
                <p className={live.error ? "text-sm text-destructive" : "text-sm text-success"} role="status">
                  {live.error ?? `Done: ${formatSpeed(throughput)} average over ${formatDuration(live.elapsedMs / 1000)}`}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Press Start to measure.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
