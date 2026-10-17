"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ImagesIcon, KeyboardIcon, MessageSquareTextIcon, MessagesSquareIcon } from "lucide-react";
import { toast } from "sonner";
import { DiagnosticsPanel } from "@/components/dev/diagnostics-panel";
import { DropZone } from "@/components/transfer/drop-zone";
import type { SelectedFileMeta } from "@/components/transfer/file-item";
import { IncomingTransfer } from "@/components/transfer/incoming-transfer";
import { SendPanel } from "@/components/transfer/send-panel";
import { StoragePanel } from "@/components/transfer/storage-panel";
import type { TransferCardActions } from "@/components/transfer/transfer-card";
import { TransferList } from "@/components/transfer/transfer-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { env } from "@/config/env";
import { useLocalStore } from "@/hooks/use-local-store";
import { useLeaveWarning } from "@/hooks/use-page-lifecycle";
import {
  useInbox,
  usePairRequests,
  usePeerLinks,
  useRoom,
  useRoomSession,
  useTransfers,
  useUnreadChat,
} from "@/hooks/use-room-session";
import { useBackgroundNotifications, useCelebrations, useKeyboardShortcuts } from "@/hooks/use-room-effects";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { userMessage } from "@/lib/api/errors";
import { preferences } from "@/lib/fun/prefs";
import { THEME_STYLES } from "@/lib/fun/themes";
import { compressPhotos } from "@/lib/media/compress";
import { pairing } from "@/lib/pairing/pairing";
import { takePendingFiles, takePendingText } from "@/lib/session/pending-files";
import { saveFile } from "@/lib/storage/save";
import { cn } from "@/lib/utils/cn";
import { randomId } from "@/lib/utils/id";
import { joinUrlFor } from "@/lib/utils/join-url";
import { LocalStore } from "@/lib/utils/local-store";
import type { Notice, TransferSnapshot } from "@/lib/webrtc/transfer-manager";
import { isActive } from "@/lib/webrtc/transfer-view";
import { AlbumDialog, type AlbumItem } from "./album-dialog";
import { ChatPanel } from "./chat-panel";
import { ConnectingAnimation } from "./connecting-animation";
import { ConnectionBanner } from "./connection-banner";
import { DeviceList } from "./device-list";
import { PairRequestDialog } from "./pair-request-dialog";
import { PresentDialog } from "./present-dialog";
import { ExpiryPrompt, KeepTabOpenBanner } from "./room-banners";
import { RoomEnded } from "./room-ended";
import { RoomHeader } from "./room-header";
import { RoomSettings } from "./room-settings";
import { RoomSharePanel } from "./room-share-panel";
import { SpeedTestDialog } from "./speed-test-dialog";
import { TextDropDialog, TextInbox } from "./text-drop";

