"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { brand } from "@/config/brand";
import { confetti, flyFile, playSound, vibrate } from "@/lib/fun/celebrate";
import { preferences } from "@/lib/fun/prefs";
import type { Celebration, RoomSession } from "@/lib/session/room-session";
import { renderCard, shareCard } from "@/lib/share/result-card";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/utils/format";

function describe(c: Celebration): { title: string; detail: string } {
  const what = c.files === 1 ? c.fileNames[0] ?? "1 file" : `${c.files} files`;
  const verb = c.direction === "outgoing" ? "Sent" : "Received";
  const parts = [formatBytes(c.bytes)];
  if (c.seconds >= 1) parts.push(`in ${formatDuration(c.seconds)}`);
  if (c.averageSpeed) parts.push(`· ${formatSpeed(c.averageSpeed)} avg`);
  return { title: `${verb} ${what}`, detail: parts.join(" ") };
}

async function shareResult(c: Celebration): Promise<void> {
  const blob = await renderCard({
    headline: `${c.direction === "outgoing" ? "Sent" : "Received"} ${formatBytes(c.bytes)}${c.seconds >= 1 ? ` in ${formatDuration(c.seconds)}` : ""}`,
    detail: [c.averageSpeed ? `${formatSpeed(c.averageSpeed)} average` : null, c.peakSpeed ? `top ${formatSpeed(c.peakSpeed)}` : null]
      .filter(Boolean)
      .join(" · "),
  });
  if (blob) await shareCard(blob, `I just moved ${formatBytes(c.bytes)} with ${brand.name} ⚡`);
}

/** Sounds, confetti, haptics and a toast with "Share result" when a batch finishes. */
export function useCelebrations(session: RoomSession): void {
  useEffect(
    () =>
      session.celebrations.on("celebration", (c) => {
        const { title, detail } = describe(c);
        playSound(c.newRecord ? "record" : c.direction === "outgoing" ? "send" : "receive");
        const list = document.getElementById("transfers-heading");
        for (const peerId of c.peerIds.slice(0, 6)) {
          const card = document.querySelector(`[data-device-id="${CSS.escape(peerId)}"]`);
          if (c.direction === "outgoing") flyFile(list, card);
          else flyFile(card, list);
        }
        vibrate(c.direction === "incoming" ? [30, 60, 30] : 25);
        if (c.newRecord || c.bytes >= 50_000_000 || c.files >= 3) confetti(c.newRecord ? "big" : "small");
        toast.success(c.newRecord ? `${title}. New personal record! 🏆` : title, {
          description: detail,
          action: c.bytes >= 10_000_000 ? { label: "Share", onClick: () => void shareResult(c) } : undefined,
        });
      }),
    [session],
  );
}

/** System notifications for incoming files and texts while the tab is in the background. */
export function useBackgroundNotifications(session: RoomSession): void {
  const seenRequests = useRef(new Set<string>());
  const seenTexts = useRef(new Set<string>());

  useEffect(() => {
    const notify = (title: string, body: string, tag: string) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (!preferences.get().notifications || document.visibilityState === "visible") return;
      try {
        const n = new Notification(title, { body, tag, icon: "/icons/192" });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // Some browsers only allow notifications from a service worker.
      }
    };
    const offRequests = session.transfers.store.subscribe(() => {
      for (const request of session.transfers.store.getSnapshot().requests) {
        if (seenRequests.current.has(request.key)) continue;
        seenRequests.current.add(request.key);
        playSound("request");
        vibrate([40, 40, 40]);
        const files = request.transferIds.length;
        notify(
          "Incoming files",
          `${session.deviceName(request.senderId)} wants to send you ${files === 1 ? "a file" : `${files} files`} (${formatBytes(request.totalBytes)})`,
          request.key,
        );
      }
    });
    const offInbox = session.inbox.subscribe(() => {
      for (const m of session.inbox.getSnapshot()) {
        if (m.direction !== "in" || seenTexts.current.has(m.id)) continue;
        seenTexts.current.add(m.id);
        notify(m.kind === "chat" ? `Message from ${session.deviceName(m.peerIds[0] ?? "")}` : "New text", m.text.slice(0, 120), m.id);
      }
    });
    return () => {
      offRequests();
      offInbox();
    };
  }, [session]);
}

export interface ShortcutHandlers {
  onPasteFiles: (files: File[]) => void;
  onPasteText: (text: string) => void;
  onOpenPicker: () => void;
  onToggleRecipient: (index: number) => void;
  onHelp: () => void;
}

/** Ctrl/⌘+V pastes files or text, Ctrl/⌘+O selects files, 1-9 toggle recipients, ? shows help. */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const onPaste = (event: ClipboardEvent) => {
      if (typing(event.target) || document.querySelector("[role=dialog],[role=alertdialog]")) return;
      const data = event.clipboardData;
      if (!data) return;
      const files = Array.from(data.files);
      if (files.length > 0) {
        event.preventDefault();
        ref.current.onPasteFiles(files);
        return;
      }
      const text = data.getData("text/plain");
      if (text.trim()) {
        event.preventDefault();
        ref.current.onPasteText(text);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        ref.current.onOpenPicker();
        return;
      }
      if (event.ctrlKey || event.metaKey || document.querySelector("[role=dialog],[role=alertdialog]")) return;
      if (/^[1-9]$/.test(event.key)) ref.current.onToggleRecipient(Number(event.key) - 1);
      else if (event.key === "?") ref.current.onHelp();
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
}
