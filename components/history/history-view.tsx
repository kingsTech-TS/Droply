"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, TrophyIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/components/transfer/file-icon";
import { useLocalStore } from "@/hooks/use-local-store";
import { clearHistory, history, records } from "@/lib/history/history";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatSpeed } from "@/lib/utils/format";

type Filter = "all" | "outgoing" | "incoming";

export function HistoryView() {
  const entries = useLocalStore(history);
  const best = useLocalStore(records);
  const [filter, setFilter] = useState<Filter>("all");
  const list = useMemo(
    () => entries.filter((e) => filter === "all" || e.direction === filter).slice().reverse(),
    [entries, filter],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Filter">
          {(["all", "outgoing", "incoming"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-11 cursor-pointer rounded-full px-4 text-sm sm:min-h-9",
                filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {f === "all" ? "All" : f === "outgoing" ? "Sent" : "Received"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/stats">
              <TrophyIcon aria-hidden />
              Stats &amp; badges
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={entries.length === 0}>
                Clear history
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear your history?</AlertDialogTitle>
                <AlertDialogDescription>
                  Removes the list of past transfers, your records and badges from this device. Files you saved are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction onClick={clearHistory}>Clear</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {best.bestAverage || best.bestPeak ? (
        <p className="text-sm text-muted-foreground">
          Personal records: {best.bestPeak ? <>top speed <span className="font-medium text-foreground">{formatSpeed(best.bestPeak)}</span></> : null}
          {best.bestAverage ? <> · best average <span className="font-medium text-foreground">{formatSpeed(best.bestAverage)}</span></> : null}
          {best.biggestFile ? <> · biggest file <span className="font-medium text-foreground">{formatBytes(best.biggestFile)}</span></> : null}
        </p>
      ) : null}

      {list.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No transfers yet. They&apos;ll show up here, on this device only.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {list.map((e) => (
            <li key={e.id} className="flex min-w-0 items-center gap-3 p-3">
              <FileIcon name={e.fileName} mimeType="" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={e.fileName}>
                  {e.fileName}
                </p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {e.direction === "outgoing" ? <ArrowUpIcon aria-hidden className="size-3.5" /> : <ArrowDownIcon aria-hidden className="size-3.5" />}
                  <span className="truncate">
                    {e.direction === "outgoing" ? "To" : "From"} {e.peerName}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{formatBytes(e.fileSize)}</span>
                  {e.averageSpeed ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{formatSpeed(e.averageSpeed)}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={new Date(e.at).toISOString()}>
                {new Date(e.at).toLocaleDateString([], { month: "short", day: "numeric" })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
