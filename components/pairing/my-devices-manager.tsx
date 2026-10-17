"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, LinkIcon, RefreshCwIcon, Share2Icon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceAvatar } from "@/components/room/device-avatar";
import { useDevice } from "@/hooks/use-device";
import { useLocalStore } from "@/hooks/use-local-store";
import { userMessage } from "@/lib/api/errors";
import {
  ensureRoomLinkKey,
  forgetPairedDevice,
  pairing,
  resetRoomLinkKey,
  roomLinkKey,
  roomLinkUrl,
  unpairAll,
} from "@/lib/pairing/pairing";
import { enterRendezvous } from "@/lib/session/rendezvous-join";

export function MyDevicesManager() {
  const router = useRouter();
  const state = useLocalStore(pairing);
  const linkKey = useLocalStore(roomLinkKey);
  const { device, commitName } = useDevice();
  const [busy, setBusy] = useState<"devices" | "link" | null>(null);
  const [copied, setCopied] = useState(false);

  const info = () => ({
    device_name: commitName(),
    device_type: device?.type ?? "unknown",
    browser: device?.browser ?? null,
    operating_system: device?.os ?? null,
  });

  const go = async (key: string, mode: "my-devices" | "room-link") => {
    setBusy(mode === "my-devices" ? "devices" : "link");
    try {
      const roomId = await enterRendezvous(key, mode, info());
      router.push(`/room/${encodeURIComponent(roomId)}`);
    } catch (error) {
      toast.error(userMessage(error));
      setBusy(null);
    }
  };

  const link = linkKey ? roomLinkUrl(linkKey) : null;
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My devices</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paired devices find each other without a room code, and files between them are accepted automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No paired devices yet. Open a room on two of your devices, then choose <span className="font-medium text-foreground">Add to My devices</span>{" "}
              in the other device&apos;s menu.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {state.devices.map((d) => (
                <li key={d.name} className="flex items-center gap-3 p-3">
                  <DeviceAvatar name={d.name} type={d.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">Paired {new Date(d.pairedAt).toLocaleDateString()}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => forgetPairedDevice(d.name)} aria-label={`Forget ${d.name}`}>
                    <TrashIcon aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => state.key && void go(state.key, "my-devices")} disabled={!state.key || state.devices.length === 0 || busy !== null}>
              {busy === "devices" ? "Connecting…" : "Connect my devices"}
            </Button>
            {state.key ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost">Unpair all</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Unpair this device?</AlertDialogTitle>
                    <AlertDialogDescription>
                      It will stop meeting your other devices automatically. You can pair again any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction onClick={unpairAll}>Unpair</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon aria-hidden className="size-5 text-primary" />
            My room link
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            A personal link that always opens your room. Share it with friends so they can drop files to you any time you have Droply
            open. Anyone with the link can join, so share it carefully and reset it if needed.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {link ? (
            <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">{link}</p>
          ) : (
            <Button variant="secondary" onClick={() => ensureRoomLinkKey()}>
              Create my room link
            </Button>
          )}
          {link && linkKey ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void go(linkKey, "room-link")} disabled={busy !== null}>
                {busy === "link" ? "Opening…" : "Open my room"}
              </Button>
              <Button variant="outline" onClick={() => void copy()}>
                {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                <Button variant="outline" onClick={() => void navigator.share({ title: "My Droply room", url: link }).catch(() => undefined)}>
                  <Share2Icon aria-hidden />
                  Share
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => {
                  resetRoomLinkKey();
                  toast.success("New link created. The old one no longer works.");
                }}
              >
                <RefreshCwIcon aria-hidden />
                Reset link
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
