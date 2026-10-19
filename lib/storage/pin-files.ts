// Phones hand the page temporary copies of files picked from the photo gallery, and can drop
// them while the page waits: a receiver choosing a folder and confirming the permission, the
// screen locking, the app going to the background. Reading would then fail ("NotReadableError")
// and the file could only be sent after picking it again. Copying small picked files into
// memory right away keeps them sendable. Large files (videos) keep the original reference.
import type { MemoryClass } from "@/lib/device/memory";

const MiB = 1024 * 1024;
/** Copies made here, so a file isn't copied twice (picked, then sent). */
const pinned = new WeakSet<File>();

export const PIN_LIMITS: Record<MemoryClass, { perFile: number; total: number }> = {
  normal: { perFile: 64 * MiB, total: 512 * MiB },
  constrained: { perFile: 32 * MiB, total: 256 * MiB },
  low: { perFile: 16 * MiB, total: 96 * MiB },
};

/**
 * Returns the files with small ones copied into memory (same name, type and date). A file that
 * can't be read keeps its original reference, so sending reports the problem as usual.
 */
export async function pinFiles(files: readonly File[], limits: { perFile: number; total: number }): Promise<File[]> {
  let used = 0;
  const out: File[] = [];
  for (const file of files) {
    // Files from a selected folder carry their folder path, which a copy would lose.
    const inFolder = Boolean((file as File & { webkitRelativePath?: string }).webkitRelativePath);
    if (pinned.has(file) || inFolder || file.size === 0 || file.size > limits.perFile || used + file.size > limits.total) {
      out.push(file);
      continue;
    }
    try {
      const copy = new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
      used += file.size;
      pinned.add(copy);
      out.push(copy);
    } catch {
      out.push(file);
    }
  }
  return out;
}
