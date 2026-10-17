"use client";

import { useId } from "react";
import { THEME_STYLES } from "@/lib/fun/themes";
import { cn } from "@/lib/utils/cn";
import { LocalStore } from "@/lib/utils/local-store";
import { ROOM_THEMES, type RoomTheme } from "@/types/room";

/** The theme for the next room this device creates (remembered between visits). */
export const createTheme = new LocalStore<RoomTheme>("droply:create-theme", "default", (raw) =>
  typeof raw === "string" && (ROOM_THEMES as readonly string[]).includes(raw) ? (raw as RoomTheme) : null,
);

export function ThemePicker({ value, onChange, disabled = false }: { value: RoomTheme; onChange: (theme: RoomTheme) => void; disabled?: boolean }) {
  const labelId = useId();
  return (
    <div className="flex flex-col items-center gap-2">
      <p id={labelId} className="text-sm text-muted-foreground">
        Room theme: <span className="font-medium text-foreground">{THEME_STYLES[value].label}</span>
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap justify-center gap-1.5">
        {ROOM_THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={value === theme}
            aria-label={THEME_STYLES[theme].label}
            title={THEME_STYLES[theme].label}
            disabled={disabled}
            onClick={() => onChange(theme)}
            className={cn(
              "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border text-xl transition-all sm:size-10",
              "disabled:cursor-not-allowed disabled:opacity-50",
              value === theme ? "scale-110 border-primary bg-primary/12 ring-2 ring-primary/40" : "bg-card hover:bg-accent",
            )}
          >
            <span aria-hidden>{THEME_STYLES[theme].emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
