"use client";

import { LinkIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pairing } from "@/lib/pairing/pairing";
import type { PairRequest } from "@/lib/session/room-session";

export function PairRequestDialog({
  request,
  onRespond,
}: {
  request: PairRequest | null;
  onRespond: (peerId: string, accept: boolean) => void;
}) {
  const alreadyInGroup = pairing.get().devices.length > 0 && pairing.get().key !== request?.key;
  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && request && onRespond(request.peerId, false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LinkIcon aria-hidden className="size-5 text-primary" />
            Add to My devices?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{request?.name}</span> wants to pair with this device. Paired
            devices find each other without a room code and send files without asking each time. Only pair your own devices.
            {alreadyInGroup ? " This replaces your current pairing." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => request && onRespond(request.peerId, false)}>Not now</AlertDialogCancel>
          <Button onClick={() => request && onRespond(request.peerId, true)}>Pair</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
