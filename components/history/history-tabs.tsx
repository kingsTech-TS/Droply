"use client";

import { useState } from "react";
import { DoorOpenIcon, FileStackIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { HistoryView } from "./history-view";
import { RoomHistoryView } from "./room-history-view";

type Tab = "transfers" | "rooms";

const TABS: { id: Tab; label: string; icon: typeof FileStackIcon }[] = [
  { id: "transfers", label: "Transfers", icon: FileStackIcon },
  { id: "rooms", label: "Rooms", icon: DoorOpenIcon },
];

/** History page: files moved, and rooms this device was in. */
export function HistoryTabs() {
  const [tab, setTab] = useState<Tab>("transfers");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="History" className="inline-flex rounded-xl border bg-muted/50 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`history-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`history-panel-${id}`}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors sm:min-h-9",
              tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`history-panel-${tab}`} aria-labelledby={`history-tab-${tab}`}>
        {tab === "transfers" ? <HistoryView /> : <RoomHistoryView />}
      </div>
    </div>
  );
}
