"use client";

import { HardDriveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils/format";

/** Shown when received data is held in temporary browser storage. */
export function StoragePanel({ bytes, onClear }: { bytes: number; onClear: () => void }) {
  if (bytes <= 0) return null;
  return (
    <section aria-label="Temporary transfer data" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <HardDriveIcon aria-hidden className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Temporary transfer data</p>
          <p className="text-sm text-muted-foreground">{formatBytes(bytes)}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear temporary data
      </Button>
    </section>
  );
}
