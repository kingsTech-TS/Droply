"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { AtSignIcon, CornerUpLeftIcon, MessagesSquareIcon, SendIcon, SmilePlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CHAT_GROUP_MIN_DEVICES, type ChatSendOptions, type InboxMessage } from "@/lib/session/room-session";
import { cn } from "@/lib/utils/cn";
import { MAX_CHAT_MESSAGE, REACTIONS, type Reaction } from "@/lib/webrtc/protocol";
import type { DeviceView } from "@/types/device";

export interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: InboxMessage[];
  deviceName: (id: string) => string;
  onSend: (text: string, options: ChatSendOptions) => Promise<void>;
  onReact: (messageId: string, emoji: Reaction) => void;
  peersOnline: number;
  selfId: string;
  /** Every device in the room, this one included. */
  devices: DeviceView[];
  /** Nothing new can be sent (time is up, or an event guest). */
  locked?: boolean;
  /** Shown in place of the message box text while locked. */
  lockedReason?: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Devices tagged as "@Name" in `text`. Longer names win, so "@Phone 2" isn't also "@Phone". */
export function findMentions(text: string, devices: readonly Pick<DeviceView, "device_id" | "device_name">[]): string[] {
  let rest = text;
  const found: string[] = [];
  for (const device of [...devices].sort((a, b) => b.device_name.length - a.device_name.length)) {
    const pattern = new RegExp(`@${escapeRegExp(device.device_name)}(?![\\p{L}\\p{N}_])`, "u");
    if (pattern.test(rest)) {
      found.push(device.device_id);
      rest = rest.replace(new RegExp(pattern.source, "gu"), " ");
    }
  }
  return found;
}

/** Text with each tagged "@Name" highlighted (this device's own name stands out more). */
function withMentions(text: string, mentions: readonly string[] | undefined, selfId: string, deviceName: (id: string) => string): ReactNode {
  if (!mentions?.length) return text;
  const names = new Map(mentions.map((id) => [deviceName(id), id]));
  const sorted = [...names.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const parts = text.split(new RegExp(`(@(?:${sorted.join("|")}))`, "u"));
  return parts.map((part, index) => {
    const id = part.startsWith("@") ? names.get(part.slice(1)) : undefined;
    if (!id) return <Fragment key={index}>{part}</Fragment>;
    return (
      <span key={index} className={cn("rounded px-0.5 font-medium", id === selfId ? "bg-warning/25" : "bg-background/25 underline decoration-dotted")}>
        {part}
      </span>
    );
  });
}

/** The "@query" being typed right before the caret, if any. */
function mentionQuery(value: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|\s)@([^\s@]{0,32})$/u.exec(value.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[1]!.length - 1, query: match[1]!.toLowerCase() };
}

/**
 * Room chat over the peer-to-peer channel: nothing is stored on the server. In group rooms
 * (more than 3 devices) people can tag someone with @, reply to a message, and react to it.
 */
