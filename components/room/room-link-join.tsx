"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DicesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDevice } from "@/hooks/use-device";
import { userMessage } from "@/lib/api/errors";
import { MAX_DEVICE_NAME } from "@/lib/device/device-name";
import { isValidKey } from "@/lib/pairing/pairing";
import { enterRendezvous } from "@/lib/session/rendezvous-join";
import { DeviceAvatar } from "./device-avatar";

/** Joins someone's personal room link (droply.app/r/<key>). No code needed. */
export function RoomLinkJoin({ linkKey }: { linkKey: string }) {
  const router = useRouter();
  const { device, name, setName, shuffleName, commitName } = useDevice();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const valid = isValidKey(linkKey);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const roomId = await enterRendezvous(linkKey, "room-link", {
        device_name: commitName(),
        device_type: device?.type ?? "unknown",
        browser: device?.browser ?? null,
        operating_system: device?.os ?? null,
      });
      router.push(`/room/${encodeURIComponent(roomId)}`);
    } catch (err) {
      setError(userMessage(err));
      setBusy(false);
    }
  };

  if (!valid) {
    return (
      <p role="alert" className="text-center text-muted-foreground">
        This room link isn&apos;t valid. Ask for a new one.
      </p>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="items-center text-center">
        <CardTitle className="text-2xl">Join this room</CardTitle>
        <p className="text-sm text-muted-foreground">Someone shared their personal Droply room with you.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor={nameId}>Your device name</Label>
            <div className="flex items-center gap-2">
              {device ? <DeviceAvatar name={name} type={device.type} className="size-11" /> : null}
              <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_DEVICE_NAME} autoComplete="off" required />
              <Button type="button" variant="outline" size="icon" onClick={shuffleName} aria-label="Pick a random fun name">
                <DicesIcon aria-hidden />
              </Button>
            </div>
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !name.trim()}>
            {busy ? "Joining…" : "Join room"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
