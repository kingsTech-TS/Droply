import type { RoomTheme } from "@/types/room";

export interface ThemeStyle {
  label: string;
  emoji: string;
  /** Banner gradient (Tailwind classes); the page's own colors keep text contrast. */
  banner: string;
}

export const THEME_STYLES: Record<RoomTheme, ThemeStyle> = {
  default: { label: "Classic", emoji: "⚡", banner: "from-primary/15 via-electric/10 to-transparent" },
  party: { label: "Party", emoji: "🎉", banner: "from-fuchsia-500/25 via-amber-400/15 to-transparent" },
  birthday: { label: "Birthday", emoji: "🎂", banner: "from-pink-500/25 via-rose-400/15 to-transparent" },
  wedding: { label: "Wedding", emoji: "💍", banner: "from-amber-200/40 via-rose-200/20 to-transparent" },
  gaming: { label: "Gaming", emoji: "🎮", banner: "from-emerald-500/25 via-cyan-500/15 to-transparent" },
  study: { label: "Study", emoji: "📚", banner: "from-sky-500/20 via-indigo-400/15 to-transparent" },
  ocean: { label: "Ocean", emoji: "🌊", banner: "from-cyan-500/25 via-blue-500/15 to-transparent" },
  sunset: { label: "Sunset", emoji: "🌅", banner: "from-orange-500/25 via-pink-500/15 to-transparent" },
};