/** Names of the devices last sent to, so they can be preselected next time. */
const lastRecipients = new LocalStore<string[]>("droply:last-recipients", [], (raw) =>
  Array.isArray(raw) ? raw.filter((n): n is string => typeof n === "string").slice(0, 20) : null,
);

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
  const inbox = useInbox();
  const unreadChat = useUnreadChat();
  const pairRequests = usePairRequests();
  const pairState = useLocalStore(pairing);
  const prefs = useLocalStore(preferences);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Selected File objects live in a ref; React state only holds their metadata.
  const filesRef = useRef(new Map<string, File>());
  const [selection, setSelection] = useState<SelectedFileMeta[]>([]);
  // The user's own recipient choice; null until they touch it.
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  // The user's own share-panel choice, remembered only while "alone" stays the same.
  const [shareChoice, setShareChoice] = useState<{ open: boolean; alone: boolean } | null>(null);
  const [textDialog, setTextDialog] = useState<{ open: boolean; text: string; recipients: Set<string> }>({
    open: false,
    text: "",
    recipients: new Set(),
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [speedTestPeer, setSpeedTestPeer] = useState<string | null>(null);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const quickPick = useRef<HTMLInputElement>(null);

  const others = useMemo(() => room.devices.filter((d) => d.device_id !== room.selfId), [room.devices, room.selfId]);
  const online = useMemo(() => others.filter((d) => d.connection_state === "connected"), [others]);
  const remembered = useLocalStore(lastRecipients);
  const recipients = useMemo(() => {
    const ids = new Set(online.map((d) => d.device_id));
    if (chosen === null) {
      // With one device online, select it. Otherwise preselect the devices used last time.
      if (online.length === 1) return ids;
      return new Set(online.filter((d) => remembered.includes(d.device_name)).map((d) => d.device_id));
    }
    return new Set([...chosen].filter((id) => ids.has(id)));
  }, [chosen, online, remembered]);
  const alone = others.length === 0;
  const shareOpen = shareChoice && shareChoice.alone === alone ? shareChoice.open : alone;
  const pairedNames = useMemo(() => new Set(pairState.devices.map((d) => d.name)), [pairState.devices]);
  const deviceName = useCallback(
    (id: string) => room.devices.find((d) => d.device_id === id)?.device_name ?? "Unknown device",
    [room.devices],
  );
  const anyActive = transfers.items.some(isActive);
  const isHost = room.hostDeviceId === room.selfId;
  const theme = THEME_STYLES[room.theme];

  useWakeLock(anyActive);
  useLeaveWarning(anyActive);
  useCelebrations(session);
  useBackgroundNotifications(session);
  useEffect(() => session.notices.on("notice", showNotice), [session]);
  useEffect(() => session.setChatOpen(chatOpen), [session, chatOpen]);

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const metas = files.map((file) => {
      const id = randomId("sel_");
      filesRef.current.set(id, file);
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
      const folder = relative.split("/").slice(0, -1).join("/") || null;
      return { id, name: file.name, size: file.size, type: file.type, folder };
    });
    setSelection((current) => [...current, ...metas]);
  }, []);

  // Files and text picked before the room existed (landing page or another app's share sheet).
  // They live in a module-level hand-off store that is read once, so this is a one-time sync.
  useEffect(() => {
    addFiles(takePendingFiles());
    const text = takePendingText();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (text) setTextDialog({ open: true, text, recipients: new Set() });
  }, [addFiles]);

  // Speed-test mode (from /speed-test): open the test as soon as a device is online.
  const wantsSpeedTest = searchParams.get("test") === "1";
  const [speedTestOffered, setSpeedTestOffered] = useState(false);
  if (wantsSpeedTest && !speedTestOffered && online.length > 0) {
    setSpeedTestOffered(true);
    setSpeedTestPeer(online[0]!.device_id);
  }

  const removeFile = (id: string) => {
    filesRef.current.delete(id);
    setSelection((current) => current.filter((f) => f.id !== id));
  };
  const clearFiles = () => {
    filesRef.current.clear();
    setSelection([]);
  };

  const sendFiles = useCallback(
    async (files: File[], to: string[]) => {
      if (files.length === 0 || to.length === 0) return 0;
      const prepared = prefs.sendSmallerPhotos ? await compressPhotos(files) : files;
      const count = session.transfers.send(prepared, to);
      if (count > 0) {
        lastRecipients.set(to.map(deviceName));
      }
      return count;
    },
    [deviceName, prefs.sendSmallerPhotos, session],
  );

  const send = async (to: readonly string[] = [...recipients]) => {
    const files = selection.map((meta) => filesRef.current.get(meta.id)).filter((f): f is File => f !== undefined);
    const count = await sendFiles(files, [...to]);
    if (count > 0) clearFiles();
  };

  // Scheduled send between paired devices: the files wait here (this tab) until one of the
  // user's own devices joins, then go to every device online at that moment.
  const [autoSend, setAutoSend] = useState(false);
  const autoSendTo = autoSend && room.mode === "my-devices" && selection.length > 0 ? online.map((d) => d.device_id) : [];
  const autoSendKey = autoSendTo.join(",");
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    if (!autoSendKey) return;
    void (async () => {
      await sendRef.current(autoSendKey.split(","));
      setAutoSend(false);
      toast.success("Your device connected. Sending now.");
    })();
  }, [autoSendKey]);

  const sendTo = (deviceId: string) => {
    setChosen(new Set([deviceId]));
    if (selection.length === 0) quickPick.current?.click();
  };

  const selectionBytes = selection.reduce((s, f) => s + f.size, 0);
  const estimate = recipients.size > 0 ? session.transfers.estimateSeconds(selectionBytes, [...recipients]) : null;

  useKeyboardShortcuts({
    onPasteFiles: addFiles,
    onPasteText: (text) => setTextDialog({ open: true, text, recipients: new Set(recipients) }),
    onOpenPicker: () => quickPick.current?.click(),
    onToggleRecipient: (index) => {
      const device = online[index];
      if (!device) return;
      const next = new Set(recipients);
      if (next.has(device.device_id)) next.delete(device.device_id);
      else next.add(device.device_id);
      setChosen(next);
    },
    onHelp: () => setHelpOpen(true),
  });

  // Media this device can show in previews and the album (File references, not copies).
  // Recompute when the list of items changes, not on every progress tick.
  const itemCount = transfers.items.length;
  const savedCount = transfers.items.filter((i) => i.save === "ready" || i.save === "saved").length;
  const mediaCandidates = useMemo(
    () => session.transfers.mediaCandidates(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, itemCount, savedCount],
  );
  const mediaMap = useMemo(() => new Map(mediaCandidates.map((m) => [m.localId, m.file])), [mediaCandidates]);

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
        react: (emoji) => void session.react(item.localId, emoji),
        sendAgain: () => {
          const file = t.fileFor(item.localId);
          if (file) {
            addFiles([file]);
            toast("Added back to “Files ready to send”. Pick who gets it.");
          }
        },
      };
    },
    [addFiles, session],
  );

  const saveAllZip = async () => {
    setZipProgress(0);
    try {
      await session.transfers.saveAsZip(undefined, (done, total) => setZipProgress(total ? done / total : 1));
    } catch (error) {
      toast.error(userMessage(error));
    } finally {
      setZipProgress(null);
    }
  };

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
  const joinUrl = joinUrlFor(room.roomCode, room.joinUrl);
  const speedPeer = speedTestPeer ? room.devices.find((d) => d.device_id === speedTestPeer) : undefined;

  return (
    <>
      <RoomHeader code={room.roomCode} isHost={isHost} transfersActive={anyActive} onLeave={leave} onCloseRoom={closeRoom} />
      <div className={cn("h-1.5 w-full bg-gradient-to-r", theme.banner)} aria-hidden />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {room.theme !== "default" || room.kind === "event" || room.mode !== "standard" ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {room.theme !== "default" ? (
              <span className="text-xl" aria-hidden>
                {theme.emoji}
              </span>
            ) : null}
            {room.mode === "my-devices" ? <Badge variant="default">My devices</Badge> : null}
            {room.mode === "room-link" ? <Badge variant="default">Personal room</Badge> : null}
            {room.kind === "event" ? <Badge variant="electric">Event room · up to {room.maxDevices} devices</Badge> : null}
            {room.theme !== "default" ? <span>{theme.label} room</span> : null}
          </p>
        ) : null}
        <ConnectionBanner room={room} onRetry={() => session.retryConnection()} />
        <ExpiryPrompt expiresAt={alone ? room.expiresAt : null} onKeepOpen={() => session.keepAlive()} />
        <KeepTabOpenBanner show={session.mobile && anyActive} />
        {requestCards.length > 0 ? (
          <div className="space-y-3" aria-live="polite">
            {requestCards}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <aside className={`min-w-0 space-y-6 ${alone ? "order-1" : "order-2"} lg:order-1`}>
            <RoomSharePanel
              code={room.roomCode}
              joinUrl={joinUrl}
              expiresAt={room.expiresAt}
              open={shareOpen}
              onOpenChange={(open) => setShareChoice({ open, alone })}
              onPresent={() => setPresentOpen(true)}
              settings={
                isHost ? (
                  <RoomSettings
                    theme={room.theme}
                    discoverable={room.discoverable}
                    onTheme={(t) => session.setTheme(t)}
                    onDiscoverable={(v) => session.setDiscoverable(v)}
                  />
                ) : undefined
              }
            />
            {alone ? (
              <ConnectingAnimation />
            ) : (
              <DeviceList
                devices={room.devices}
                selfId={room.selfId}
                links={links}
                pairedNames={pairedNames}
                actionsFor={(id) => ({
                  onSend: () => sendTo(id),
                  onDropFiles: (files) =>
                    void sendFiles(files, [id]).then((n) => n > 0 && toast.success(`Sending to ${deviceName(id)}`)),
                  onSendText: () => setTextDialog({ open: true, text: "", recipients: new Set([id]) }),
                  onSpeedTest: () => setSpeedTestPeer(id),
                  onPair: () => void session.requestPairing(id),
                  onRetry: (relayOnly) => session.retryPeer(id, relayOnly),
                })}
              />
            )}
          </aside>

          <div className={`min-w-0 space-y-6 ${alone ? "order-2" : "order-1"} lg:order-2`}>
            {!alone ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground lg:hidden">
                  {online.length === 1 ? "1 device connected" : `${online.length} devices connected`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTextDialog({ open: true, text: "", recipients: new Set(recipients) })}
                    disabled={online.length === 0}
                  >
                    <MessageSquareTextIcon aria-hidden />
                    Send text
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setChatOpen(true)} aria-label={unreadChat ? `Chat, ${unreadChat} unread` : "Chat"}>
                    <MessagesSquareIcon aria-hidden />
                    Chat
                    {unreadChat > 0 ? <Badge variant="default">{unreadChat}</Badge> : null}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAlbumOpen(true)}>
                    <ImagesIcon aria-hidden />
                    Album
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts" className="hidden sm:inline-flex">
                    <KeyboardIcon aria-hidden />
                  </Button>
                </div>
              </div>
            ) : null}
            {selection.length > 0 ? (
              <>
                <SendPanel
                  files={selection}
                  recipients={online}
                  selected={recipients}
                  onSelectedChange={setChosen}
                  onRemove={removeFile}
                  onClear={clearFiles}
                  onSend={() => void send()}
                  autoSend={autoSend}
                  onAutoSendChange={room.mode === "my-devices" ? setAutoSend : undefined}
                  estimateSeconds={estimate}
                  sendSmaller={prefs.sendSmallerPhotos}
                  onSendSmallerChange={(value) => preferences.set({ ...prefs, sendSmallerPhotos: value })}
                />
                <DropZone onFiles={addFiles} compact title="Add more files" />
              </>
            ) : (
              <DropZone onFiles={addFiles} />
            )}
            <TextInbox messages={inbox} deviceName={deviceName} />
            <TransferList
              items={transferItems}
              deviceName={deviceName}
              links={links}
              actionsFor={actionsFor}
              mediaFor={(id) => mediaMap.get(id) ?? null}
              onSaveAllZip={() => void saveAllZip()}
              zipProgress={zipProgress}
            />
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

      <TextDropDialog
        open={textDialog.open}
        onOpenChange={(open) => setTextDialog((current) => ({ ...current, open }))}
        devices={online}
        initialRecipients={textDialog.recipients}
        initialText={textDialog.text}
        onSend={(peerIds, text) => session.sendText(peerIds, text)}
      />
      <ChatPanel
        open={chatOpen}
        onOpenChange={setChatOpen}
        messages={inbox}
        deviceName={deviceName}
        onSend={(text) => session.sendChat(text)}
        peersOnline={online.length}
      />
      <AlbumDialog
        open={albumOpen}
        onOpenChange={setAlbumOpen}
        candidates={mediaCandidates as AlbumItem[]}
        deviceName={deviceName}
        onAddPhotos={(files) => void sendFiles(files, online.map((d) => d.device_id))}
        onSave={(item) => void saveFile(item.file, item.name)}
        onSaveAll={() => void saveAllZip()}
      />
      <PresentDialog
        open={presentOpen}
        onOpenChange={setPresentOpen}
        code={room.roomCode}
        joinUrl={joinUrl}
        expiresAt={room.expiresAt}
        devices={room.devices.length}
      />
      <PairRequestDialog request={pairRequests[0] ?? null} onRespond={(peerId, accept) => void session.respondToPairing(peerId, accept)} />
      {speedPeer ? (
        <SpeedTestDialog
          open={speedTestPeer !== null}
          onOpenChange={(open) => !open && setSpeedTestPeer(null)}
          peerName={speedPeer.device_name}
          link={links[speedPeer.device_id]}
          run={(bytes, onProgress) => session.runSpeedTest(speedPeer.device_id, bytes, onProgress)}
        />
      ) : null}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Work anywhere in the room except while typing.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {[
              ["Ctrl/⌘ + V", "Paste files, or text to send"],
              ["Ctrl/⌘ + O", "Select files"],
              ["1 – 9", "Select or unselect a recipient"],
              ["?", "Show this help"],
            ].map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                </dt>
                <dd className="text-muted-foreground">{what}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}


