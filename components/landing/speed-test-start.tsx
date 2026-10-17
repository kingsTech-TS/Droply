"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GaugeIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDevice } from "@/hooks/use-device";
import { userMessage } from "@/lib/api/errors";
import { createRoom } from "@/lib/api/rooms";
import { rememberRoom } from "@/lib/session/my-rooms";
import { saveSession, toStoredSession } from "@/lib/session/session-store";

/** Opens a room in speed-test mode: the test starts when another device joins. */
export function SpeedTestStart() {
  const router = useRouter();
  const { device, commitName } = useDevice();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const session = await createRoom({
        device_name: commitName(),
        device_type: device?.type ?? "unknown",
        browser: device?.browser ?? null,
        operating_system: device?.os ?? null,
      });
      saveSession(toStoredSession(session));
      rememberRoom(session);
      router.push(`/room/${encodeURIComponent(session.room_id)}?test=1`);
    } catch (error) {
      toast.error(userMessage(error));
      setBusy(false);
    }
  };
  return (
    <Button size="lg" onClick={() => void start()} disabled={busy}>
      <GaugeIcon aria-hidden />
      {busy ? "Opening…" : "Start a speed test"}
    </Button>
  );
}
