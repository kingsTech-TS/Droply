"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DicesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDevice } from "@/hooks/use-device";
import { isApiError, userMessage } from "@/lib/api/errors";
import { joinRoom } from "@/lib/api/rooms";
import { MAX_DEVICE_NAME } from "@/lib/device/device-name";
import { findSessionByCode, saveSession, toStoredSession } from "@/lib/session/session-store";
import { formatRoomCode } from "@/lib/utils/format";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/utils/room-code";
import { DeviceAvatar } from "./device-avatar";

export function JoinForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const { device, name, setName, shuffleName, commitName } = useDevice();
  const [code, setCode] = useState(() => normalizeRoomCode(initialCode));
  const [error, setError] = useState<{ message: string; fatal: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const codeId = useId();
  const validCode = isValidRoomCode(code);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validCode || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Re-opening a link in the same tab keeps the same device instead of a duplicate.
      const existing = findSessionByCode(code);
      const session = await joinRoom(
        code,
        {
          device_name: commitName(),
          device_type: device?.type ?? "unknown",
          browser: device?.browser ?? null,
          operating_system: device?.os ?? null,
        },
        existing?.token ?? null,
      );
      saveSession(toStoredSession(session));
      router.push(`/room/${encodeURIComponent(session.room_id)}`);
    } catch (err) {
      const fatal = isApiError(err) && (err.code === "ROOM_EXPIRED" || err.code === "INVALID_ROOM_CODE" || err.code === "ROOM_NOT_FOUND");
      setError({ message: userMessage(err), fatal });
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="items-center text-center">
        <CardTitle className="text-2xl">Join room</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor={codeId}>Room</Label>
            <Input
              id={codeId}
              value={validCode ? formatRoomCode(code) : code}
              onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!validCode}
              className="text-center font-mono text-2xl uppercase tracking-[0.25em]"
            />
            {!validCode ? (
              <p className="text-sm text-destructive">Room codes have 6 letters and numbers.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={nameId}>Your device name</Label>
            <div className="flex items-center gap-2">
              {device ? <DeviceAvatar name={name} type={device.type} className="size-11" /> : null}
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_DEVICE_NAME}
                autoComplete="off"
                required
              />
              <Button type="button" variant="outline" size="icon" onClick={shuffleName} aria-label="Pick a random fun name">
                <DicesIcon aria-hidden />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Other devices in the room will see this name.</p>
          </div>

          {error ? (
            <div role="alert" className="space-y-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <p>{error.message}</p>
              {error.fatal ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/">Create new room</Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={!validCode || busy || !name.trim()}>
            {busy ? "Joining…" : "Join room"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
