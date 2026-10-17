import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon as GenericFileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  PresentationIcon,
  type LucideIcon,
} from "lucide-react";
import { fileKind, type FileKind } from "@/lib/utils/file-kind";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<FileKind, LucideIcon> = {
  video: FileVideoIcon,
  image: FileImageIcon,
  audio: FileAudioIcon,
  archive: FileArchiveIcon,
  pdf: FileTextIcon,
  document: FileTextIcon,
  spreadsheet: FileSpreadsheetIcon,
  presentation: PresentationIcon,
  code: FileCodeIcon,
  other: GenericFileIcon,
};

export function FileIcon({ name, mimeType, className }: { name: string; mimeType: string; className?: string }) {
  const Icon = ICONS[fileKind(name, mimeType)];
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground", className)}
    >
      <Icon className="size-5" />
    </span>
  );
}
