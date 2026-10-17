"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ClipboardPasteIcon, CopyIcon, ExternalLinkIcon, MessageSquareTextIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RecipientSelector } from "@/components/transfer/recipient-selector";
import type { InboxMessage } from "@/lib/session/room-session";
import { MAX_TEXT_MESSAGE } from "@/lib/webrtc/protocol";
import type { DeviceView } from "@/types/device";

export interface TextDropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: DeviceView[];
  initialRecipients: ReadonlySet<string>;
  initialText?: string;
  onSend: (peerIds: string[], text: string) => Promise<number>;
}

/** Sends a link, note or password privately (peer to peer, never through the server). */
export function TextDropDialog({ open, onOpenChange, devices, initialRecipients, initialText = "", onSend }: TextDropDialogProps) {
  const [text, setText] = useState(initialText);
  const [recipients, setRecipients] = useState<Set<string>>(new Set(initialRecipients));
  const [busy, setBusy] = useState(false);

  // Reset when reopened with new content (e.g. a paste).
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setText(initialText);
      setRecipients(new Set(initialRecipients.size ? initialRecipients : devices.length === 1 ? [devices[0]!.device_id] : []));
    }
  }

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      toast.error("Clipboard access was blocked. Paste with Ctrl+V / ⌘V instead.");
    }
  };

  const send = async () => {
    setBusy(true);
    const delivered = await onSend([...recipients], text);
    setBusy(false);
    if (delivered > 0) {
      toast.success(delivered === 1 ? "Text sent" : `Text sent to ${delivered} devices`);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareTextIcon aria-hidden className="size-5 text-primary" />
            Send text or a link
          </DialogTitle>
          <DialogDescription>Goes straight to the other device over the encrypted connection.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT_MESSAGE))}
            placeholder="A link, an address, a Wi-Fi password…"
            aria-label="Text to send"
            rows={4}
            autoFocus
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" onClick={() => void paste()}>
              <ClipboardPasteIcon aria-hidden />
              Paste from clipboard
            </Button>
            <span className="tabular-nums">{text.length.toLocaleString()} / {MAX_TEXT_MESSAGE.toLocaleString()}</span>
          </div>
        </div>
        <RecipientSelector devices={devices} selected={recipients} onChange={setRecipients} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={busy || !text.trim() || recipients.size === 0}>
            <SendIcon aria-hidden />
            {busy ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function asHttpUrl(text: string): string | null {
  const trimmed = text.trim();
  if (/\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function InboxItem({ message, from }: { message: InboxMessage; from: string }) {
  const [copied, setCopied] = useState(false);
  const url = asHttpUrl(message.text);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        {message.direction === "in" ? `From ${from}` : `You sent to ${from}`} · {new Date(message.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm">{message.text}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message.text);
              setCopied(true);
            } catch {
              toast.error("Couldn't copy. Select the text and copy it manually.");
            }
          }}
        >
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {url && message.direction === "in" ? (
          <Button asChild variant="ghost" size="sm">
            {/* Opened only on an explicit click, without access to this page. */}
            <a href={url} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLinkIcon aria-hidden />
              Open link
            </a>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** Texts received (and sent) in this room. Kept in memory only. */
export function TextInbox({ messages, deviceName }: { messages: InboxMessage[]; deviceName: (id: string) => string }) {
  const texts = messages.filter((m) => m.kind === "text").slice().reverse();
  if (texts.length === 0) return null;
  return (
    <section aria-labelledby="texts-heading" className="space-y-3">
      <h2 id="texts-heading" className="font-semibold">
        Texts
      </h2>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {texts.map((message) => (
          <InboxItem key={message.id} message={message} from={message.peerIds.map(deviceName).join(", ") || "nobody"} />
        ))}
      </ul>
    </section>
  );
}
