"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { DayStats } from "@/types/admin";

const number = new Intl.NumberFormat();

/** One measure per category, largest first: a labelled horizontal bar per row. */
export function BarList({ data, label, format = (k) => k }: { data: Record<string, number>; label: string; format?: (key: string) => string }) {
  const rows = Object.entries(data);
  const total = rows.reduce((sum, [, v]) => sum + v, 0);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ul aria-label={label} className="space-y-2.5">
      {rows.map(([key, value]) => {
        const share = total ? Math.round((value / total) * 100) : 0;
        return (
          <li key={key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{format(key)}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{number.format(value)}</span> · {share}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden>
              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });

/** Users per day: one series, bars anchored to the baseline, hover/focus for the day's numbers. */
export function DailyChart({ days }: { days: DayStats[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.users));
  const shown = active !== null ? days[active] : null;

  return (
    <div className="space-y-3">
      <div className="flex min-h-5 items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {shown ? (
            <>
              <span className="font-medium text-foreground">{shortDay(shown.day)}</span> · {number.format(shown.users)} users ·{" "}
              {number.format(shown.devices)} device visits · {number.format(shown.rooms)} rooms
            </>
          ) : (
            "Hover or tap a day for details."
          )}
        </p>
        <button type="button" onClick={() => setTable((t) => !t)} className="shrink-0 cursor-pointer text-sm text-primary hover:underline">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Day (UTC)</th>
                <th className="px-3 py-2 text-right font-medium">Users</th>
                <th className="px-3 py-2 text-right font-medium">Device visits</th>
                <th className="px-3 py-2 text-right font-medium">Rooms</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...days].reverse().map((d) => (
                <tr key={d.day} className="border-t">
                  <td className="px-3 py-1.5">{shortDay(d.day)}</td>
                  <td className="px-3 py-1.5 text-right">{number.format(d.users)}</td>
                  <td className="px-3 py-1.5 text-right">{number.format(d.devices)}</td>
                  <td className="px-3 py-1.5 text-right">{number.format(d.rooms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="flex h-44 flex-col justify-between py-0.5 text-right text-xs tabular-nums text-muted-foreground" aria-hidden>
            <span>{number.format(max)}</span>
            <span>0</span>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="relative flex h-44 items-end gap-0.5 border-b border-border"
              role="group"
              aria-label="Users per day"
              onMouseLeave={() => setActive(null)}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border/70" aria-hidden />
              {days.map((d, i) => (
                <button
                  key={d.day}
                  type="button"
                  aria-label={`${shortDay(d.day)}: ${d.users} users, ${d.devices} device visits, ${d.rooms} rooms`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(i)}
                  className="group flex h-full min-w-0 flex-1 cursor-pointer items-end outline-none"
                >
                  <span
                    className={cn(
                      "block w-full rounded-t-[4px] bg-primary transition-opacity",
                      active !== null && active !== i ? "opacity-40" : "opacity-100",
                      "group-focus-visible:ring-2 group-focus-visible:ring-ring",
                    )}
                    style={{ height: d.users ? `${Math.max(2, (d.users / max) * 100)}%` : "2px", opacity: d.users ? undefined : 0.25 }}
                  />
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground" aria-hidden>
              <span>{days[0] ? shortDay(days[0].day) : ""}</span>
              {days.length > 2 ? <span>{shortDay(days[Math.floor(days.length / 2)]!.day)}</span> : null}
              <span>{days.length > 1 ? shortDay(days[days.length - 1]!.day) : ""}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