export function ChatPanel({
  open,
  onOpenChange,
  messages,
  deviceName,
  onSend,
  onReact,
  peersOnline,
  selfId,
  devices,
  locked = false,
  lockedReason,
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chat = messages.filter((m) => m.kind === "chat");
  const group = devices.length >= CHAT_GROUP_MIN_DEVICES;
  const interactive = group && !locked && peersOnline > 0;
  const others = useMemo(() => devices.filter((d) => d.device_id !== selfId), [devices, selfId]);
  const suggestions = useMemo(
    () => (interactive && mention ? others.filter((d) => d.device_name.toLowerCase().includes(mention.query)).slice(0, 6) : []),
    [interactive, mention, others],
  );
  const nameOf = (id: string) => (id === selfId ? "You" : deviceName(id));

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length, open]);

  const updateText = (value: string, caret: number | null) => {
    setText(value.slice(0, MAX_CHAT_MESSAGE));
    setMention(caret === null ? null : mentionQuery(value, caret));
    setHighlight(0);
  };

  const pickMention = (device: DeviceView) => {
    if (!mention) return;
    const caret = mention.start + 1 + mention.query.length;
    const next = `${text.slice(0, mention.start)}@${device.device_name} ${text.slice(caret)}`;
    setText(next.slice(0, MAX_CHAT_MESSAGE));
    setMention(null);
    const position = mention.start + device.device_name.length + 2;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(position, position);
    });
  };

  const startMention = () => {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? text.length;
    const spacer = caret > 0 && !/\s/.test(text[caret - 1] ?? "") ? " " : "";
    const next = `${text.slice(0, caret)}${spacer}@${text.slice(caret)}`;
    updateText(next, caret + spacer.length + 1);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(caret + spacer.length + 1, caret + spacer.length + 1);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlight((h) => (h + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(suggestions[highlight] ?? suggestions[0]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMention(null);
        return;
      }
    }
    if (event.key === "Escape" && replyTo) {
      event.preventDefault();
      event.stopPropagation();
      setReplyTo(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || locked) return;
    const options: ChatSendOptions = group ? { replyTo, mentions: findMentions(value, others) } : {};
    setText("");
    setReplyTo(null);
    setMention(null);
    void onSend(value, options);
  };

  const reply = (message: InboxMessage) => {
    setReplyTo(message);
    setPicker(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const jumpTo = (id: string) => {
    const target = listRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id);
    setTimeout(() => setFlash((current) => (current === id ? null : current)), 1200);
  };

  const placeholder = locked
    ? (lockedReason ?? "Time's up. The chat is closed.")
    : peersOnline === 0
      ? "Waiting for other devices…"
      : group
        ? "Message everyone, @ to tag someone"
        : "Message everyone in the room";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicker(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex h-[min(40rem,90dvh)] flex-col gap-3"
        // Escape first closes the tag list, reaction picker or reply, then the chat.
        onEscapeKeyDown={(event) => {
          if (suggestions.length > 0 || replyTo || picker) event.preventDefault();
          if (picker) setPicker(null);
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessagesSquareIcon aria-hidden className="size-5 text-primary" />
            Room chat
          </DialogTitle>
          <DialogDescription>
            Messages go directly to the {peersOnline === 1 ? "other device" : `${peersOnline} other devices`} and disappear when you leave.
            {group ? " Tag someone with @, reply to a message or react to it." : null}
          </DialogDescription>
        </DialogHeader>
        <ol ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {chat.length === 0 ? <li className="py-8 text-center text-sm text-muted-foreground">Say hi 👋</li> : null}
          {chat.map((m) => {
            const mine = m.direction === "out";
            const authorId = mine ? selfId : (m.peerIds[0] ?? "");
            const forMe = !mine && (m.mentions?.includes(selfId) || m.replyTo?.author === selfId);
            const reactions = Object.entries(m.reactions ?? {}) as [Reaction, string[]][];
            return (
              <li
                key={m.id}
                data-message-id={m.id}
                className={cn("group/message flex flex-col gap-1", mine ? "items-end" : "items-start")}
              >
                <div className={cn("flex max-w-[85%] items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
                  <div
                    className={cn(
                      "min-w-0 rounded-2xl px-3 py-2 text-sm transition-shadow",
                      mine ? "bg-primary text-primary-foreground" : "bg-muted",
                      forMe && "ring-2 ring-warning/60",
                      flash === m.id && "ring-2 ring-primary",
                    )}
                  >
                    {!mine ? <p className="mb-0.5 text-xs font-medium opacity-80">{nameOf(authorId)}</p> : null}
                    {m.replyTo ? (
                      <button
                        type="button"
                        onClick={() => jumpTo(m.replyTo!.id)}
                        className={cn(
                          "mb-1 block w-full cursor-pointer rounded-lg border-l-2 px-2 py-1 text-left text-xs",
                          mine ? "border-primary-foreground/60 bg-primary-foreground/15" : "border-primary/60 bg-background/60",
                        )}
                      >
                        <span className="block font-medium">
                          <CornerUpLeftIcon aria-hidden className="mr-1 inline size-3" />
                          {nameOf(m.replyTo.author)}
                        </span>
                        <span className="line-clamp-2 opacity-80">{m.replyTo.text}</span>
                      </button>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words">{withMentions(m.text, m.mentions, selfId, deviceName)}</p>
                  </div>
                  {interactive ? (
                    <div className="flex shrink-0 gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100">
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Reply to ${nameOf(authorId)}`} onClick={() => reply(m)}>
                        <CornerUpLeftIcon aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="React"
                        aria-expanded={picker === m.id}
                        onClick={() => setPicker((current) => (current === m.id ? null : m.id))}
                      >
                        <SmilePlusIcon aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {picker === m.id ? (
                  <div role="group" aria-label="Pick a reaction" className="flex gap-0.5 rounded-full border bg-card p-1 shadow-sm">
                    {REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        aria-label={`React ${emoji}`}
                        onClick={() => {
                          onReact(m.id, emoji);
                          setPicker(null);
                        }}
                        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-lg hover:bg-accent"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
                {reactions.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {reactions.map(([emoji, ids]) => {
                      const mineToo = ids.includes(selfId);
                      const who = ids.map(nameOf).join(", ");
                      return (
                        <button
                          key={emoji}
                          type="button"
                          disabled={!interactive}
                          title={who}
                          aria-label={`${emoji} from ${who}${interactive ? (mineToo ? ". Remove yours" : ". Add yours") : ""}`}
                          aria-pressed={mineToo}
                          onClick={() => onReact(m.id, emoji)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs tabular-nums",
                            interactive && "cursor-pointer hover:bg-accent",
                            mineToo ? "border-primary/50 bg-primary/10" : "bg-card",
                          )}
                        >
                          <span aria-hidden>{emoji}</span>
                          {ids.length}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        <form onSubmit={submit} className="relative space-y-2">
          {replyTo && !locked ? (
            <div className="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-muted px-3 py-2 text-xs">
              <CornerUpLeftIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Replying to {nameOf(replyTo.direction === "out" ? selfId : (replyTo.peerIds[0] ?? ""))}</p>
                <p className="truncate text-muted-foreground">{replyTo.text}</p>
              </div>
              <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="cursor-pointer rounded p-0.5 hover:bg-accent">
                <XIcon aria-hidden className="size-3.5" />
              </button>
            </div>
          ) : null}
          {suggestions.length > 0 ? (
            <ul role="listbox" aria-label="Tag a device" className="absolute bottom-full left-0 z-10 mb-1 w-64 max-w-full overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
              {suggestions.map((device, index) => (
                <li key={device.device_id} role="option" aria-selected={index === highlight}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickMention(device)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                      index === highlight ? "bg-accent" : "hover:bg-accent",
                    )}
                  >
                    <AtSignIcon aria-hidden className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{device.device_name}</span>
                    {device.connection_state !== "connected" ? <span className="ml-auto text-xs text-muted-foreground">offline</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            {interactive ? (
              <Button type="button" variant="ghost" size="icon" aria-label="Tag someone" onClick={startMention}>
                <AtSignIcon aria-hidden />
              </Button>
            ) : null}
            <Input
              ref={inputRef}
              value={text}
              onChange={(event) => updateText(event.target.value, event.target.selectionStart)}
              onKeyDown={onKeyDown}
              onBlur={() => setMention(null)}
              placeholder={placeholder}
              aria-label="Message"
              aria-autocomplete={group ? "list" : undefined}
              disabled={peersOnline === 0 || locked}
              autoComplete="off"
            />
            <Button type="submit" size="icon" aria-label="Send message" disabled={!text.trim() || peersOnline === 0 || locked}>
              <SendIcon aria-hidden />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
