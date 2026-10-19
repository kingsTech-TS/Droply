"use client";

import { useState } from "react";
import { HourglassIcon, LockIcon, TimerIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { userMessage } from "@/lib/api/errors";
import { ROOM_MAX_MINUTES } from "@/types/room";

export interface RoomTimeInfo {
  createdAt: number | null;
  durationSeconds: number | null;
  timeExtended: boolean;
}

/** Why the host can't add time, or null if they can. */
export function addTimeBlocked({ durationSeconds, timeExtended }: RoomTimeInfo): string | null {
  if (durationSeconds === null) return "This room has no time limit.";
  if (timeExtended) return "You already changed the time once.";
  if (durationSeconds >= ROOM_MAX_MINUTES * 60) return `The room already has the maximum ${ROOM_MAX_MINUTES} minutes.`;
  return null;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Host-only: the room's length, and the one-time "Add time". */
export function RoomTimeSettings({ info, onAddTime }: { info: RoomTimeInfo; onAddTime: () => void }) {
  if (info.durationSeconds === null) return null;
  const minutes = Math.round(info.durationSeconds / 60);
  const blocked = addTimeBlocked(info);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <TimerIcon aria-hidden className="size-4" />
          Room time: <span className="tabular-nums">{minutes} min</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {info.createdAt !== null ? `Ends at ${clock(info.createdAt + info.durationSeconds * 1000)}. ` : null}
          {blocked ?? `You can add time once, up to ${ROOM_MAX_MINUTES} minutes in total.`}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onAddTime} disabled={blocked !== null}>
        {blocked ? <LockIcon aria-hidden /> : <HourglassIcon aria-hidden />}
        Add time
      </Button>
    </div>
  );
}

/** Pick the room's new total length. Allowed once, so it asks for confirmation. */
export function AddTimeDialog({
  open,
  onOpenChange,
  info,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: RoomTimeInfo;
  onConfirm: (minutes: number) => Promise<void>;
}) {
  const current = Math.round((info.durationSeconds ?? 0) / 60);
  const min = Math.min(current + 1, ROOM_MAX_MINUTES);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const value = Math.min(Math.max(picked ?? ROOM_MAX_MINUTES, min), ROOM_MAX_MINUTES);
  const options = [...new Set([current + 1, current + 2, current + 5, current + 10, ROOM_MAX_MINUTES])]
    .filter((m) => m > current && m <= ROOM_MAX_MINUTES)
    .sort((a, b) => a - b);
  const blocked = addTimeBlocked(info);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(value);
      toast.success(`The room now lasts ${value} minutes.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(userMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicked(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HourglassIcon aria-hidden className="size-5 text-primary" />
            Add time to the room
          </DialogTitle>
          <DialogDescription>
            The room has {current} minutes. Pick a new total of up to {ROOM_MAX_MINUTES} minutes. You can only do this once.
          </DialogDescription>
        </DialogHeader>
        {blocked ? (
          <p className="text-sm text-muted-foreground">{blocked}</p>
        ) : (
          <div className="space-y-4">
            <div role="radiogroup" aria-label="New room time" className="flex flex-wrap gap-1.5">
              {options.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={value === m}
                  onClick={() => setPicked(m)}
                  className={
                    value === m
                      ? "inline-flex min-h-11 cursor-pointer items-center rounded-full border border-primary bg-primary/10 px-3 text-sm font-medium text-primary sm:min-h-9"
                      : "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm hover:bg-accent sm:min-h-9"
                  }
                >
                  {m} min <span className="ml-1 text-xs opacity-70">(+{m - current})</span>
                </button>
              ))}
            </div>
            {options.length > 1 ? (
              <input
                type="range"
                min={min}
                max={ROOM_MAX_MINUTES}
                step={1}
                value={value}
                onChange={(event) => setPicked(Number(event.target.value))}
                aria-label="New room time in minutes"
                aria-valuetext={`${value} minutes`}
                className="h-11 w-full cursor-pointer accent-primary sm:h-6"
              />
            ) : null}
            <p className="text-sm">
              New time: <span className="font-medium tabular-nums">{value} min</span>
              {info.createdAt !== null ? (
                <span className="text-muted-foreground"> · ends at {clock(info.createdAt + value * 60_000)}</span>
              ) : null}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || blocked !== null}>
            Set to {value} minutes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
