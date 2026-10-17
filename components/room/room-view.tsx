"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DiagnosticsPanel } from "@/components/dev/diagnostics-panel";
import { DropZone } from "@/components/transfer/drop-zone";
import type { SelectedFileMeta } from "@/components/transfer/file-item";
import { IncomingTransfer } from "@/components/transfer/incoming-transfer";
import { SendPanel } from "@/components/transfer/send-panel";
import { StoragePanel } from "@/components/transfer/storage-panel";
import type { TransferCardActions } from "@/components/transfer/transfer-card";
import { TransferList } from "@/components/transfer/transfer-list";
import { env } from "@/config/env";
import { useLeaveWarning } from "@/hooks/use-page-lifecycle";
import { usePeerLinks, useRoom, useRoomSession, useTransfers } from "@/hooks/use-room-session";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { userMessage } from "@/lib/api/errors";
import { takePendingFiles } from "@/lib/session/pending-files";
import { randomId } from "@/lib/utils/id";
import type { Notice, TransferSnapshot } from "@/lib/webrtc/transfer-manager";
import { isActive } from "@/lib/webrtc/transfer-view";
import { ConnectingAnimation } from "./connecting-animation";
import { ConnectionBanner } from "./connection-banner";
import { DeviceList } from "./device-list";
import { RoomEnded } from "./room-ended";
import { RoomHeader } from "./room-header";
import { RoomSharePanel } from "./room-share-panel";

function showNotice(notice: Notice): void {
  if (notice.kind === "success") toast.success(notice.message);
  else if (notice.kind === "error") toast.error(notice.message);
  else if (notice.kind === "warning") toast.warning(notice.message);
  else toast(notice.message);
}

