// Files picked on the landing page before a room exists. They are carried to the room page
// in memory (a client-side navigation keeps this module alive) and never serialized.

let pending: File[] = [];

export function setPendingFiles(files: File[]): void {
  pending = files;
}

export function takePendingFiles(): File[] {
  const files = pending;
  pending = [];
  return files;
}
