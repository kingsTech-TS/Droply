"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessagesSquareIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { InboxMessage } from "@/lib/session/room-session";
import { cn } from "@/lib/utils/cn";
import { MAX_CHAT_MESSAGE } from "@/lib/webrtc/protocol";

export interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: InboxMessage[];
  deviceName: (id: string) => string;
  onSend: (text: string) => Promise<void>;
  peersOnline: number;
}

/** Room chat over the peer-to-peer channel: nothing is stored on the server. */
export function ChatPanel({ open, onOpenChange, messages, deviceName, onSend, peersOnline }: ChatPanelProps) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const chat = messages.filter((m) => m.kind === "chat");

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length, open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    void onSend(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(36rem,85dvh)] flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessagesSquareIcon aria-hidden className="size-5 text-primary" />
            Room chat
          </DialogTitle>
          <DialogDescription>
            Messages go directly to the {peersOnline === 1 ? "other device" : `${peersOnline} other devices`} and disappear when you leave.
          </DialogDescription>
        </DialogHeader>
        <ol ref={listRef} className="flex-1 space-y-2 overflow-y-auto pr-1" aria-live="polite">
          {chat.length === 0 ? <li className="py-8 text-center text-sm text-muted-foreground">Say hi 👋</li> : null}
          {chat.map((m) => {
            const mine = m.direction === "out";
            const author = mine ? "You" : deviceName(m.peerIds[0] ?? "");
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {!mine ? (
                    <p className="mb-0.5 text-xs font-medium opacity-80">{author}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX_CHAT_MESSAGE))}
            placeholder={peersOnline > 0 ? "Message everyone in the room" : "Waiting for other devices…"}
            aria-label="Message"
            disabled={peersOnline === 0}
            autoComplete="off"
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={!text.trim() || peersOnline === 0}>
            <SendIcon aria-hidden />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
