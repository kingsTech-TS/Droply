"use client";

import { useEffect, useRef, useState } from "react";
import { BugIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePeerLinks, useRoom, useRoomSession } from "@/hooks/use-room-session";
import { formatBytes, formatSpeed } from "@/lib/utils/format";

interface LiveChannel {
  bufferedAmount: number;
  highWater: number;
  throughput: number | null;
}

/** Development diagnostics. Only rendered when NEXT_PUBLIC_DEBUG=true. */
export function DiagnosticsPanel() {
  const session = useRoomSession();
  const room = useRoom();
  const links = usePeerLinks();
  const [live, setLive] = useState<Record<string, LiveChannel>>({});
  const lastBytes = useRef(new Map<string, { bytes: number; t: number }>());

  useEffect(() => {
    const timer = setInterval(() => {
      const next: Record<string, LiveChannel> = {};
      for (const peerId of Object.keys(session.peers.links.getSnapshot())) {
        const transport = session.peers.get(peerId)?.transport;
        if (!transport) continue;
        const now = performance.now();
        const previous = lastBytes.current.get(peerId);
        const queued = transport.bytesQueued - transport.bufferedAmount;
        const throughput = previous ? ((queued - previous.bytes) * 1000) / (now - previous.t) : null;
        lastBytes.current.set(peerId, { bytes: queued, t: now });
        next[peerId] = { bufferedAmount: transport.bufferedAmount, highWater: transport.currentHighWater, throughput };
      }
      setLive(next);
    }, 1000);
    return () => clearInterval(timer);
  }, [session]);

  return (
    <Collapsible className="rounded-xl border border-dashed bg-card">
      <CollapsibleTrigger className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-4 text-sm font-medium">
        <BugIcon aria-hidden className="size-4" />
        Diagnostics
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 px-4 pb-4 font-mono text-xs">
        <p>
          self {room.selfId} · ws {room.signaling} · attempts {room.reconnectAttempts}
        </p>
        {Object.values(links).length === 0 ? <p className="text-muted-foreground">No peer links yet.</p> : null}
        {Object.values(links).map((link) => {
          const channel = live[link.peerId];
          return (
            <dl key={link.peerId} className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/60 p-3">
              {(
                [
                  ["Peer ID", link.peerId],
                  ["Connection id", link.connectionId ?? "—"],
                  ["Link status", link.status],
                  ["Connection state", link.connectionState],
                  ["ICE connection state", link.iceConnectionState],
                  ["ICE candidate type", `${link.localCandidateType ?? "?"} → ${link.remoteCandidateType ?? "?"} (${link.path})`],
                  ["DataChannel state", link.channelState],
                  ["Buffered amount", channel ? formatBytes(channel.bufferedAmount) : "—"],
                  ["High-water mark", channel ? formatBytes(channel.highWater) : "—"],
                  ["Frame size", formatBytes(link.frameSize)],
                  ["Current throughput", formatSpeed(channel?.throughput ?? null)],
                  ["RTT", link.rttMs !== null ? `${link.rttMs} ms` : "—"],
                  ["Packets lost", "n/a (not exposed for data channels)"],
                  ["Recovery attempts", String(link.attempts)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ))}
            </dl>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
