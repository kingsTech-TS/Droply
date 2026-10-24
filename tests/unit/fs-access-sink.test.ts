import { describe, expect, it } from "vitest";
import { FsAccessSink, type DirectoryHandleLike } from "@/lib/storage/sinks/fs-access-sink";

/** An in-memory folder with the parts of the File System Access API the sink uses. */
function fakeFolder(existing: string[] = []): DirectoryHandleLike & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>(existing.map((name) => [name, new Uint8Array([1])]));
  return {
    files,
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!options?.create) throw new DOMException("missing", "NotFoundError");
        files.set(name, new Uint8Array());
      }
      return {
        createWritable: async () => {
          let data = new Uint8Array(files.get(name)!);
          return {
            write: async ({ position, data: chunk }: { position: number; data: Uint8Array }) => {
              const next = new Uint8Array(Math.max(data.length, position + chunk.length));
              next.set(data);
              next.set(chunk, position);
              data = next;
            },
            close: async () => void files.set(name, data),
            abort: async () => undefined,
          };
        },
      };
    },
    async removeEntry(name: string) {
      files.delete(name);
    },
  };
}

describe("FsAccessSink in the Droply folder", () => {
  it("never overwrites a file already there", async () => {
    const folder = fakeFolder(["photo.jpg", "photo (1).jpg"]);
    const sink = new FsAccessSink(folder, "photo.jpg");
    await sink.write(0, 0, new Uint8Array([7, 8, 9]));
    await sink.finalize();
    expect([...folder.files.keys()].sort()).toEqual(["photo (1).jpg", "photo (2).jpg", "photo.jpg"]);
    expect([...folder.files.get("photo (2).jpg")!]).toEqual([7, 8, 9]);
    expect([...folder.files.get("photo.jpg")!]).toEqual([1]); // untouched
  });

  it("gives two same-named files arriving together different names", async () => {
    const folder = fakeFolder();
    const a = new FsAccessSink(folder, "IMG_0001.jpg");
    const b = new FsAccessSink(folder, "IMG_0001.jpg");
    await Promise.all([a.write(0, 0, new Uint8Array([1])), b.write(0, 0, new Uint8Array([2]))]);
    await Promise.all([a.finalize(), b.finalize()]);
    expect([...folder.files.keys()].sort()).toEqual(["IMG_0001 (1).jpg", "IMG_0001.jpg"]);
  });

  it("removes only its own file when a transfer is discarded", async () => {
    const folder = fakeFolder(["report.pdf"]);
    const sink = new FsAccessSink(folder, "report.pdf");
    await sink.write(0, 0, new Uint8Array([5]));
    await sink.discard();
    expect([...folder.files.keys()]).toEqual(["report.pdf"]);
  });
});
