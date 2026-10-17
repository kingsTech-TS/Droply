"use client";

import { SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { DeviceView } from "@/types/device";
import type { SelectedFileMeta } from "./file-item";
import { FileList } from "./file-list";
import { RecipientSelector } from "./recipient-selector";

export interface SendPanelProps {
  files: SelectedFileMeta[];
  recipients: DeviceView[];
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSend: () => void;
}

export function SendPanel({ files, recipients, selected, onSelectedChange, onRemove, onClear, onSend }: SendPanelProps) {
  const sendable = files.filter((f) => f.size > 0).length;
  const online = new Set(recipients.map((d) => d.device_id));
  const chosen = [...selected].filter((id) => online.has(id)).length;
  const reason =
    sendable === 0 ? "Add at least one non-empty file" : recipients.length === 0 ? "Waiting for another device" : chosen === 0 ? "Choose a recipient" : null;

  return (
    <Card>
      <CardContent className="space-y-5 pt-5">
        <FileList files={files} onRemove={onRemove} />
        <Separator />
        <RecipientSelector devices={recipients} selected={selected} onChange={onSelectedChange} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={onClear}>
            Clear files
          </Button>
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <Button size="lg" onClick={onSend} disabled={reason !== null} aria-describedby={reason ? "send-reason" : undefined}>
              <SendIcon aria-hidden />
              {sendable === 1 ? "Send file" : `Send ${sendable} files`}
            </Button>
            {reason ? (
              <p id="send-reason" className="text-center text-xs text-muted-foreground sm:text-right">
                {reason}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
