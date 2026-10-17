import { formatBytes } from "@/lib/utils/format";
import { FileItem, type SelectedFileMeta } from "./file-item";

const VISIBLE = 50;

export function FileList({ files, onRemove }: { files: SelectedFileMeta[]; onRemove: (id: string) => void }) {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const hidden = Math.max(0, files.length - VISIBLE);
  return (
    <section aria-labelledby="files-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="files-heading" className="font-semibold">
          Files ready to send
        </h3>
        <p className="text-sm text-muted-foreground">
          {files.length === 1 ? "1 file" : `${files.length} files`} · {formatBytes(total)}
        </p>
      </div>
      <ul className="mt-2 max-h-72 divide-y overflow-y-auto pr-1">
        {files.slice(0, VISIBLE).map((file) => (
          <FileItem key={file.id} file={file} onRemove={() => onRemove(file.id)} />
        ))}
      </ul>
      {hidden > 0 ? <p className="mt-2 text-sm text-muted-foreground">and {hidden} more</p> : null}
    </section>
  );
}
