"use client";

import { useState, type ReactNode } from "react";
import { RadarIcon } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { userMessage } from "@/lib/api/errors";
import { THEME_STYLES } from "@/lib/fun/themes";
import { cn } from "@/lib/utils/cn";
import { ROOM_THEMES, type RoomTheme } from "@/types/room";

export interface RoomSettingsProps {
  theme: RoomTheme;
  discoverable: boolean;
  onTheme: (theme: RoomTheme) => Promise<void>;
  onDiscoverable: (value: boolean) => Promise<void>;
  /** Room time (timed rooms). */
  time?: ReactNode;
}

/** Host-only: room theme for everyone, and opt-in discovery by nearby devices. */
export function RoomSettings({ theme, discoverable, onTheme, onDiscoverable, time }: RoomSettingsProps) {
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      toast.error(userMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {time}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Room theme</legend>
        <div className="flex flex-wrap gap-1.5">
          {ROOM_THEMES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={busy}
              aria-pressed={theme === t}
              onClick={() => void run(() => onTheme(t))}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm transition-colors sm:min-h-9",
                theme === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
              )}
            >
              <span aria-hidden>{THEME_STYLES[t].emoji}</span>
              {THEME_STYLES[t].label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex items-start justify-between gap-3">
        <Label htmlFor="room-discoverable" className="flex-col items-start gap-1 font-normal">
          <span className="flex items-center gap-1.5 font-medium">
            <RadarIcon aria-hidden className="size-4" />
            Visible to nearby devices
          </span>
          <span className="text-xs text-muted-foreground">
            Devices on the same internet connection can join without the code. Turn off in public Wi-Fi.
          </span>
        </Label>
        <Switch
          id="room-discoverable"
          checked={discoverable}
          disabled={busy}
          onCheckedChange={(value) => void run(() => onDiscoverable(value))}
        />
      </div>
    </div>
  );
}
