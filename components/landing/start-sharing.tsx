"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/transfer/drop-zone";
import { useDevice } from "@/hooks/use-device";
import { userMessage } from "@/lib/api/errors";
import { createRoom } from "@/lib/api/rooms";
import { setPendingFiles } from "@/lib/session/pending-files";
import { saveSession, toStoredSession } from "@/lib/session/session-store";

/** Drop or pick files (or just create a room): creates a room and opens it. */
export function StartSharing() {
  const router = useRouter();
  const { device, commitName } = useDevice();
  const [busy, setBusy] = useState(false);

  const start = async (files: File[]) => {
    if (busy) return;
    setBusy(true);
    try {
      const session = await createRoom({
        device_name: commitName(),
        device_type: device?.type ?? "unknown",
        browser: device?.browser ?? null,
        operating_system: device?.os ?? null,
      });
      saveSession(toStoredSession(session));
      setPendingFiles(files);
      router.push(`/room/${encodeURIComponent(session.room_id)}`);
    } catch (error) {
      toast.error(userMessage(error));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <DropZone onFiles={(files) => void start(files)} disabled={busy} title={busy ? "Creating your room…" : "Drop files here"} />
      <div className="text-center">
        <Button variant="link" onClick={() => void start([])} disabled={busy}>
          Or create an empty room to receive files
        </Button>
      </div>
    </div>
  );
}
