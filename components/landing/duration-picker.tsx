"use client";

import { useId } from "react";
import { TimerIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LocalStore } from "@/lib/utils/local-store";
import { ROOM_DEFAULT_MINUTES, ROOM_MAX_MINUTES, ROOM_MIN_MINUTES } from "@/types/room";

/** Length of the next room this device creates, in minutes (remembered between visits). */
export const createDuration = new LocalStore<number>("droply:create-duration", ROOM_DEFAULT_MINUTES, (raw) =>
  typeof raw === "number" && Number.isInteger(raw) && raw >= ROOM_MIN_MINUTES && raw <= ROOM_MAX_MINUTES ? raw : null,
);

const PRESETS = [5, 10, 15, 20] as const;

/** Picks how long a new room stays open: presets plus a slider for any minute in between. */
export function DurationPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col items-center gap-2">
      <p id={labelId} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <TimerIcon aria-hidden className="size-4" />
        Room time: <span className="font-medium tabular-nums text-foreground">{value} min</span>
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap justify-center gap-1.5">
        {PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            role="radio"
            aria-checked={value === minutes}
            disabled={disabled}
            onClick={() => onChange(minutes)}
            className={cn(
              "inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center rounded-full border px-3 text-sm tabular-nums transition-all sm:min-h-9",
              "disabled:cursor-not-allowed disabled:opacity-50",
              value === minutes ? "border-primary bg-primary/12 font-medium text-primary ring-2 ring-primary/40" : "bg-card hover:bg-accent",
            )}
          >
            {minutes} min
          </button>
        ))}
      </div>
      <input
        type="range"
        min={ROOM_MIN_MINUTES}
        max={ROOM_MAX_MINUTES}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Room time in minutes"
        aria-valuetext={`${value} minutes`}
        className="h-11 w-full max-w-64 cursor-pointer accent-primary disabled:cursor-not-allowed sm:h-6"
      />
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        {ROOM_MIN_MINUTES} to {ROOM_MAX_MINUTES} minutes. You can add time once while the room is open.
      </p>
    </div>
  );
}
