import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils/format";
import { FileIcon } from "./file-icon";

export interface SelectedFileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Folder inside a selected folder ("photos/2026"), if any. */
  folder?: string | null;
}

export function FileItem({ file, onRemove }: { file: SelectedFileMeta; onRemove?: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-3 py-2">
      <FileIcon name={file.name} mimeType={file.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.folder ? `${file.folder}/${file.name}` : file.name}>
          {file.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {file.size === 0 ? "Empty file (can't be sent)" : formatBytes(file.size)}
          {file.folder ? ` · ${file.folder}` : ""}
        </p>
      </div>
      {onRemove ? (
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${file.name}`}>
          <XIcon aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}
