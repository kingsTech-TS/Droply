"use client";

import { useMemo, useState } from "react";
import { Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocalStore } from "@/hooks/use-local-store";
import { badges, history, records, stats } from "@/lib/history/history";
import { renderCard, shareCard } from "@/lib/share/result-card";
import { cn } from "@/lib/utils/cn";
import type { FileKind } from "@/lib/utils/file-kind";
import { formatBytes, formatSpeed } from "@/lib/utils/format";

const KIND_LABEL: Record<FileKind, string> = {
  video: "videos",
  image: "photos",
  audio: "audio",
  archive: "archives",
  pdf: "PDFs",
  document: "documents",
  spreadsheet: "spreadsheets",
  presentation: "presentations",
  code: "code",
  other: "files",
};

function hourLabel(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric" });
}

/** "Droply Wrapped": personal stats and badges, computed on the device from local history. */
export function StatsView() {
  const entries = useLocalStore(history);
  const best = useLocalStore(records);
  const [range, setRange] = useState<"month" | "all">("month");
  const since = useMemo(() => {
    if (range === "all") return 0;
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, [range]);
  const s = useMemo(() => stats(entries, since), [entries, since]);
  const earned = useMemo(() => badges(entries, best), [entries, best]);

  const share = async () => {
    const blob = await renderCard({
      headline: `${range === "month" ? "This month" : "So far"} I moved ${formatBytes(s.bytes)}`,
      detail: `${s.files} files · ${s.devices} devices${s.fastest ? ` · top ${formatSpeed(s.fastest)}` : ""}`,
      footer: `${earned.filter((b) => b.earned).map((b) => b.emoji).join(" ")}`.trim() || undefined,
    });
    if (blob) await shareCard(blob, `My Droply stats: ${formatBytes(s.bytes)} moved ⚡`);
  };

  const tiles: Array<[string, string]> = [
    ["Moved", formatBytes(s.bytes)],
    ["Files", s.files.toLocaleString()],
    ["Devices", s.devices.toLocaleString()],
    ["Top speed", formatSpeed(s.fastest)],
    ["Mostly", s.topKind ? KIND_LABEL[s.topKind] : "—"],
    ["Busiest time", s.busiestHour !== null ? hourLabel(s.busiestHour) : "—"],
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Period">
          {(["month", "all"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={cn(
                "min-h-11 cursor-pointer rounded-full px-4 text-sm sm:min-h-9",
                range === r ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {r === "month" ? "This month" : "All time"}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => void share()} disabled={s.files === 0}>
          <Share2Icon aria-hidden />
          Share my stats
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</dd>
            </CardContent>
          </Card>
        ))}
      </dl>
      {s.files > 0 ? (
        <p className="text-sm text-muted-foreground">
          Sent {formatBytes(s.sentBytes)} · received {formatBytes(s.receivedBytes)}.
        </p>
      ) : null}

      <section aria-labelledby="badges-heading" className="space-y-3">
        <h2 id="badges-heading" className="text-xl font-semibold">
          Badges
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {earned.map((b) => (
            <li
              key={b.id}
              className={cn("flex items-center gap-3 rounded-xl border p-4", b.earned ? "bg-card" : "bg-muted/40 opacity-60")}
            >
              <span aria-hidden className={cn("text-3xl", !b.earned && "grayscale")}>
                {b.emoji}
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {b.title}
                  <span className="sr-only">{b.earned ? ", earned" : ", not earned yet"}</span>
                </p>
                <p className="text-sm text-muted-foreground">{b.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
