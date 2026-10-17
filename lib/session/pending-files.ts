// Files (and text) picked before a room exists: from the landing page or from another app's
// share sheet. They are carried to the room page in memory (a client-side navigation keeps
// this module alive) and never serialized or uploaded.

let pending: File[] = [];
let pendingText: string | null = null;

export function setPendingFiles(files: File[]): void {
  pending = files;
}

export function takePendingFiles(): File[] {
  const files = pending;
  pending = [];
  return files;
}

export function setPendingText(text: string | null): void {
  pendingText = text && text.trim() ? text : null;
}

export function takePendingText(): string | null {
  const text = pendingText;
  pendingText = null;
  return text;
}
