// Collects File objects from a drop, including the contents of dropped folders where the
// browser supports directory entries. Files are never read here; they stay as File objects.

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface FileEntryLike extends EntryLike {
  file(success: (file: File) => void, error: (err: unknown) => void): void;
}

interface DirectoryEntryLike extends EntryLike {
  createReader(): { readEntries(success: (entries: EntryLike[]) => void, error: (err: unknown) => void): void };
}

const MAX_FILES = 5000;

function readFile(entry: FileEntryLike): Promise<File | null> {
  return new Promise((resolve) => entry.file(resolve, () => resolve(null)));
}

async function readDirectory(entry: DirectoryEntryLike, out: File[]): Promise<void> {
  const reader = entry.createReader();
  // readEntries returns results in batches until it returns an empty array.
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (batch.length === 0) return;
    for (const child of batch) {
      if (out.length >= MAX_FILES) return;
      await readEntry(child, out);
    }
  }
}

async function readEntry(entry: EntryLike, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await readFile(entry as FileEntryLike);
    if (file) out.push(file);
  } else if (entry.isDirectory) {
    await readDirectory(entry as DirectoryEntryLike, out);
  }
}

export async function collectDroppedFiles(data: DataTransfer): Promise<File[]> {
  const items = Array.from(data.items ?? []);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null);
  if (entries.length > 0 && entries.every((e) => e !== null)) {
    const out: File[] = [];
    for (const entry of entries) {
      if (entry) await readEntry(entry, out);
    }
    return out;
  }
  // No entry API: plain files only (dropped folders show up as empty entries and are skipped).
  return Array.from(data.files).filter((file) => file.size > 0 || file.type !== "");
}

export function supportsFolderSelection(): boolean {
  if (typeof document === "undefined") return false;
  return "webkitdirectory" in document.createElement("input");
}
