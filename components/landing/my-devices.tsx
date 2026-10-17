"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LaptopIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeviceAvatar } from "@/components/room/device-avatar";
import { useDevice } from "@/hooks/use-device";
import { useLocalStore } from "@/hooks/use-local-store";
import { userMessage } from "@/lib/api/errors";
import { pairing } from "@/lib/pairing/pairing";
import { enterRendezvous } from "@/lib/session/rendezvous-join";

/** One tap to meet your paired devices, no code needed. */
export function MyDevices() {
  const router = useRouter();
  const state = useLocalStore(pairing);
  const { device, commitName } = useDevice();
  const [busy, setBusy] = useState(false);

  if (!state.key || state.devices.length === 0) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <LinkIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Tip: pair your own phone and laptop once and they&apos;ll find each other without a code. Open a room on both,
          then choose <span className="font-medium text-foreground">Add to My devices</span> on the other device&apos;s card.
        </span>
      </p>
    );
  }

  const connect = async () => {
    if (!state.key) return;
    setBusy(true);
    try {
      const roomId = await enterRendezvous(state.key, "my-devices", {
        device_name: commitName(),
        device_type: device?.type ?? "unknown",
        browser: device?.browser ?? null,
        operating_system: device?.os ?? null,
      });
      router.push(`/room/${encodeURIComponent(roomId)}`);
    } catch (error) {
      toast.error(userMessage(error));
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="flex items-center gap-2 font-semibold">
            <LaptopIcon aria-hidden className="size-5 text-primary" />
            My devices
          </p>
          <ul className="flex flex-wrap gap-2">
            {state.devices.map((d) => (
              <li key={d.name} className="flex items-center gap-2 rounded-full bg-muted py-1 pl-1 pr-3 text-sm">
                <DeviceAvatar name={d.name} type={d.type} className="size-7 rounded-full text-sm" />
                <span className="max-w-40 truncate">{d.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button onClick={() => void connect()} disabled={busy}>
            {busy ? "Connecting…" : "Connect my devices"}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/my-devices">Manage</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
