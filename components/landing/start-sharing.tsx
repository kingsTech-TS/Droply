"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GaugeIcon, PartyPopperIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/transfer/drop-zone";
import { useDevice } from "@/hooks/use-device";
import { useLocalStore } from "@/hooks/use-local-store";
import { useRoomTheme } from "@/hooks/use-room-theme";
import { userMessage } from "@/lib/api/errors";
import { createRoom } from "@/lib/api/rooms";
import { takeSharedPayload } from "@/lib/pwa/shared-inbox";
import { setPendingFiles, setPendingText } from "@/lib/session/pending-files";
import { rememberRoom } from "@/lib/session/my-rooms";
import { saveSession, toStoredSession } from "@/lib/session/session-store";
import type { RoomKind } from "@/types/room";
import { createTheme, ThemePicker } from "./theme-picker";

interface StartOptions {
  kind?: RoomKind;
  speedTest?: boolean;
  text?: string | null;
}

/** Drop or pick files (or just create a room): creates a room and opens it. */
export function StartSharing() {
  const router = useRouter();
  const params = useSearchParams();
  const { device, commitName } = useDevice();
  const [busy, setBusy] = useState(false);
  const handledShare = useRef(false);
  const theme = useLocalStore(createTheme);
  // Preview the chosen theme on this page; the room keeps it.
  useRoomTheme(theme);

  const start = async (files: File[], options: StartOptions = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const session = await createRoom(
        {
          device_name: commitName(),
          device_type: device?.type ?? "unknown",
          browser: device?.browser ?? null,
          operating_system: device?.os ?? null,
        },
        undefined,
        options.kind ?? "standard",
        options.speedTest ? "default" : theme,
      );
      saveSession(toStoredSession(session));
      rememberRoom(session);
      setPendingFiles(files);
      setPendingText(options.text ?? null);
      router.push(`/room/${encodeURIComponent(session.room_id)}${options.speedTest ? "?test=1" : ""}`);
    } catch (error) {
      toast.error(userMessage(error));
      setBusy(false);
    }
  };

  // Shared from another app's share sheet (PWA): open a room with what was shared.
  useEffect(() => {
    if (params.get("share") !== "1" || handledShare.current || !device) return;
    handledShare.current = true;
    void takeSharedPayload().then((payload) => {
      if (payload && (payload.files.length > 0 || payload.text)) void start(payload.files, { text: payload.text });
    });
    // `start` is stable enough for a one-time action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, device]);

  return (
    <div className="space-y-3">
      <DropZone onFiles={(files) => void start(files)} disabled={busy} title={busy ? "Creating your room…" : "Drop files here"} />
      <ThemePicker value={theme} onChange={(t) => createTheme.set(t)} disabled={busy} />
      <div className="flex flex-col items-center gap-y-1 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-2">
        <Button variant="link" onClick={() => void start([])} disabled={busy}>
          Create an empty room to receive
        </Button>
        <span aria-hidden className="hidden text-muted-foreground sm:inline">·</span>
        <Button variant="link" onClick={() => void start([], { kind: "event" })} disabled={busy}>
          <PartyPopperIcon aria-hidden />
          Host an event
        </Button>
        <span aria-hidden className="hidden text-muted-foreground sm:inline">·</span>
        <Button asChild variant="link">
          <Link href="/speed-test">
            <GaugeIcon aria-hidden />
            Speed test
          </Link>
        </Button>
      </div>
    </div>
  );
}

