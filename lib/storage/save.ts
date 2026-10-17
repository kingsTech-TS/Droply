// Hands a finished file to the user. Received files are untrusted: they are always saved as
// application/octet-stream under a sanitized name, never opened, previewed or rendered.
import { sanitizeFileName } from "@/lib/utils/sanitize-filename";

type SaveFilePicker = (options: { suggestedName?: string }) => Promise<{
  createWritable(): Promise<WritableStream<Uint8Array>>;
}>;

/** Must run inside a user gesture (the Save button click). */
export async function saveFile(file: Blob, rawName: string): Promise<"saved" | "cancelled"> {
  const name = sanitizeFileName(rawName);
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name });
      const writable = await handle.createWritable();
      // Streams from disk to disk; the file is never fully in memory.
      await file.stream().pipeTo(writable);
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Fall through to a normal download.
    }
  }
  const blob = file.type === "application/octet-stream" ? file : file.slice(0, file.size, "application/octet-stream");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "saved";
}