export function RoomView() {
  const session = useRoomSession();
  const room = useRoom();
  const transfers = useTransfers();
  const links = usePeerLinks();
  const router = useRouter();

  // Selected File objects live in a ref; React state only holds their metadata.
  const filesRef = useRef(new Map<string, File>());
  const [selection, setSelection] = useState<SelectedFileMeta[]>([]);
  // The user's own recipient choice; null until they touch it.
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  // The user's own share-panel choice, remembered only while "alone" stays the same.
  const [shareChoice, setShareChoice] = useState<{ open: boolean; alone: boolean } | null>(null);
  const quickPick = useRef<HTMLInputElement>(null);

  const others = useMemo(() => room.devices.filter((d) => d.device_id !== room.selfId), [room.devices, room.selfId]);
  const online = useMemo(() => others.filter((d) => d.connection_state === "connected"), [others]);
  const recipients = useMemo(() => {
    const ids = new Set(online.map((d) => d.device_id));
    // With exactly one other device online and no choice made, select it automatically.
    if (chosen === null) return online.length === 1 ? ids : new Set<string>();
    return new Set([...chosen].filter((id) => ids.has(id)));
  }, [chosen, online]);
  const setRecipients = setChosen;
  const alone = others.length === 0;
  // Open while alone (show the code), collapsed once someone has joined.
  const shareOpen = shareChoice && shareChoice.alone === alone ? shareChoice.open : alone;
  const setShareOpen = (open: boolean) => setShareChoice({ open, alone });
  const deviceName = useCallback(
    (id: string) => room.devices.find((d) => d.device_id === id)?.device_name ?? "Unknown device",
    [room.devices],
  );
  const anyActive = transfers.items.some(isActive);

  useWakeLock(anyActive);
  useLeaveWarning(anyActive);

  useEffect(() => session.notices.on("notice", showNotice), [session]);

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const metas = files.map((file) => {
      const id = randomId("sel_");
      filesRef.current.set(id, file);
      return { id, name: file.name, size: file.size, type: file.type };
    });
    setSelection((current) => [...current, ...metas]);
  }, []);

  // Files picked on the landing page before the room existed.
  useEffect(() => {
    addFiles(takePendingFiles());
  }, [addFiles]);

  const removeFile = (id: string) => {
    filesRef.current.delete(id);
    setSelection((current) => current.filter((f) => f.id !== id));
  };
  const clearFiles = () => {
    filesRef.current.clear();
    setSelection([]);
  };
  const send = () => {
    const files = selection.map((meta) => filesRef.current.get(meta.id)).filter((f): f is File => f !== undefined);
    const count = session.transfers.send(files, [...recipients]);
    if (count > 0) clearFiles();
  };

  const sendTo = (deviceId: string) => {
    setRecipients(new Set([deviceId]));
    if (selection.length === 0) quickPick.current?.click();
  };

  const actionsFor = useCallback(
    (item: TransferSnapshot): TransferCardActions => {
      const t = session.transfers;
      const guard = (fn: () => Promise<unknown>) => () => void fn().catch((error: unknown) => toast.error(userMessage(error)));
      return {
        pause: guard(() => t.pause(item.localId)),
        resume: guard(() => t.resume(item.localId)),
        cancel: guard(() => t.cancel(item.localId)),
        retry: guard(() => t.retry(item.localId)),
        save: guard(() => t.save(item.localId)),
        dismiss: () => t.dismiss(item.localId),
        reselect: (file) =>
          void t.provideFile(item.localId, file).then((ok) => {
            if (!ok) toast.error("That's not the same file. Select the original file to resume.");
          }),
      };
    },
    [session],
  );

  const leave = () => {
    session.leave();
    router.push("/");
  };
  const closeRoom = () => {
    void session
      .closeForEveryone()
      .then(() => router.push("/"))
      .catch((error: unknown) => toast.error(userMessage(error)));
  };

  if (room.status === "ended") {
    return (
      <>
        <RoomHeader code={room.roomCode} isHost={false} transfersActive={false} onLeave={() => router.push("/")} onCloseRoom={() => undefined} />
        <main className="flex-1">
          <RoomEnded reason={room.endReason} />
        </main>
      </>
    );
  }

  const transferItems = transfers.items;
  const requestCards = transfers.requests.map((request) => (
    <IncomingTransfer
      key={request.key}
      request={request}
      senderName={deviceName(request.senderId)}
      files={transferItems.filter((item) => request.transferIds.includes(item.localId))}
      checkStorage={() => session.transfers.storageFits(request.key)}
      onAccept={({ directory, trust }) =>
        void session.transfers.accept(request.key, { directory: directory ?? null, trust }).catch((error: unknown) =>
          toast.error(userMessage(error)),
        )
      }
      onDecline={() => void session.transfers.decline(request.key)}
    />
  ));

  return (
    <>
      <RoomHeader
        code={room.roomCode}
        isHost={room.hostDeviceId === room.selfId}
        transfersActive={anyActive}
        onLeave={leave}
        onCloseRoom={closeRoom}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        <ConnectionBanner room={room} onRetry={() => session.retryConnection()} />
        {requestCards.length > 0 ? (
          <div className="space-y-3" aria-live="polite">
            {requestCards}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <aside className={`min-w-0 space-y-6 ${alone ? "order-1" : "order-2"} lg:order-1`}>
            <RoomSharePanel
              code={room.roomCode}
              joinUrl={room.joinUrl}
              expiresAt={room.expiresAt}
              open={shareOpen}
              onOpenChange={setShareOpen}
            />
            {alone ? (
              <ConnectingAnimation />
            ) : (
              <DeviceList
                devices={room.devices}
                selfId={room.selfId}
                links={links}
                onSendTo={sendTo}
                onRetry={(id) => session.retryPeer(id)}
              />
            )}
          </aside>

          <div className={`min-w-0 space-y-6 ${alone ? "order-2" : "order-1"} lg:order-2`}>
            {!alone ? (
              <p className="text-sm text-muted-foreground lg:hidden">
                {online.length === 1 ? "1 device connected" : `${online.length} devices connected`}
              </p>
            ) : null}
            {selection.length > 0 ? (
              <>
                <SendPanel
                  files={selection}
                  recipients={online}
                  selected={recipients}
                  onSelectedChange={setRecipients}
                  onRemove={removeFile}
                  onClear={clearFiles}
                  onSend={send}
                />
                <DropZone onFiles={addFiles} compact title="Add more files" />
              </>
            ) : (
              <DropZone onFiles={addFiles} />
            )}
            <TransferList items={transferItems} deviceName={deviceName} links={links} actionsFor={actionsFor} />
            <StoragePanel
              bytes={session.transfers.temporaryBytes()}
              onClear={() => void session.transfers.clearTemporaryData()}
            />
            {env.debug ? <DiagnosticsPanel /> : null}
          </div>
        </div>

        <input
          ref={quickPick}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </main>
    </>
  );
}
